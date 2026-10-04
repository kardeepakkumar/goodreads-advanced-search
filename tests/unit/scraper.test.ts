import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import axios from 'axios'
import { Int32 } from 'mongodb'
import { scrapeShelfPage } from '@/lib/scraper'
import { getDb } from '@/lib/mongodb'
import { makeDb, makeCollection, type MockCollection } from '../helpers/mockDb'
import { shelfPageHtml, fullShelfPage } from '../helpers/shelfHtml'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

const axiosGet = axios.get as Mock

describe('scrapeShelfPage', () => {
  let books: MockCollection

  beforeEach(() => {
    books = makeCollection()
    ;(getDb as Mock).mockResolvedValue(makeDb({ books }))
  })

  function stubPage(html: string) {
    axiosGet.mockResolvedValue({ data: html })
  }

  it('requests the shelf URL with page, cookie, UA and timeout', async () => {
    stubPage(shelfPageHtml([]))
    await scrapeShelfPage('science fiction', 3, 'sess=abc123')

    expect(axiosGet).toHaveBeenCalledTimes(1)
    const [url, opts] = axiosGet.mock.calls[0]
    expect(url).toBe('https://www.goodreads.com/shelf/show/science%20fiction?page=3')
    expect(opts.headers.Cookie).toBe('sess=abc123')
    expect(opts.headers['User-Agent']).toContain('Mozilla/5.0')
    expect(opts.timeout).toBe(30000)
  })

  it('parses title, author, rating and ratings count from the current shelf markup', async () => {
    stubPage(
      shelfPageHtml([
        {
          href: 'https://www.goodreads.com/book/show/1.Harry_Potter',
          title: "Harry Potter and the Philosopher's Stone",
          author: 'J.K. Rowling',
          ratingText: 'avg rating 4.46 — 3,340,258 ratings — published 1997',
        },
      ])
    )

    const result = await scrapeShelfPage('fantasy', 1, '')
    expect(result).toEqual({ booksProcessed: 1, reachedEnd: true, missingRatings: 0 })

    const [ops, opts] = books.bulkWrite.mock.calls[0]
    expect(opts).toEqual({ ordered: false })
    expect(ops).toHaveLength(1)

    const { filter, update, upsert } = ops[0].updateOne
    expect(upsert).toBe(true)
    expect(filter).toEqual({ goodreadsUrl: 'https://www.goodreads.com/book/show/1.Harry_Potter' })

    expect(update.$set.avgRating).toBe(4.46)
    expect(update.$set.numRatings).toBeInstanceOf(Int32)
    expect(update.$set.numRatings.value).toBe(3340258)
    expect(update.$set.updatedAt).toBeInstanceOf(Date)

    expect(update.$setOnInsert.title).toBe("Harry Potter and the Philosopher's Stone")
    expect(update.$setOnInsert.author).toBe('J.K. Rowling')
    expect(update.$setOnInsert.firstSeenGenre).toBe('fantasy')
    expect(update.$setOnInsert.schemaVersion).toBeInstanceOf(Int32)
    expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date)
  })

  it('prefixes relative hrefs with the Goodreads origin', async () => {
    stubPage(
      shelfPageHtml([
        {
          href: '/book/show/5.Dune',
          title: 'Dune',
          author: 'Frank Herbert',
          ratingText: 'avg rating 4.27 — 1,234,567 ratings — published 1965',
        },
      ])
    )

    await scrapeShelfPage('scifi', 1, '')
    const [ops] = books.bulkWrite.mock.calls[0]
    expect(ops[0].updateOne.filter.goodreadsUrl).toBe('https://www.goodreads.com/book/show/5.Dune')
  })

  it('never puts the same rating field in both $set and $setOnInsert (schema path-conflict rule)', async () => {
    stubPage(
      shelfPageHtml([
        {
          href: '/book/show/1.A',
          title: 'Rated Book',
          author: 'A',
          ratingText: 'avg rating 3.68 — 7,380,157 ratings — published 2005',
        },
        { href: '/book/show/2.B', title: 'Unrated Book', author: 'B' },
      ])
    )

    const result = await scrapeShelfPage('fantasy', 1, '')
    expect(result.missingRatings).toBe(1)

    const [ops] = books.bulkWrite.mock.calls[0]
    const rated = ops[0].updateOne.update
    const unrated = ops[1].updateOne.update

    // Parsed ratings live in $set only.
    expect(rated.$set.avgRating).toBe(3.68)
    expect(rated.$setOnInsert).not.toHaveProperty('avgRating')
    expect(rated.$setOnInsert).not.toHaveProperty('numRatings')

    // Unparsed ratings get schema-safe defaults on insert only.
    expect(unrated.$set).not.toHaveProperty('avgRating')
    expect(unrated.$set).not.toHaveProperty('numRatings')
    expect(unrated.$setOnInsert.avgRating).toBe(0)
    expect(unrated.$setOnInsert.numRatings).toBeInstanceOf(Int32)
    expect(unrated.$setOnInsert.numRatings.value).toBe(0)
  })

  it('accumulates genres via $addToSet only — $setOnInsert must not touch them', async () => {
    stubPage(
      shelfPageHtml([
        {
          href: '/book/show/1.A',
          title: 'A',
          author: 'B',
          ratingText: 'avg rating 4.0 — 10 ratings — published 2000',
        },
      ])
    )

    await scrapeShelfPage('fantasy', 1, '')
    const [ops] = books.bulkWrite.mock.calls[0]
    const { update } = ops[0].updateOne

    expect(update.$addToSet).toEqual({ genres: 'fantasy', genresAutocomplete: 'fantasy' })
    expect(update.$setOnInsert).not.toHaveProperty('genres')
    expect(update.$setOnInsert).not.toHaveProperty('genresAutocomplete')
  })

  it('skips entries without an href and reports an empty page as the end of the shelf', async () => {
    stubPage(shelfPageHtml([{ title: 'No Link', author: 'X' }]))

    const result = await scrapeShelfPage('fantasy', 7, '')
    expect(result).toEqual({ booksProcessed: 0, reachedEnd: true, missingRatings: 0 })
    expect(books.bulkWrite).not.toHaveBeenCalled()
  })

  it('reports reachedEnd=false for a full 50-book page and true for a partial page', async () => {
    stubPage(shelfPageHtml(fullShelfPage('fantasy', 50)))
    const full = await scrapeShelfPage('fantasy', 1, '')
    expect(full.booksProcessed).toBe(50)
    expect(full.reachedEnd).toBe(false)

    stubPage(shelfPageHtml(fullShelfPage('fantasy', 49)))
    const partial = await scrapeShelfPage('fantasy', 2, '')
    expect(partial.booksProcessed).toBe(49)
    expect(partial.reachedEnd).toBe(true)
  })

  it('swallows partial bulkWrite failures (ordered:false) but rethrows other errors', async () => {
    stubPage(shelfPageHtml(fullShelfPage('fantasy', 2)))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const bulkErr = Object.assign(new Error('E11000'), {
      name: 'MongoBulkWriteError',
      result: { nInserted: 1 },
      writeErrors: [{}],
    })
    books.bulkWrite.mockRejectedValueOnce(bulkErr)
    await expect(scrapeShelfPage('fantasy', 1, '')).resolves.toMatchObject({ booksProcessed: 2 })
    expect(consoleErr).toHaveBeenCalled()

    books.bulkWrite.mockRejectedValueOnce(new Error('connection reset'))
    await expect(scrapeShelfPage('fantasy', 1, '')).rejects.toThrow('connection reset')
  })

  it('fails the page instead of advancing when every upsert is rejected (e.g. a stale validator)', async () => {
    stubPage(shelfPageHtml(fullShelfPage('fantasy', 2)))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const rejectedAll = Object.assign(new Error('Document failed validation'), {
      name: 'MongoBulkWriteError',
      result: { nInserted: 0 },
      writeErrors: [{}, {}],
    })
    books.bulkWrite.mockRejectedValueOnce(rejectedAll)
    await expect(scrapeShelfPage('fantasy', 4, '')).rejects.toThrow(
      'All 2 book writes failed on page 4: Document failed validation'
    )
  })
})

describe('scrapeShelfPage — shelf fields (scraper v2)', () => {
  let books: MockCollection

  beforeEach(() => {
    books = makeCollection()
    ;(getDb as Mock).mockResolvedValue(makeDb({ books }))
  })

  async function scrapeOne(book: Parameters<typeof shelfPageHtml>[0][number], genre = 'fantasy') {
    axiosGet.mockResolvedValue({ data: shelfPageHtml([book]) })
    await scrapeShelfPage(genre, 1, '')
    return books.bulkWrite.mock.calls[0][0][0].updateOne.update
  }

  it('captures published year, cover, author link and the shelf count, keyed by genre', async () => {
    const update = await scrapeOne({
      href: '/book/show/42844155-harry-potter-and-the-philosopher-s-stone',
      title: "Harry Potter and the Philosopher's Stone (Harry Potter, #1)",
      author: 'J.K. Rowling',
      authorHref: 'https://www.goodreads.com/author/show/1077326.J_K_Rowling',
      coverSrc:
        'https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1598823299l/42844155._SX50_.jpg',
      shelvedCount: 90719,
      ratingText: 'avg rating 4.47 — 11,851,697 ratings — published 1997',
    })

    expect(update.$set.publishedYear).toBeInstanceOf(Int32)
    expect(update.$set.publishedYear.value).toBe(1997)
    expect(update.$set.coverUrl).toBe(
      'https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1598823299l/42844155._SX50_.jpg'
    )
    expect(update.$set.authorUrl).toBe('https://www.goodreads.com/author/show/1077326.J_K_Rowling')
    expect(update.$set['shelvedCounts.fantasy']).toBeInstanceOf(Int32)
    expect(update.$set['shelvedCounts.fantasy'].value).toBe(90719)
  })

  it('writes shelf fields through $set only — that is how a re-scrape fills them into existing books', async () => {
    const update = await scrapeOne({
      href: '/book/show/1.A',
      title: 'A',
      author: 'B',
      coverSrc: 'https://i.gr-assets.com/a._SX50_.jpg',
      shelvedCount: 12,
      ratingText: 'avg rating 4.0 — 10 ratings — published 2000',
    })

    for (const field of ['publishedYear', 'coverUrl', 'authorUrl', 'shelvedCounts']) {
      expect(update.$setOnInsert).not.toHaveProperty(field)
    }
    // Genre accumulation is untouched by the new fields.
    expect(update.$addToSet).toEqual({ genres: 'fantasy', genresAutocomplete: 'fantasy' })
  })

  it('normalizes relative author links and parses BCE publication years', async () => {
    const update = await scrapeOne({
      href: '/book/show/1381.The_Odyssey',
      title: 'The Odyssey',
      author: 'Homer',
      authorHref: '/author/show/903.Homer',
      ratingText: 'avg rating 3.87 — 1,234,567 ratings — published -700',
    })

    expect(update.$set.authorUrl).toBe('https://www.goodreads.com/author/show/903.Homer')
    expect(update.$set.publishedYear.value).toBe(-700)
  })

  it('leaves out fields the page does not show, so a stored value is never overwritten', async () => {
    const update = await scrapeOne({
      href: '/book/show/2.B',
      title: 'No Extras',
      author: 'C',
      ratingText: 'avg rating 4.1 — 99 ratings',
    })

    expect(update.$set).not.toHaveProperty('publishedYear')
    expect(update.$set).not.toHaveProperty('coverUrl')
    expect(Object.keys(update.$set).some((k) => k.startsWith('shelvedCounts'))).toBe(false)
  })

  it('stores each shelf count under its own genre and skips slugs that cannot be field names', async () => {
    const shelved = {
      href: '/book/show/3.C',
      title: 'C',
      author: 'D',
      shelvedCount: 321,
      ratingText: 'avg rating 4.2 — 50 ratings — published 2010',
    }

    const ya = await scrapeOne(shelved, 'young-adult')
    expect(ya.$set['shelvedCounts.young-adult'].value).toBe(321)

    books.bulkWrite.mockClear()
    const dotted = await scrapeOne(shelved, 'sci.fi')
    expect(Object.keys(dotted.$set).some((k) => k.startsWith('shelvedCounts'))).toBe(false)
    expect(dotted.$set.publishedYear.value).toBe(2010) // other fields still land
  })
})
