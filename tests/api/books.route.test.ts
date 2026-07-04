import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/books/route'
import { getDb } from '@/lib/mongodb'
import { makeDb, makeCollection, type MockCollection } from '../helpers/mockDb'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

const SAMPLE_BOOKS = [
  {
    goodreadsUrl: 'https://www.goodreads.com/book/show/1',
    title: 'Dune',
    author: 'Frank Herbert',
    avgRating: 4.27,
    numRatings: 1234567,
    genres: ['scifi'],
  },
]

// The books pipeline is the one ending in $facet; the genre-facet pipeline
// uses $unwind/$group. Telling them apart lets tests pin each path.
function pipelinesOf(col: MockCollection) {
  const pipelines = col.aggregate.mock.calls.map((c) => c[0] as Record<string, unknown>[])
  return {
    books: pipelines.find((p) => p.some((s) => '$facet' in s))!,
    facets: pipelines.find((p) => p.some((s) => '$unwind' in s))!,
  }
}

describe('GET /api/books', () => {
  let books: MockCollection

  beforeEach(() => {
    books = makeCollection()
    books.aggregate.mockImplementation((pipeline: Record<string, unknown>[]) => ({
      toArray: async () =>
        pipeline.some((s) => '$facet' in s)
          ? [{ books: SAMPLE_BOOKS, total: [{ count: 42 }] }]
          : [
              { _id: 'fantasy', count: 7 },
              { _id: 'magic', count: 3 },
            ],
    }))
    books.countDocuments.mockResolvedValue(50000)
    ;(getDb as Mock).mockResolvedValue(makeDb({ books }))
  })

  async function run(query = '') {
    const res = await GET(new NextRequest(`http://localhost/api/books${query}`))
    return { res, body: await res.json() }
  }

  it('serves defaults through the plain aggregation path (no $search stage)', async () => {
    const { res, body } = await run()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      books: SAMPLE_BOOKS,
      total: 42,
      totalDataset: 50000,
      genreFacets: [
        { genre: 'fantasy', count: 7 },
        { genre: 'magic', count: 3 },
      ],
    })

    const { books: booksPipeline, facets } = pipelinesOf(books)
    expect(booksPipeline.some((s) => '$search' in s)).toBe(false)
    expect(booksPipeline[0]).toEqual({ $sort: { avgRating: -1 } })

    const facet = (booksPipeline.find((s) => '$facet' in s) as any).$facet
    expect(facet.books[0]).toEqual({ $skip: 0 })
    expect(facet.books[1]).toEqual({ $limit: 25 })
    expect(facet.books[2].$project._id).toBe(0)

    // No filters → facet pipeline starts straight at $unwind.
    expect(facets[0]).toEqual({ $unwind: '$genres' })
  })

  it('applies include/exclude genres and rating filters as a $match in both pipelines', async () => {
    const { res } = await run(
      '?genres=fantasy&genres=magic&excludeGenres=war&minRating=4&maxRating=4.8&minRatings=1000&sortBy=numRatings&sortDir=asc&page=3'
    )
    expect(res.status).toBe(200)

    const expectedMatch = {
      $and: [
        { genres: { $all: ['fantasy', 'magic'] } },
        { genres: { $ne: 'war' } },
        { avgRating: { $gte: 4, $lte: 4.8 } },
        { numRatings: { $gte: 1000 } },
      ],
    }

    const { books: booksPipeline, facets } = pipelinesOf(books)
    expect(booksPipeline[0]).toEqual({ $match: expectedMatch })
    expect(booksPipeline[1]).toEqual({ $sort: { numRatings: 1 } })
    expect(facets[0]).toEqual({ $match: expectedMatch })

    const facet = (booksPipeline.find((s) => '$facet' in s) as any).$facet
    expect(facet.books[0]).toEqual({ $skip: 50 }) // (page 3 - 1) * 25
  })

  it('switches to the Atlas Search path when a text query is present', async () => {
    await run('?q=dune&genres=fantasy')

    const { books: booksPipeline, facets } = pipelinesOf(books)
    const search = (booksPipeline[0] as any).$search
    expect(search.index).toBe('books_search_v1')
    expect(search.compound.minimumShouldMatch).toBe(1)
    expect(search.compound.should).toEqual([
      { text: { query: 'dune', path: ['title', 'author'], fuzzy: { maxEdits: 1 } } },
      { wildcard: { query: 'dune*', path: ['title', 'author'], allowAnalyzedField: true } },
    ])
    expect(search.compound.filter).toEqual([{ text: { query: 'fantasy', path: 'genres' } }])

    expect(booksPipeline[1]).toEqual({ $addFields: { _searchScore: { $meta: 'searchScore' } } })
    // Default sort still applies on the text path.
    expect(booksPipeline[2]).toEqual({ $sort: { avgRating: -1 } })

    // Facets stay a regular aggregation — they never include the text query.
    expect(facets.some((s) => '$search' in s)).toBe(false)
    expect(facets[0]).toEqual({ $match: { $and: [{ genres: { $all: ['fantasy'] } }] } })
  })

  it('sorts by relevance for searchRank + text query, and falls back to avgRating without one', async () => {
    await run('?q=dune&sortBy=searchRank')
    let { books: booksPipeline } = pipelinesOf(books)
    expect(booksPipeline[2]).toEqual({ $sort: { _searchScore: -1, avgRating: -1 } })

    books.aggregate.mockClear()
    await run('?sortBy=searchRank')
    ;({ books: booksPipeline } = pipelinesOf(books))
    expect(booksPipeline.some((s) => '$search' in s)).toBe(false)
    expect(booksPipeline[0]).toEqual({ $sort: { avgRating: -1 } })
  })

  it('clamps the page number to 1', async () => {
    await run('?page=0')
    const { books: booksPipeline } = pipelinesOf(books)
    const facet = (booksPipeline.find((s) => '$facet' in s) as any).$facet
    expect(facet.books[0]).toEqual({ $skip: 0 })
  })

  it('returns 500 with a generic error body when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(getDb as Mock).mockRejectedValue(new Error('connect ECONNREFUSED'))

    const { res, body } = await run()
    expect(res.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
