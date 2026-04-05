// Scrapes one page of a Goodreads shelf and upserts books into MongoDB.
// Adapted from the verified TypeScript POC.

import axios from 'axios'
import * as cheerio from 'cheerio'
import { Int32 } from 'mongodb'
import { getDb } from './mongodb'

const SHELF_BASE = 'https://www.goodreads.com/shelf/show/'
const PAGE_SIZE = 50

export interface ScrapeResult {
  booksProcessed: number
  reachedEnd: boolean
  missingRatings: number
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
  const books: object[] = []

  $('.leftContainer .elementList').each((_i, el) => {
    const titleEl = $(el).find('.bookTitle')
    const authorEl = $(el).find('.authorName')
    const ratingEl = $(el).find('.greyText.smallText')

    const href = titleEl.attr('href')
    if (!href) return

    const goodreadsUrl = href.startsWith('http') ? href : `https://www.goodreads.com${href}`
    const title = titleEl.text().trim()
    const author = authorEl.text().trim()

    const ratingText = ratingEl.text().trim()
    // "avg rating 3.68 — 7,380,157 ratings — published 2005"
    const avgRatingMatch = ratingText.match(/avg\s+rating\s+([\d.]+)/)
    const numRatingsMatch = ratingText.match(/([\d,]+)\s+ratings/)

    const avgRating = avgRatingMatch ? parseFloat(avgRatingMatch[1]) : null
    const numRatings = numRatingsMatch
      ? parseInt(numRatingsMatch[1].replace(/,/g, ''), 10)
      : null

    if (goodreadsUrl && title) {
      books.push({ goodreadsUrl, title, author, avgRating, numRatings, genre })
    }
  })

  if (books.length === 0) {
    return { booksProcessed: 0, reachedEnd: true, missingRatings: 0 }
  }

  const missingRatings = (books as any[]).filter(b => b.avgRating === null || b.numRatings === null).length

  // Upsert books — add genre to genres array, update rating fields, set base fields only on insert
  const db = await getDb()
  const col = db.collection('books')
  const now = new Date()
  const ops = books.map((b: any) => {
    const $set: Record<string, any> = { updatedAt: now }
    if (b.avgRating !== null) $set.avgRating = b.avgRating
    if (b.numRatings !== null) $set.numRatings = new Int32(b.numRatings)

    // $setOnInsert only runs on insert — provides valid defaults so the document
    // always satisfies the schema even when ratings couldn't be parsed.
    // avgRating/numRatings are NOT included here when parseable, because $set
    // already covers them (and having both would conflict on the same field).
    const $setOnInsert: Record<string, any> = {
      goodreadsUrl: b.goodreadsUrl,
      title: b.title,
      author: b.author,
      firstSeenGenre: b.genre,
      schemaVersion: new Int32(1),
      createdAt: now,
    }
    if (b.avgRating === null) $setOnInsert.avgRating = 0
    if (b.numRatings === null) $setOnInsert.numRatings = new Int32(0)

    return {
      updateOne: {
        filter: { goodreadsUrl: b.goodreadsUrl },
        update: { $setOnInsert, $addToSet: { genres: b.genre, genresAutocomplete: b.genre }, $set },
        upsert: true,
      },
    }
  })

  try {
    await col.bulkWrite(ops, { ordered: false })
  } catch (err: any) {
    // ordered:false — all valid docs were written; only log the failures, don't crash
    if (err.name === 'MongoBulkWriteError') {
      console.error(`[scraper] ${genre} p${page}: ${err.result?.nInserted ?? 0} inserted, ${err.writeErrors?.length ?? '?'} failed`)
    } else {
      throw err
    }
  }

  const reachedEnd = books.length < PAGE_SIZE
  return { booksProcessed: books.length, reachedEnd, missingRatings }
}
