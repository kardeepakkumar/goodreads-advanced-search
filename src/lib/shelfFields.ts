// Shelf-page fields added in scraper v2 — shared by the scraper, the job
// routes and the admin re-scrape migration.

// Parser version stamped on every new scrape job. v1 (implicit — jobs created
// before this field existed) stored title/author/ratings only; v2 also stores
// the fields below. The re-scrape migration uses it to tell which genres have
// already been through the current parser.
export const SCRAPER_VERSION = 2

// Book fields captured since v2. Documents only ever touched by the v1
// scraper (or the original books_raw.jl import) don't have them.
export const SHELF_FIELDS = ['publishedYear', 'coverUrl', 'authorUrl', 'shelvedCounts'] as const
export type ShelfField = (typeof SHELF_FIELDS)[number]

// shelvedCounts is keyed by genre slug and written through a dotted $set path
// (`shelvedCounts.<genre>`), so a slug with "." or a leading "$" can't be a key.
export function isSafeGenreKey(genre: string): boolean {
  return genre.length > 0 && !genre.includes('.') && !genre.startsWith('$')
}
