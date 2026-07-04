import { describe, it, expect, vi, beforeEach, beforeAll, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { Int32 } from 'mongodb'
import { GET, POST, DELETE } from '@/app/api/admin/aliases/route'
import { getDb } from '@/lib/mongodb'
import { makeDb, makeCollection, makeCursor, type MockCollection } from '../helpers/mockDb'
import { loginAndGetCookie, requestWithCookie } from '../helpers/adminSession'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

let cookie: string

beforeAll(async () => {
  cookie = await loginAndGetCookie()
})

const ALIAS_DOCS = [
  { _id: 'science-fiction', canonical: 'sci-fi' },
  { _id: 'scifi', canonical: 'sci-fi' },
]

let genreAliases: MockCollection
let genres: MockCollection
let books: MockCollection

beforeEach(() => {
  genreAliases = makeCollection()
  genres = makeCollection()
  books = makeCollection()
  ;(getDb as Mock).mockResolvedValue(makeDb({ genreAliases, genres, books }))
})

function url(qs = '') {
  return `http://localhost/api/admin/aliases${qs}`
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
}

describe('auth guards', () => {
  it('rejects every method without a session', async () => {
    const responses = await Promise.all([
      GET(new NextRequest(url())),
      POST(new NextRequest(url(), jsonInit('POST', { from: 'a', into: 'b' }) as never)),
      DELETE(new NextRequest(url('?canonical=sci-fi'), { method: 'DELETE' } as never)),
    ])
    for (const res of responses) {
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'Unauthorized' })
    }
  })
})

describe('GET /api/admin/aliases — overview', () => {
  it('lists all original genres with counts, merge markers, and grouped merges with deduped counts', async () => {
    genreAliases.find.mockReturnValue(makeCursor(ALIAS_DOCS))
    // Registered genres include one with no books yet.
    genres.find.mockReturnValue(
      makeCursor([{ _id: 'fantasy' }, { _id: 'science-fiction' }, { _id: 'zero-books' }])
    )
    books.aggregate.mockImplementation((pipeline: Record<string, unknown>[]) => ({
      toArray: async () =>
        pipeline.some((s) => '$project' in s)
          ? [{ _id: 'sci-fi', count: 6 }] // canonical-group counts (deduped per book)
          : [
              // raw per-tag counts; 'stray-tag' is on books but never registered
              { _id: 'fantasy', count: 10 },
              { _id: 'science-fiction', count: 5 },
              { _id: 'scifi', count: 3 },
              { _id: 'stray-tag', count: 2 },
            ],
    }))

    const res = await GET(requestWithCookie(url(), cookie))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.originals).toEqual([
      { genre: 'fantasy', count: 10, mergedInto: null },
      { genre: 'science-fiction', count: 5, mergedInto: 'sci-fi' },
      { genre: 'scifi', count: 3, mergedInto: 'sci-fi' },
      { genre: 'stray-tag', count: 2, mergedInto: null },
      { genre: 'zero-books', count: 0, mergedInto: null },
    ])
    expect(body.merges).toEqual([
      { canonical: 'sci-fi', sources: ['science-fiction', 'scifi'], count: 6 },
    ])

    // The group-count aggregation restricts to the group's raw sources and
    // maps to canonicals before grouping — that mapping is what prevents a
    // both-tagged book from counting twice.
    const groupPipeline = books.aggregate.mock.calls
      .map((c) => c[0] as Record<string, any>[])
      .find((p) => p.some((s) => '$project' in s))!
    expect(groupPipeline[0]).toEqual({
      $match: { genres: { $in: ['sci-fi', 'science-fiction', 'scifi'] } },
    })
    expect(groupPipeline[1].$project.canon.$setUnion).toBeDefined()
  })

  it('returns empty merges and skips the group aggregation when nothing is merged', async () => {
    genres.find.mockReturnValue(makeCursor([{ _id: 'fantasy' }]))
    books.aggregate.mockImplementation(() => ({
      toArray: async () => [{ _id: 'fantasy', count: 10 }],
    }))

    const res = await GET(requestWithCookie(url(), cookie))
    const body = await res.json()
    expect(body.merges).toEqual([])
    expect(body.originals).toEqual([{ genre: 'fantasy', count: 10, mergedInto: null }])
    expect(books.aggregate).toHaveBeenCalledTimes(1) // raw counts only
  })
})

describe('POST /api/admin/aliases — merge', () => {
  it('validates the payload', async () => {
    for (const bad of [{}, { from: 'a' }, { into: 'b' }, { from: '  ', into: 'b' }]) {
      const res = await POST(requestWithCookie(url(), cookie, jsonInit('POST', bad)))
      expect(res.status).toBe(400)
    }

    const self = await POST(requestWithCookie(url(), cookie, jsonInit('POST', { from: 'sci-fi', into: 'sci-fi' })))
    expect(self.status).toBe(400)
    expect((await self.json()).error).toBe('Cannot merge a genre into itself')
  })

  it('refuses to create chains: merging into an already-merged genre is a 409', async () => {
    genreAliases.find.mockReturnValue(makeCursor(ALIAS_DOCS))

    const res = await POST(
      requestWithCookie(url(), cookie, jsonInit('POST', { from: 'space-opera', into: 'science-fiction' }))
    )
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('merge into "sci-fi" instead')
    expect(genreAliases.updateOne).not.toHaveBeenCalled()
  })

  it('creates a schema-safe alias doc; the target may not exist anywhere yet', async () => {
    const res = await POST(
      requestWithCookie(url(), cookie, jsonInit('POST', { from: ' science-fiction ', into: ' sci-fi ' }))
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, from: 'science-fiction', into: 'sci-fi', repointed: 0 })

    const [filter, update, opts] = genreAliases.updateOne.mock.calls[0]
    expect(filter).toEqual({ _id: 'science-fiction' })
    expect(update.$set.canonical).toBe('sci-fi')
    expect(update.$set.updatedAt).toBeInstanceOf(Date)
    expect(update.$setOnInsert.schemaVersion).toBeInstanceOf(Int32)
    expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date)
    expect(opts).toEqual({ upsert: true })
  })

  it('moves the whole group when the merged genre was itself a merge target', async () => {
    // sci-fi currently has two members; merging sci-fi into speculative moves them all.
    genreAliases.find.mockReturnValue(makeCursor(ALIAS_DOCS))
    genreAliases.updateMany.mockResolvedValue({ acknowledged: true, modifiedCount: 2 })

    const res = await POST(
      requestWithCookie(url(), cookie, jsonInit('POST', { from: 'sci-fi', into: 'speculative' }))
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, from: 'sci-fi', into: 'speculative', repointed: 2 })

    const [repointFilter, repointUpdate] = genreAliases.updateMany.mock.calls[0]
    expect(repointFilter).toEqual({ canonical: 'sci-fi' })
    expect(repointUpdate.$set.canonical).toBe('speculative')
    expect(genreAliases.updateOne.mock.calls[0][0]).toEqual({ _id: 'sci-fi' })
  })
})

describe('DELETE /api/admin/aliases — split', () => {
  it('requires the canonical param', async () => {
    const res = await DELETE(requestWithCookie(url(), cookie, { method: 'DELETE' }))
    expect(res.status).toBe(400)
  })

  it('releases every genre merged into the canonical', async () => {
    genreAliases.deleteMany.mockResolvedValue({ acknowledged: true, deletedCount: 2 })

    const res = await DELETE(requestWithCookie(url('?canonical=sci-fi'), cookie, { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, canonical: 'sci-fi', released: 2 })
    expect(genreAliases.deleteMany).toHaveBeenCalledWith({ canonical: 'sci-fi' })
  })

  it('404s for a name that is not a merged genre', async () => {
    const res = await DELETE(requestWithCookie(url('?canonical=nope'), cookie, { method: 'DELETE' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain('nope')
  })
})
