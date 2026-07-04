// Builds Atlas Search and regular MongoDB query stages from filter params.

import { AliasMap, resolveGenre, sourcesFor } from './aliases'

export interface SearchParams {
  q?: string
  genres: string[]
  excludeGenres: string[]
  minRating: number
  maxRating: number
  minRatings: number
}

// A requested genre matched against the raw tags on books: the canonical
// name plus everything merged into it. Requests for a tag that has itself
// been merged resolve to its canonical first, so stale links keep working.
// With no aliases this is just [genre].
function rawSources(genre: string, aliases: AliasMap): string[] {
  return sourcesFor(resolveGenre(genre, aliases), aliases)
}

// Returns the inner search expression for $search: { index, ...expr }
// Only called when params.q is set (text search path).
export function buildSearchExpr(params: SearchParams, aliases: AliasMap = {}): object {
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

  // An array-valued text query matches any of the terms — exactly the
  // "book carries any raw source of this genre" semantics a merge needs.
  for (const genre of params.genres) {
    const sources = rawSources(genre, aliases)
    filter.push({ text: { query: sources.length === 1 ? sources[0] : sources, path: 'genres' } })
  }

  for (const genre of params.excludeGenres) {
    const sources = rawSources(genre, aliases)
    mustNot.push({ text: { query: sources.length === 1 ? sources[0] : sources, path: 'genres' } })
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
export function buildFacetMatch(params: SearchParams, aliases: AliasMap = {}): Record<string, unknown> {
  const conditions: object[] = []

  // Genres without merges keep the compact $all shape; a merged genre needs
  // "array contains any of its raw sources", one $in condition per genre so
  // multiple included genres still AND together.
  const plainIncludes: string[] = []
  const expandedIncludes: string[][] = []
  for (const g of params.genres) {
    const sources = rawSources(g, aliases)
    if (sources.length === 1) plainIncludes.push(sources[0])
    else expandedIncludes.push(sources)
  }

  if (plainIncludes.length > 0) {
    conditions.push({ genres: { $all: plainIncludes } })
  }
  for (const sources of expandedIncludes) {
    conditions.push({ genres: { $in: sources } })
  }

  for (const g of params.excludeGenres) {
    const sources = rawSources(g, aliases)
    if (sources.length === 1) conditions.push({ genres: { $ne: sources[0] } })
    else conditions.push({ genres: { $nin: sources } })
  }

  if (params.minRating > 0 || params.maxRating < 5) {
    conditions.push({ avgRating: { $gte: params.minRating, $lte: params.maxRating } })
  }

  if (params.minRatings > 0) {
    conditions.push({ numRatings: { $gte: params.minRatings } })
  }

  return conditions.length > 0 ? { $and: conditions } : {}
}
