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
})
