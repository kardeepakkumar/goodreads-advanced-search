// Genre alias normalization, resolved at query/display time.
//
// A genreAliases doc { _id: 'science-fiction', canonical: 'sci-fi' } means the
// raw shelf tag "science-fiction" is merged into "sci-fi" everywhere the app
// reads genres. Raw tags on books and the genres collection are never
// rewritten, so a merge is fully undone by deleting its alias docs (split).
// Mappings are kept flat: an alias may not itself be a merge target.

import { Db } from 'mongodb'

export type AliasMap = Record<string, string> // alias slug → canonical slug

export async function getAliasMap(db: Db): Promise<AliasMap> {
  const docs = await db.collection('genreAliases').find({}).toArray()
  const map: AliasMap = {}
  for (const d of docs) map[String(d._id)] = String((d as { canonical?: unknown }).canonical)
  return map
}

export function hasAliases(aliases: AliasMap): boolean {
  return Object.keys(aliases).length > 0
}

// Display name for a raw tag; unmerged tags map to themselves.
export function resolveGenre(genre: string, aliases: AliasMap): string {
  return aliases[genre] ?? genre
}

// Every raw tag that displays as `canonical`: itself plus all merged tags.
export function sourcesFor(canonical: string, aliases: AliasMap): string[] {
  const sources = [canonical]
  for (const [alias, target] of Object.entries(aliases)) {
    if (target === canonical) sources.push(alias)
  }
  return sources
}

// Raw tag list → display list: mapped to canonicals, deduplicated, keeping
// first-appearance order. A book tagged both 'sci-fi' and 'science-fiction'
// yields 'sci-fi' once.
export function canonicalizeGenres(genres: string[], aliases: AliasMap): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const g of genres) {
    const c = resolveGenre(g, aliases)
    if (!seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

// Aggregation expression mapping one raw genre value to its display genre.
export function genreSwitchExpr(aliases: AliasMap, varRef = '$$g'): object {
  return {
    $switch: {
      branches: Object.entries(aliases).map(([alias, canonical]) => ({
        case: { $eq: [varRef, alias] },
        then: canonical,
      })),
      default: varRef,
    },
  }
}

// Aggregation expression turning a document's raw `genres` array into its
// canonical set. $setUnion deduplicates, so a book carrying several sources
// of the same canonical contributes it exactly once — no double counting.
export function canonicalGenresExpr(aliases: AliasMap): object {
  return { $setUnion: [{ $map: { input: '$genres', as: 'g', in: genreSwitchExpr(aliases) } }] }
}
