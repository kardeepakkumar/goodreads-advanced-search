import { describe, it, expect, vi, beforeAll, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { Int32 } from 'mongodb'
import { GET, POST } from '@/app/api/admin/backfill/route'
import { getDb } from '@/lib/mongodb'
import { makeCollection, makeCursor, makeDb, type MockCollection, type MockDb } from '../helpers/mockDb'
import { loginAndGetCookie, requestWithCookie } from '../helpers/adminSession'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

const ENDPOINT = 'http://localhost/api/admin/backfill'
let cookie: string

beforeAll(async () => {
  cookie = await loginAndGetCookie()
})

const get = () => GET(requestWithCookie(ENDPOINT, cookie))
const post = () => POST(requestWithCookie(ENDPOINT, cookie, { method: 'POST' }))

describe('/api/admin/backfill', () => {
  let books: MockCollection
  let genres: MockCollection
  let scrapeJobs: MockCollection
  let appConfig: MockCollection
  let db: MockDb

  beforeEach(() => {
    books = makeCollection()
    genres = makeCollection()
    scrapeJobs = makeCollection()
    appConfig = makeCollection()
    db = makeDb({ books, genres, scrapeJobs, appConfig })
    ;(getDb as Mock).mockResolvedValue(db)

    books.aggregate.mockReturnValue({
      toArray: async () => [
        {
          totals: [
            { _id: null, total: 3000, complete: 1250, publishedYear: 1260, coverUrl: 1300, authorUrl: 1300, shelvedCounts: 1300 },
          ],
          genres: [
            { _id: 'fantasy', books: 1250, withFields: 1250 }, // first scraped by v2
            { _id: 'horror', books: 1000, withFields: 0 }, // legacy, 30 pages deep
            { _id: 'magic', books: 750, withFields: 50 }, // v2 re-scrape failed early
          ],
        },
      ],
    })
    genres.find.mockReturnValue(makeCursor([{ _id: 'fantasy' }, { _id: 'horror' }, { _id: 'magic' }, { _id: 'poetry' }]))
    scrapeJobs.find.mockReturnValue(
      makeCursor([
        { genre: 'fantasy', status: 'done', startPage: 1, currentPage: 25, maxPage: 25, scraperVersion: 2, createdAt: '2026-10-01' },
        { genre: 'horror', status: 'done', startPage: 1, currentPage: 30, maxPage: 30, createdAt: '2026-01-01' },
        { genre: 'magic', status: 'done', startPage: 1, currentPage: 25, maxPage: 25, createdAt: '2026-01-01' },
        { genre: 'magic', status: 'failed', startPage: 1, currentPage: 2, maxPage: 25, scraperVersion: 2, createdAt: '2026-10-02' },
      ])
    )
    appConfig.findOne.mockResolvedValue({ rateLimitMs: 3000 })
  })

  it('rejects requests without a session', async () => {
    for (const handler of [GET, POST]) {
      const res = await handler(new NextRequest(ENDPOINT, { method: handler === POST ? 'POST' : 'GET' }))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    }
  })

  it('GET reports book field coverage, per-genre status and the re-scrape plan', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.books).toEqual({
      total: 3000,
      complete: 1250,
      incomplete: 1750,
      byField: { publishedYear: 1260, coverUrl: 1300, authorUrl: 1300, shelvedCounts: 1300 },
    })
    expect(body.genres).toEqual([
      { genre: 'fantasy', status: 'complete', books: 1250, booksWithFields: 1250, targetPages: 25 },
      { genre: 'horror', status: 'pending', books: 1000, booksWithFields: 0, targetPages: 30 },
      { genre: 'magic', status: 'failed', books: 750, booksWithFields: 50, targetPages: 25 },
      { genre: 'poetry', status: 'complete', books: 0, booksWithFields: 0, targetPages: 25 },
    ])
    expect(body.summary).toEqual({
      total: 4,
      complete: 2,
      rescraped: 0,
      active: 0,
      failed: 1,
      pending: 1,
      needsRescrape: 2,
      plannedPages: 55,
    })
    expect(body.rateLimitMs).toBe(3000)
    expect(body.schemaReady).toBe(true) // no validators in this mock DB
  })

  it('POST queues backfill jobs only for genres that need one, most books without fields first', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ queued: 2, genres: ['horror', 'magic'] })

    const [docs] = scrapeJobs.insertMany.mock.calls[0]
    expect(docs.map((d: any) => [d.genre, d.maxPage.value, d.kind, d.status])).toEqual([
      ['horror', 30, 'backfill', 'queued'],
      ['magic', 25, 'backfill', 'queued'],
    ])
    expect(docs[0].scraperVersion).toBeInstanceOf(Int32)
  })

  it('POST queues nothing once every genre is covered or busy', async () => {
    scrapeJobs.find.mockReturnValue(
      makeCursor([
        { genre: 'horror', status: 'running', startPage: 1, currentPage: 4, maxPage: 30, scraperVersion: 2, createdAt: '2026-10-03' },
        { genre: 'magic', status: 'done', startPage: 1, currentPage: 25, maxPage: 25, scraperVersion: 2, createdAt: '2026-10-03' },
      ])
    )

    const res = await post()
    expect(await res.json()).toEqual({ queued: 0, genres: [] })
    expect(scrapeJobs.insertMany).not.toHaveBeenCalled()
  })

  it('refuses with 409 while the validators predate the new fields, and GET flags it', async () => {
    db.listCollections.mockReturnValue({
      toArray: async () => [
        { name: 'books', options: { validator: { $jsonSchema: { properties: { title: {}, author: {} } } } } },
      ],
    })

    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/mongo-upgrade-shelf-fields\.js/)
    expect(scrapeJobs.insertMany).not.toHaveBeenCalled()

    expect((await (await get()).json()).schemaReady).toBe(false)
  })

  it('treats upgraded validators as ready', async () => {
    db.listCollections.mockReturnValue({
      toArray: async () => [
        {
          name: 'books',
          options: { validator: { $jsonSchema: { properties: { publishedYear: {}, coverUrl: {}, authorUrl: {}, shelvedCounts: {} } } } },
        },
        { name: 'scrapeJobs', options: { validator: { $jsonSchema: { properties: { scraperVersion: {}, kind: {} } } } } },
      ],
    })
    expect((await (await get()).json()).schemaReady).toBe(true)
  })
})
