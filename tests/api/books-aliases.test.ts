// /api/books behavior when genre merges exist. The no-alias behavior is
// covered by books.route.test.ts and must stay byte-identical.
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/books/route'
import { getDb } from '@/lib/mongodb'
import { makeDb, makeCollection, makeCursor, type MockCollection } from '../helpers/mockDb'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

const ALIAS_DOCS = [
  { _id: 'science-fiction', canonical: 'sci-fi' },
  { _id: 'scifi', canonical: 'sci-fi' },
]
const SCI_FI_SOURCES = ['sci-fi', 'science-fiction', 'scifi']

describe('GET /api/books with genre merges', () => {
  let books: MockCollection
  let genreAliases: MockCollection

  beforeEach(() => {
    books = makeCollection()
    genreAliases = makeCollection()
    genreAliases.find.mockReturnValue(makeCursor(ALIAS_DOCS))
    books.aggregate.mockImplementation((pipeline: Record<string, unknown>[]) => ({
      toArray: async () =>
        pipeline.some((s) => '$facet' in s)
          ? [{ books: [], total: [{ count: 0 }] }]
          : [{ _id: 'sci-fi', count: 6 }],
    }))
    books.countDocuments.mockResolvedValue(100)
    ;(getDb as Mock).mockResolvedValue(makeDb({ books, genreAliases }))
  })

  async function run(query = '') {
    const res = await GET(new NextRequest(`http://localhost/api/books${query}`))
    const pipelines = books.aggregate.mock.calls.map((c) => c[0] as Record<string, any>[])
    return {
      res,
      body: await res.json(),
      booksPipeline: pipelines.find((p) => p.some((s) => '$facet' in s))!,
      facetPipeline: pipelines.find((p) => !p.some((s) => '$facet' in s))!,
    }
  }

  it('expands an included merged genre to all of its raw sources', async () => {
    const { booksPipeline } = await run('?genres=sci-fi')
    expect(booksPipeline[0]).toEqual({
      $match: { $and: [{ genres: { $in: SCI_FI_SOURCES } }] },
    })
  })

  it('resolves a stale link that filters by a merged-away tag', async () => {
    const { booksPipeline } = await run('?genres=science-fiction')
    expect(booksPipeline[0]).toEqual({
      $match: { $and: [{ genres: { $in: SCI_FI_SOURCES } }] },
    })
  })

  it('keeps unmerged genres in the compact $all shape alongside expanded ones', async () => {
    const { booksPipeline } = await run('?genres=fantasy&genres=sci-fi&genres=war')
    expect(booksPipeline[0]).toEqual({
      $match: {
        $and: [
          { genres: { $all: ['fantasy', 'war'] } },
          { genres: { $in: SCI_FI_SOURCES } },
        ],
      },
    })
  })

  it('excludes every raw source of an excluded merged genre', async () => {
    const { booksPipeline } = await run('?excludeGenres=sci-fi&excludeGenres=war')
    expect(booksPipeline[0]).toEqual({
      $match: {
        $and: [{ genres: { $nin: SCI_FI_SOURCES } }, { genres: { $ne: 'war' } }],
      },
    })
  })

  it('counts facets per canonical with per-book dedup (map → $setUnion → unwind → group)', async () => {
    const { facetPipeline, body } = await run()

    expect(facetPipeline[0].$project.canon.$setUnion).toHaveLength(1)
    const switchExpr = facetPipeline[0].$project.canon.$setUnion[0].$map.in.$switch
    expect(switchExpr.branches).toEqual([
      { case: { $eq: ['$$g', 'science-fiction'] }, then: 'sci-fi' },
      { case: { $eq: ['$$g', 'scifi'] }, then: 'sci-fi' },
    ])
    expect(facetPipeline[1]).toEqual({ $unwind: '$canon' })
    expect(facetPipeline[2]).toEqual({ $group: { _id: '$canon', count: { $sum: 1 } } })

    expect(body.genreFacets).toEqual([{ genre: 'sci-fi', count: 6 }])
  })

  it('projects result genres through the canonical mapping so book rows show merged names', async () => {
    const { booksPipeline } = await run()
    const facet = (booksPipeline.find((s) => '$facet' in s) as any).$facet
    const projection = facet.books[2].$project
    expect(projection.genres.$setUnion).toBeDefined()
    expect(projection._id).toBe(0)
  })

  it('expands genres inside the Atlas Search compound on the text path', async () => {
    const { booksPipeline, facetPipeline } = await run('?q=dune&genres=sci-fi&excludeGenres=scifi')

    const search = (booksPipeline[0] as any).$search
    expect(search.index).toBe('books_search_v1')
    expect(search.compound.filter).toEqual([{ text: { query: SCI_FI_SOURCES, path: 'genres' } }])
    // Excluding a merged-away tag resolves to its canonical group too.
    expect(search.compound.mustNot).toEqual([{ text: { query: SCI_FI_SOURCES, path: 'genres' } }])

    // Facets stay a plain aggregation even on the text path.
    expect(facetPipeline.some((s) => '$search' in s)).toBe(false)
  })
})
