import type { ShelfField } from '@/lib/shelfFields'

// ─── Domain models ────────────────────────────────────────────────────────────

export interface Book {
  goodreadsUrl: string
  title: string
  author: string
  avgRating: number
  numRatings: number
  genres: string[]
}

export interface Genre {
  _id: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface AppConfig {
  _id: 'global'
  goodreadsCookie: string
  rateLimitMs: number
  schemaVersion: number
  updatedAt: string
}

export type JobStatus = 'queued' | 'running' | 'failed' | 'done'

// 'backfill' jobs are created by the admin re-scrape migration.
export type JobKind = 'manual' | 'backfill'

export interface ScrapeJob {
  _id: string
  genre: string
  requestedGenre?: string | null
  startPage: number
  currentPage: number
  maxPage: number
  pagesScraped: number
  status: JobStatus
  override: boolean
  lastRequestAt?: string | null
  error?: string | null
  scraperVersion?: number // absent on jobs created before scraper v2
  kind?: JobKind // absent on jobs created before scraper v2
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

// ─── Filter state ─────────────────────────────────────────────────────────────

export interface FilterState {
  q: string
  genres: string[]         // included (AND)
  excludeGenres: string[]  // excluded (NOT)
  minRating: number
  maxRating: number
  minRatings: number
  minYear: number | null   // published year, inclusive; null = open-ended
  maxYear: number | null
  sortBy: SortField
  sortDir: 'asc' | 'desc'
  page: number
}

export type SortField = 'avgRating' | 'numRatings' | 'title' | 'searchRank'

export const DEFAULT_FILTERS: FilterState = {
  q: '',
  genres: [],
  excludeGenres: [],
  minRating: 0,
  maxRating: 5,
  minRatings: 0,
  minYear: null,
  maxYear: null,
  sortBy: 'avgRating',
  sortDir: 'desc',
  page: 1,
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface GenreFacet {
  genre: string
  count: number
}

export interface BooksResponse {
  books: Book[]
  total: number
  totalDataset: number
  genreFacets: GenreFacet[]
}

export interface GenresResponse {
  genres: string[]
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export interface TickResponse {
  status: 'ok' | 'done' | 'rate_limited' | 'no_jobs' | 'error'
  message?: string
  booksProcessed?: number
  missingRatings?: number
  jobId?: string
  genre?: string
  currentPage?: number
  waitMs?: number
}

// ─── Re-scrape migration (shelf fields backfill) ──────────────────────────────

// complete  — every book tagged with the genre has its shelved count already
// rescraped — a v2 scrape covered the genre's pages; leftovers aren't on them
// active    — a job for the genre is queued or running
// failed    — the latest v2 job failed before covering the genre
// pending   — still needs a v2 re-scrape
export type GenreBackfillStatus = 'complete' | 'rescraped' | 'active' | 'failed' | 'pending'

export interface GenreBackfillRow {
  genre: string
  status: GenreBackfillStatus
  books: number            // books tagged with this raw genre
  booksWithFields: number  // of those, books with shelvedCounts.<genre>
  targetPages: number      // pages a re-scrape covers (1..targetPages)
}

export interface BackfillOverview {
  books: {
    total: number
    complete: number                     // all shelf fields present
    incomplete: number                   // missing at least one
    byField: Record<ShelfField, number>  // books having each field
  }
  genres: GenreBackfillRow[]
  summary: {
    total: number
    complete: number
    rescraped: number
    active: number
    failed: number
    pending: number
    needsRescrape: number  // failed + pending
    plannedPages: number   // pages a re-scrape of those genres would fetch
  }
  // false = the MongoDB validators predate the new fields (writes would be
  // rejected); null = couldn't be checked
  schemaReady: boolean | null
  rateLimitMs: number
}

export interface BackfillQueueResponse {
  queued: number
  genres: string[]
}
