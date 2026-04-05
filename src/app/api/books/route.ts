import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/mongodb'
import { buildSearchExpr, buildFacetMatch, SearchParams } from '@/lib/search'
import { BooksResponse } from '@/types'

const PAGE_SIZE = 25

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const params: SearchParams = {
    q: sp.get('q') || undefined,
    genres: sp.getAll('genres'),
    excludeGenres: sp.getAll('excludeGenres'),
    minRating: parseFloat(sp.get('minRating') || '0'),
    maxRating: parseFloat(sp.get('maxRating') || '5'),
    minRatings: parseInt(sp.get('minRatings') || '0', 10),
  }

  const sortBy = sp.get('sortBy') || 'avgRating'
  const sortDir = sp.get('sortDir') === 'asc' ? 1 : -1
  const page = Math.max(1, parseInt(sp.get('page') || '1', 10))
  const skip = (page - 1) * PAGE_SIZE

  try {
    const db = await getDb()
    const col = db.collection('books')

    const facetMatch = buildFacetMatch(params)
    const facetMatchStages = Object.keys(facetMatch).length > 0 ? [{ $match: facetMatch }] : []

    // Genre facet pipeline — always a regular aggregation
    const facetPipeline = [
      ...facetMatchStages,
      { $unwind: '$genres' },
      { $group: { _id: '$genres', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 500 },
    ]

    const effectiveSortField = sortBy === 'searchRank' ? 'avgRating' : sortBy

    let booksPipeline: object[]

    if (params.q) {
      // ── Text search path: Atlas Search ───────────────────────────────
      const searchExpr = buildSearchExpr(params)
      const textSortStage: Record<string, unknown> =
        sortBy === 'searchRank'
          ? { $sort: { _searchScore: -1, avgRating: -1 } }
          : { $sort: { [effectiveSortField]: sortDir } }

      booksPipeline = [
        { $search: { index: 'books_search_v1', ...searchExpr } },
        { $addFields: { _searchScore: { $meta: 'searchScore' } } },
        textSortStage,
        {
          $facet: {
            books: [
              { $skip: skip },
              { $limit: PAGE_SIZE },
              { $project: { _id: 0, goodreadsUrl: 1, title: 1, author: 1, avgRating: 1, numRatings: 1, genres: 1 } },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ]
    } else {
      // ── No text query: regular MongoDB aggregation (reliable default) ─
      booksPipeline = [
        ...facetMatchStages,
        { $sort: { [effectiveSortField]: sortDir } },
        {
          $facet: {
            books: [
              { $skip: skip },
              { $limit: PAGE_SIZE },
              { $project: { _id: 0, goodreadsUrl: 1, title: 1, author: 1, avgRating: 1, numRatings: 1, genres: 1 } },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ]
    }

    const [booksResult, facetResult, totalDatasetResult] = await Promise.all([
      col.aggregate(booksPipeline).toArray(),
      col.aggregate(facetPipeline).toArray(),
      col.countDocuments(),
    ])

    const books = booksResult[0]?.books ?? []
    const total = booksResult[0]?.total?.[0]?.count ?? 0
    const genreFacets = facetResult.map((f: any) => ({ genre: f._id, count: f.count }))

    const body: BooksResponse = { books, total, totalDataset: totalDatasetResult, genreFacets }
    return NextResponse.json(body)
  } catch (err) {
    console.error('/api/books error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
