import { describe, it, expect } from 'vitest'
import { buildSearchExpr, buildFacetMatch, SearchParams } from '@/lib/search'

function params(overrides: Partial<SearchParams> = {}): SearchParams {
  return {
    q: undefined,
    genres: [],
    excludeGenres: [],
    minRating: 0,
    maxRating: 5,
    minRatings: 0,
    ...overrides,
  }
}

describe('buildSearchExpr', () => {
  it('builds fuzzy text + wildcard prefix clauses for the text query', () => {
    const expr = buildSearchExpr(params({ q: 'murder' })) as any

    expect(expr.compound.minimumShouldMatch).toBe(1)
    expect(expr.compound.should).toEqual([
      {
        text: {
          query: 'murder',
          path: ['title', 'author'],
          fuzzy: { maxEdits: 1 },
        },
      },
      {
        wildcard: {
          query: 'murder*',
          path: ['title', 'author'],
          allowAnalyzedField: true,
        },
      },
    ])
    expect(expr.compound.filter).toBeUndefined()
    expect(expr.compound.mustNot).toBeUndefined()
  })

  it('ANDs included genres as filter clauses and NOTs excluded genres as mustNot', () => {
    const expr = buildSearchExpr(
      params({ q: 'dune', genres: ['fantasy', 'magic'], excludeGenres: ['war'] })
    ) as any

    expect(expr.compound.filter).toEqual([
      { text: { query: 'fantasy', path: 'genres' } },
      { text: { query: 'magic', path: 'genres' } },
    ])
    expect(expr.compound.mustNot).toEqual([{ text: { query: 'war', path: 'genres' } }])
  })

  it('adds an avgRating range filter only when bounds are non-default', () => {
    const noRange = buildSearchExpr(params({ q: 'x' })) as any
    expect(noRange.compound.filter).toBeUndefined()

    const withMin = buildSearchExpr(params({ q: 'x', minRating: 4 })) as any
    expect(withMin.compound.filter).toEqual([
      { range: { path: 'avgRating', gte: 4, lte: 5 } },
    ])

    const withMax = buildSearchExpr(params({ q: 'x', maxRating: 4.5 })) as any
    expect(withMax.compound.filter).toEqual([
      { range: { path: 'avgRating', gte: 0, lte: 4.5 } },
    ])
  })

  it('adds a numRatings floor only when minRatings > 0', () => {
    const expr = buildSearchExpr(params({ q: 'x', minRatings: 1000 })) as any
    expect(expr.compound.filter).toEqual([
      { range: { path: 'numRatings', gte: 1000 } },
    ])
  })
})

describe('buildFacetMatch', () => {
  it('returns an empty match when no filters are active', () => {
    expect(buildFacetMatch(params())).toEqual({})
  })

  it('intentionally ignores the text query — facets reflect genre/rating filters only', () => {
    expect(buildFacetMatch(params({ q: 'dune' }))).toEqual({})
  })

  it('requires ALL included genres and excludes each excluded genre', () => {
    const match = buildFacetMatch(
      params({ genres: ['fantasy', 'magic'], excludeGenres: ['war', 'romance'] })
    )
    expect(match).toEqual({
      $and: [
        { genres: { $all: ['fantasy', 'magic'] } },
        { genres: { $ne: 'war' } },
        { genres: { $ne: 'romance' } },
      ],
    })
  })

  it('applies rating range and ratings-count floor', () => {
    const match = buildFacetMatch(params({ minRating: 4, maxRating: 4.8, minRatings: 500 }))
    expect(match).toEqual({
      $and: [
        { avgRating: { $gte: 4, $lte: 4.8 } },
        { numRatings: { $gte: 500 } },
      ],
    })
  })
})
