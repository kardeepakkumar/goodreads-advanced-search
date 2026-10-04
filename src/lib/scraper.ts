// Scrapes one page of a Goodreads shelf and upserts books into MongoDB.
// Adapted from the verified TypeScript POC.

import axios from 'axios'
import * as cheerio from 'cheerio'
import { Int32 } from 'mongodb'
import { getDb } from './mongodb'
import { isSafeGenreKey } from './shelfFields'

const GOODREADS_ORIGIN = 'https://www.goodreads.com'
const SHELF_BASE = 'https://www.goodreads.com/shelf/show/'
const PAGE_SIZE = 50

export interface ScrapeResult {
  booksProcessed: number
  reachedEnd: boolean
  missingRatings: number
}

interface ParsedBook {
  goodreadsUrl: string
  title: string
  author: string
  avgRating: number | null
  numRatings: number | null
  publishedYear: number | null
  coverUrl: string | null
  authorUrl: string | null
  shelvedCount: number | null
}

// Absolute URL for an href/src found on the page (relative, protocol-relative
// or absolute), or null when it can't be parsed.
function absoluteUrl(href: string | undefined): string | null {
  if (!href) return null
  try {
    return new URL(href, GOODREADS_ORIGIN).href
  } catch {
    return null
  }
}

export async function scrapeShelfPage(
  genre: string,
  page: number,
  goodreadsCookie: string
): Promise<ScrapeResult> {
  const url = `${SHELF_BASE}${encodeURIComponent(genre)}?page=${page}`

  const response = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Cookie: goodreadsCookie,
    },
    timeout: 30000,
  })

  const $ = cheerio.load(response.data)
  const books: ParsedBook[] = []

  $('.leftContainer .elementList').each((_i, el) => {
    const entry = $(el)
    const titleEl = entry.find('.bookTitle')
    const authorEl = entry.find('.authorName')
    const ratingEl = entry.find('.greyText.smallText')

    const href = titleEl.attr('href')
    if (!href) return

    const goodreadsUrl = href.startsWith('http') ? href : `https://www.goodreads.com${href}`
    const title = titleEl.text().trim()
    const author = authorEl.text().trim()

    const ratingText = ratingEl.text().trim()
    // "avg rating 3.68 — 7,380,157 ratings — published 2005"
    const avgRatingMatch = ratingText.match(/avg\s+rating\s+([\d.]+)/)
    const numRatingsMatch = ratingText.match(/([\d,]+)\s+ratings/)
    const publishedMatch = ratingText.match(/published\s+(-?\d+)/)

    // "(shelved 90719 times as fantasy)" — a bare text node in the left column
    const shelvedMatch = (entry.find('.left').text() || entry.text()).match(/shelved\s+([\d,]+)\s+times?\b/)

    const avgRating = avgRatingMatch ? parseFloat(avgRatingMatch[1]) : null
    const numRatings = numRatingsMatch
      ? parseInt(numRatingsMatch[1].replace(/,/g, ''), 10)
      : null

    if (goodreadsUrl && title) {
      books.push({
        goodreadsUrl,
        title,
        author,
        avgRating,
        numRatings,
        publishedYear: publishedMatch ? parseInt(publishedMatch[1], 10) : null,
        coverUrl: absoluteUrl(entry.find('.leftAlignedImage img, .left img').first().attr('src')),
        authorUrl: absoluteUrl(authorEl.first().attr('href')),
        shelvedCount: shelvedMatch ? parseInt(shelvedMatch[1].replace(/,/g, ''), 10) : null,
      })
    }
  })

  if (books.length === 0) {
    return { booksProcessed: 0, reachedEnd: true, missingRatings: 0 }
  }

  const missingRatings = books.filter(b => b.avgRating === null || b.numRatings === null).length

  // Shelved counts are per genre: this page's count lands under its own key.
  const shelvedKey = isSafeGenreKey(genre) ? `shelvedCounts.${genre}` : null

  // Upsert books — add genre to genres array, update rating fields, set base fields only on insert
  const db = await getDb()
  const col = db.collection('books')
  const now = new Date()
  const ops = books.map((b) => {
    const $set: Record<string, any> = { updatedAt: now }
    if (b.avgRating !== null) $set.avgRating = b.avgRating
    if (b.numRatings !== null) $set.numRatings = new Int32(b.numRatings)

    // Shelf fields (scraper v2) are refreshed on every scrape like the ratings,
    // which is also how the re-scrape migration fills them in on existing books.
    // A value missing from the page never overwrites one stored earlier.
    if (b.publishedYear !== null) $set.publishedYear = new Int32(b.publishedYear)
    if (b.coverUrl !== null) $set.coverUrl = b.coverUrl
    if (b.authorUrl !== null) $set.authorUrl = b.authorUrl
    if (b.shelvedCount !== null && shelvedKey) $set[shelvedKey] = new Int32(b.shelvedCount)

    // $setOnInsert only runs on insert — provides valid defaults so the document
    // always satisfies the schema even when ratings couldn't be parsed.
    // avgRating/numRatings are NOT included here when parseable, because $set
    // already covers them (and having both would conflict on the same field).
    const $setOnInsert: Record<string, any> = {
      goodreadsUrl: b.goodreadsUrl,
      title: b.title,
      author: b.author,
      firstSeenGenre: genre,
      schemaVersion: new Int32(1),
      createdAt: now,
    }
    if (b.avgRating === null) $setOnInsert.avgRating = 0
    if (b.numRatings === null) $setOnInsert.numRatings = new Int32(0)

    return {
      updateOne: {
        filter: { goodreadsUrl: b.goodreadsUrl },
        update: { $setOnInsert, $addToSet: { genres: genre, genresAutocomplete: genre }, $set },
        upsert: true,
      },
    }
  })

  try {
    await col.bulkWrite(ops, { ordered: false })
  } catch (err: any) {
    // ordered:false — all valid docs were written; only log the failures, don't crash.
    // A page where *nothing* could be written (e.g. a collection validator that
    // predates the fields above) fails instead, so the job doesn't advance past
    // books that never landed.
    if (err.name === 'MongoBulkWriteError') {
      const failed = Array.isArray(err.writeErrors) ? err.writeErrors.length : err.writeErrors ? 1 : 0
      console.error(`[scraper] ${genre} p${page}: ${ops.length - failed} written, ${failed} failed`)
      if (failed >= ops.length) {
        throw new Error(`All ${ops.length} book writes failed on page ${page}: ${err.message}`)
      }
    } else {
      throw err
    }
  }

  const reachedEnd = books.length < PAGE_SIZE
  return { booksProcessed: books.length, reachedEnd, missingRatings }
}
