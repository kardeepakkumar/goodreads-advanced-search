// /api/genres behavior when genre merges exist. The no-alias behavior is
// covered by genres.route.test.ts and must stay identical.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { GET } from '@/app/api/genres/route'
import { getDb } from '@/lib/mongodb'
import { makeDb, makeCollection, makeCursor, type MockCollection } from '../helpers/mockDb'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

describe('GET /api/genres with genre merges', () => {
  let genres: MockCollection
  let genreAliases: MockCollection

  beforeEach(() => {
    genres = makeCollection()
    genreAliases = makeCollection()
    ;(getDb as Mock).mockResolvedValue(makeDb({ genres, genreAliases }))
  })

  it('replaces merged-away tags with their canonical, sorted and deduped', async () => {
    genres.find.mockReturnValue(
      makeCursor([{ _id: 'fantasy' }, { _id: 'science-fiction' }, { _id: 'scifi' }, { _id: 'war' }])
    )
    genreAliases.find.mockReturnValue(
      makeCursor([
        { _id: 'science-fiction', canonical: 'sci-fi' },
        { _id: 'scifi', canonical: 'sci-fi' },
      ])
    )

    const res = await GET()
    expect(res.status).toBe(200)
    // 'sci-fi' appears even though it was never an original genre —
    // it exists purely as a merge target.
    expect(await res.json()).toEqual({ genres: ['fantasy', 'sci-fi', 'war'] })
  })

  it('lists a canonical once when it is also an original genre', async () => {
    genres.find.mockReturnValue(makeCursor([{ _id: 'sci-fi' }, { _id: 'science-fiction' }]))
    genreAliases.find.mockReturnValue(
      makeCursor([{ _id: 'science-fiction', canonical: 'sci-fi' }])
    )

    const res = await GET()
    expect(await res.json()).toEqual({ genres: ['sci-fi'] })
  })
})
