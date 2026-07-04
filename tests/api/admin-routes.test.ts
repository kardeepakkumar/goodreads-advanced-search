import { describe, it, expect, vi, beforeEach, beforeAll, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { ObjectId, Int32 } from 'mongodb'
import { GET as jobsGET, POST as jobsPOST } from '@/app/api/admin/jobs/route'
import { GET as configGET, PUT as configPUT } from '@/app/api/admin/config/route'
import { POST as tickPOST } from '@/app/api/admin/tick/route'
import { GET as logsGET } from '@/app/api/admin/logs/route'
import { getDb } from '@/lib/mongodb'
import { runOneTick } from '@/lib/ticker'
import { makeDb, makeCollection, makeCursor, type MockCollection, type MockDb } from '../helpers/mockDb'
import { loginAndGetCookie, requestWithCookie } from '../helpers/adminSession'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))
vi.mock('@/lib/ticker', () => ({ runOneTick: vi.fn() }))
vi.mock('@/lib/autoTicker', () => ({ recentLogs: ['[10:00:00 AM] line1', '[10:00:05 AM] line2'] }))

let cookie: string

beforeAll(async () => {
  cookie = await loginAndGetCookie()
})

function authed(url: string, init?: RequestInit) {
  return requestWithCookie(url, cookie, init)
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
}

describe('admin route guards', () => {
  it('every admin endpoint rejects requests without a session with 401', async () => {
    const bare = (url: string, init?: RequestInit) => new NextRequest(url, init as never)

    const responses = await Promise.all([
      jobsGET(bare('http://localhost/api/admin/jobs')),
      jobsPOST(bare('http://localhost/api/admin/jobs', jsonInit('POST', { genre: 'fantasy' }))),
      configGET(bare('http://localhost/api/admin/config')),
      configPUT(bare('http://localhost/api/admin/config', jsonInit('PUT', { goodreadsCookie: 'c', rateLimitMs: 1 }))),
      tickPOST(bare('http://localhost/api/admin/tick', { method: 'POST' })),
      logsGET(bare('http://localhost/api/admin/logs')),
    ])

    for (const res of responses) {
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    }
  })
})

describe('GET/POST /api/admin/jobs', () => {
  let scrapeJobs: MockCollection
  let genres: MockCollection
  let db: MockDb

  beforeEach(() => {
    scrapeJobs = makeCollection()
    genres = makeCollection()
    db = makeDb({ scrapeJobs, genres })
    ;(getDb as Mock).mockResolvedValue(db)
  })

  it('lists the most recent jobs first', async () => {
    const jobs = [{ _id: 'b', genre: 'magic' }, { _id: 'a', genre: 'fantasy' }]
    const cursor = makeCursor(jobs)
    scrapeJobs.find.mockReturnValue(cursor)

    const res = await jobsGET(authed('http://localhost/api/admin/jobs'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ jobs })
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(cursor.limit).toHaveBeenCalledWith(100)
  })

  it('requires a string genre', async () => {
    const missing = await jobsPOST(authed('http://localhost/api/admin/jobs', jsonInit('POST', {})))
    expect(missing.status).toBe(400)
    expect(await missing.json()).toEqual({ error: 'genre is required' })

    const wrongType = await jobsPOST(authed('http://localhost/api/admin/jobs', jsonInit('POST', { genre: 42 })))
    expect(wrongType.status).toBe(400)
  })

  it('rejects a duplicate active job with 409 unless override is set', async () => {
    scrapeJobs.findOne.mockResolvedValue({ _id: 'existing', genre: 'fantasy', status: 'running' })

    const dup = await jobsPOST(authed('http://localhost/api/admin/jobs', jsonInit('POST', { genre: 'fantasy' })))
    expect(dup.status).toBe(409)
    expect(await dup.json()).toEqual({ error: 'Job already active for this genre' })
    expect(scrapeJobs.findOne).toHaveBeenCalledWith({ genre: 'fantasy', status: { $in: ['queued', 'running'] } })
    expect(scrapeJobs.insertOne).not.toHaveBeenCalled()

    const forced = await jobsPOST(
      authed('http://localhost/api/admin/jobs', jsonInit('POST', { genre: 'fantasy', override: true }))
    )
    expect(forced.status).toBe(200)
    expect(scrapeJobs.insertOne).toHaveBeenCalledTimes(1)
  })

  it('creates a queued job with schema-safe BSON types and registers the genre', async () => {
    const res = await jobsPOST(
      authed('http://localhost/api/admin/jobs', jsonInit('POST', { genre: 'fantasy', startPage: 2, maxPage: 9 }))
    )
    expect(res.status).toBe(200)

    const doc = scrapeJobs.insertOne.mock.calls[0][0]
    expect(doc._id).toBeInstanceOf(ObjectId)
    expect(doc.genre).toBe('fantasy')
    expect(doc.status).toBe('queued')
    expect(doc.startPage).toBeInstanceOf(Int32)
    expect(doc.startPage.value).toBe(2)
    expect(doc.currentPage.value).toBe(2) // starts at startPage
    expect(doc.maxPage.value).toBe(9)
    expect(doc.pagesScraped.value).toBe(0)
    expect(doc.schemaVersion).toBeInstanceOf(Int32)
    expect(doc.createdAt).toBeInstanceOf(Date)
    expect(doc.updatedAt).toBeInstanceOf(Date)
    expect(doc.lastRequestAt).toBeNull()
    expect(doc.error).toBeNull()

    // Genre registration is an idempotent upsert that only writes on insert.
    const [filter, update, opts] = genres.updateOne.mock.calls[0]
    expect(filter).toEqual({ _id: 'fantasy' })
    expect(update.$setOnInsert._id).toBe('fantasy')
    expect(update.$setOnInsert.schemaVersion).toBeInstanceOf(Int32)
    expect(opts).toEqual({ upsert: true })
  })

  it('defaults startPage=1 and maxPage=20', async () => {
    await jobsPOST(authed('http://localhost/api/admin/jobs', jsonInit('POST', { genre: 'x' })))
    const doc = scrapeJobs.insertOne.mock.calls[0][0]
    expect(doc.startPage.value).toBe(1)
    expect(doc.currentPage.value).toBe(1)
    expect(doc.maxPage.value).toBe(20)
    expect(doc.override).toBe(false)
  })
})

describe('GET/PUT /api/admin/config', () => {
  let appConfig: MockCollection

  beforeEach(() => {
    appConfig = makeCollection()
    ;(getDb as Mock).mockResolvedValue(makeDb({ appConfig }))
  })

  it('returns the singleton config, or 404 when missing', async () => {
    appConfig.findOne.mockResolvedValue({ _id: 'global', goodreadsCookie: 'ck', rateLimitMs: 10000 })
    const res = await configGET(authed('http://localhost/api/admin/config'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ goodreadsCookie: 'ck', rateLimitMs: 10000 })

    appConfig.findOne.mockResolvedValue(null)
    const missing = await configGET(authed('http://localhost/api/admin/config'))
    expect(missing.status).toBe(404)
  })

  it('validates the payload shape', async () => {
    const bad = await configPUT(
      authed('http://localhost/api/admin/config', jsonInit('PUT', { goodreadsCookie: 'c', rateLimitMs: 'fast' }))
    )
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'Invalid payload' })
    expect(appConfig.updateOne).not.toHaveBeenCalled()
  })

  it('upserts the config with BSON-typed fields (Int32 rate limit, Date timestamp)', async () => {
    const res = await configPUT(
      authed('http://localhost/api/admin/config', jsonInit('PUT', { goodreadsCookie: 'new-cookie', rateLimitMs: 5000 }))
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const [filter, update, opts] = appConfig.updateOne.mock.calls[0]
    expect(filter).toEqual({ _id: 'global' })
    expect(update.$set.goodreadsCookie).toBe('new-cookie')
    expect(update.$set.rateLimitMs).toBeInstanceOf(Int32)
    expect(update.$set.rateLimitMs.value).toBe(5000)
    expect(update.$set.updatedAt).toBeInstanceOf(Date)
    expect(opts).toEqual({ upsert: true })
  })
})

describe('POST /api/admin/tick', () => {
  it('passes the tick result through verbatim', async () => {
    const tickResult = { status: 'ok', booksProcessed: 50, jobId: 'j1', genre: 'fantasy', currentPage: 2 }
    ;(runOneTick as Mock).mockResolvedValue(tickResult)

    const res = await tickPOST(authed('http://localhost/api/admin/tick', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(tickResult)
  })

  it('reports tick crashes as an error status (still HTTP 200)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(runOneTick as Mock).mockRejectedValue(new Error('boom'))

    const res = await tickPOST(authed('http://localhost/api/admin/tick', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'error', message: 'Internal server error' })
  })
})

describe('GET /api/admin/logs', () => {
  it('returns the shared in-memory log buffer', async () => {
    const res = await logsGET(authed('http://localhost/api/admin/logs'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ logs: ['[10:00:00 AM] line1', '[10:00:05 AM] line2'] })
  })
})
