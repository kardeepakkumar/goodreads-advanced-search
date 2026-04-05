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
