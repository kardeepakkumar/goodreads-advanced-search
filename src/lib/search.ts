// Builds Atlas Search and regular MongoDB query stages from filter params.

export interface SearchParams {
  q?: string
  genres: string[]
  excludeGenres: string[]
  minRating: number
  maxRating: number
  minRatings: number
}

// Returns the inner search expression for $search: { index, ...expr }
// Only called when params.q is set (text search path).
export function buildSearchExpr(params: SearchParams): object {
  const should: object[] = []
  const filter: object[] = []
  const mustNot: object[] = []

  // Text match: fuzzy (handles typos) + wildcard prefix (handles "murder" → "murderbot")
  if (params.q) {
    should.push({
      text: {
        query: params.q,
        path: ['title', 'author'],
        fuzzy: { maxEdits: 1 },
      },
    })
    should.push({
      wildcard: {
        query: `${params.q}*`,
        path: ['title', 'author'],
        allowAnalyzedField: true,
      },
    })
  }

  for (const genre of params.genres) {
    filter.push({ text: { query: genre, path: 'genres' } })
  }

  for (const genre of params.excludeGenres) {
    mustNot.push({ text: { query: genre, path: 'genres' } })
  }

  if (params.minRating > 0 || params.maxRating < 5) {
    filter.push({ range: { path: 'avgRating', gte: params.minRating, lte: params.maxRating } })
  }

  if (params.minRatings > 0) {
    filter.push({ range: { path: 'numRatings', gte: params.minRatings } })
  }

  const compound: Record<string, unknown> = { minimumShouldMatch: 1 }
  if (should.length > 0) compound.should = should
  if (filter.length > 0) compound.filter = filter
  if (mustNot.length > 0) compound.mustNot = mustNot

  return { compound }
}

// Builds a regular $match stage for genre facet counts.
// Intentionally does NOT include text search (acceptable tradeoff — facets
// reflect genre/rating filters only, not the text query).
export function buildFacetMatch(params: SearchParams): Record<string, unknown> {
  const conditions: object[] = []

  if (params.genres.length > 0) {
    conditions.push({ genres: { $all: params.genres } })
  }

  for (const g of params.excludeGenres) {
    conditions.push({ genres: { $ne: g } })
  }

  if (params.minRating > 0 || params.maxRating < 5) {
    conditions.push({ avgRating: { $gte: params.minRating, $lte: params.maxRating } })
  }

  if (params.minRatings > 0) {
    conditions.push({ numRatings: { $gte: params.minRatings } })
  }

  return conditions.length > 0 ? { $and: conditions } : {}
}
