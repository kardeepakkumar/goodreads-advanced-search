import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { GET } from '@/app/api/genres/route'
import { getDb } from '@/lib/mongodb'
import { makeDb, makeCollection, makeCursor, type MockCollection } from '../helpers/mockDb'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

describe('GET /api/genres', () => {
  let genres: MockCollection

  beforeEach(() => {
    genres = makeCollection()
    ;(getDb as Mock).mockResolvedValue(makeDb({ genres }))
  })

  it('returns the alphabetically sorted genre ids', async () => {
    const cursor = makeCursor([{ _id: 'fantasy' }, { _id: 'magic' }, { _id: 'war' }])
    genres.find.mockReturnValue(cursor)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ genres: ['fantasy', 'magic', 'war'] })
    expect(cursor.sort).toHaveBeenCalledWith({ _id: 1 })
  })

  it('returns 500 with a generic error body when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(getDb as Mock).mockRejectedValue(new Error('down'))

    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})
