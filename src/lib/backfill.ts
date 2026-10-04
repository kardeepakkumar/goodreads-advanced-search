// Re-scrape migration for the shelf fields added in scraper v2.
//
// Genres scraped before v2 have books without publishedYear / coverUrl /
// authorUrl / shelvedCounts. Re-running their shelf pages through the v2
// scraper fills those in — through the normal job queue, so the same cookie,
// rate limit and background ticker apply, and the usual upsert logic for a
// book found under several genres is unchanged.
//
// Progress is derived, never stored separately, from:
//   * books — which ones carry each field, and per raw genre how many tagged
//     books already have that genre's shelved count;
//   * scrapeJobs — which genres a v2 job has fully covered (`scraperVersion`).
// So re-running the migration only queues genres that still need it, and a
// genre first scraped by v2 never needs it.

import { Db, Int32, ObjectId } from 'mongodb'
import { SCRAPER_VERSION, SHELF_FIELDS } from './shelfFields'
import { BackfillOverview, GenreBackfillRow, GenreBackfillStatus, JobStatus } from '@/types'

// Page depth for genres with no pre-v2 job history (bootstrapped from
// books_raw.jl): the admin panel's default job size.
export const DEFAULT_BACKFILL_PAGES = 25

const DEFAULT_RATE_LIMIT_MS = 10000

export interface JobSummary {
  genre: string
  status: JobStatus
  startPage: number
  currentPage: number
  maxPage: number
  scraperVersion?: number
  createdAt: Date | string
}

// Validator properties the new writes need. `false` from checkSchema means
// the strict validators would reject them.
const REQUIRED_SCHEMA_PROPS: Record<string, readonly string[]> = {
  books: SHELF_FIELDS,
  scrapeJobs: ['scraperVersion', 'kind'],
}

const isCurrent = (j: JobSummary) => (j.scraperVersion ?? 1) >= SCRAPER_VERSION
const isActive = (j: JobSummary) => j.status === 'queued' || j.status === 'running'

// One pass over books ($facet): field presence across the collection, and
// per raw genre the tagged books vs those with shelvedCounts.<genre>.
export function bookFieldStatsPipeline(): object[] {
  const has = (field: string) => ({ $ne: [{ $type: `$${field}` }, 'missing'] })
  const countIf = (cond: object) => ({ $sum: { $cond: [cond, 1, 0] } })

  return [
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              complete: countIf({ $and: SHELF_FIELDS.map(has) }),
              ...Object.fromEntries(SHELF_FIELDS.map((f) => [f, countIf(has(f))])),
            },
          },
        ],
        genres: [
          {
            $project: {
              genres: 1,
              shelvedIn: {
                $map: {
                  input: { $objectToArray: { $ifNull: ['$shelvedCounts', {}] } },
                  as: 'kv',
                  in: '$$kv.k',
                },
              },
            },
          },
          { $unwind: '$genres' },
          {
            $group: {
              _id: '$genres',
              books: { $sum: 1 },
              withFields: countIf({ $in: ['$genres', '$shelvedIn'] }),
            },
          },
        ],
      },
    },
  ]
}

// Pages a re-scrape of the genre covers: as deep as any pre-v2 job went,
// or the default for genres that predate the job queue.
export function targetPagesFor(jobs: JobSummary[]): number {
  const legacyMax = Math.max(0, ...jobs.filter((j) => !isCurrent(j)).map((j) => j.maxPage))
  return legacyMax > 0 ? legacyMax : DEFAULT_BACKFILL_PAGES
}

// A finished v2 job counts as having re-scraped the genre when it started at
// page 1 and either reached the target depth or ran out of shelf first.
export function coversGenre(job: JobSummary, targetPages: number): boolean {
  return (
    isCurrent(job) &&
    job.status === 'done' &&
    job.startPage <= 1 &&
    (job.maxPage >= targetPages || job.currentPage < job.maxPage)
  )
}

export function genreStatus(books: number, withFields: number, jobs: JobSummary[]): GenreBackfillStatus {
  if (jobs.some(isActive)) return 'active'
  if (withFields >= books) return 'complete'

  const targetPages = targetPagesFor(jobs)
  if (jobs.some((j) => coversGenre(j, targetPages))) return 'rescraped'

  const latestCurrent = jobs
    .filter(isCurrent)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  return latestCurrent?.status === 'failed' ? 'failed' : 'pending'
}

export const needsRescrape = (row: GenreBackfillRow) => row.status === 'pending' || row.status === 'failed'

// Per-genre rows for every raw genre (registered or found on books).
export function buildGenreRows(
  genreCounts: { genre: string; books: number; withFields: number }[],
  registeredGenres: string[],
  jobs: JobSummary[]
): GenreBackfillRow[] {
  const counts = new Map(genreCounts.map((c) => [c.genre, c]))
  const jobsByGenre = new Map<string, JobSummary[]>()
  for (const j of jobs) {
    const list = jobsByGenre.get(j.genre) ?? []
    list.push(j)
    jobsByGenre.set(j.genre, list)
  }

  const names = [...new Set([...registeredGenres, ...counts.keys()])].sort()
  return names.map((genre) => {
    const books = counts.get(genre)?.books ?? 0
    const withFields = counts.get(genre)?.withFields ?? 0
    const genreJobs = jobsByGenre.get(genre) ?? []
    return {
      genre,
      status: genreStatus(books, withFields, genreJobs),
      books,
      booksWithFields: withFields,
      targetPages: targetPagesFor(genreJobs),
    }
  })
}

export function summarize(rows: GenreBackfillRow[]): BackfillOverview['summary'] {
  const count = (s: GenreBackfillStatus) => rows.filter((r) => r.status === s).length
  const todo = rows.filter(needsRescrape)
  return {
    total: rows.length,
    complete: count('complete'),
    rescraped: count('rescraped'),
    active: count('active'),
    failed: count('failed'),
    pending: count('pending'),
    needsRescrape: todo.length,
    plannedPages: todo.reduce((sum, r) => sum + r.targetPages, 0),
  }
}

// Checks the live collection validators include the new properties.
// true/false when readable; null when listCollections isn't permitted.
export async function checkSchema(db: Db): Promise<boolean | null> {
  try {
    const infos = await db
      .listCollections({ name: { $in: Object.keys(REQUIRED_SCHEMA_PROPS) } })
      .toArray()
    return Object.entries(REQUIRED_SCHEMA_PROPS).every(([name, keys]) => {
      const info = infos.find((i) => i.name === name) as { options?: Record<string, any> } | undefined
      const props = info?.options?.validator?.$jsonSchema?.properties
      // No validator at all (e.g. a local dev DB) accepts anything.
      return !props || keys.every((k) => k in props)
    })
  } catch {
    return null
  }
}

export async function getBackfillOverview(db: Db): Promise<BackfillOverview> {
  const [facet, registered, jobs, config, schemaReady] = await Promise.all([
    db.collection('books').aggregate(bookFieldStatsPipeline()).toArray(),
    db.collection('genres').find({}, { projection: { _id: 1 } }).toArray(),
    db
      .collection('scrapeJobs')
      .find(
        {},
        {
          projection: {
            _id: 0, genre: 1, status: 1, startPage: 1, currentPage: 1, maxPage: 1, scraperVersion: 1, createdAt: 1,
          },
        }
      )
      .toArray(),
    db.collection('appConfig').findOne({ _id: 'global' as any }, { projection: { rateLimitMs: 1 } }),
    checkSchema(db),
  ])

  const totals = facet[0]?.totals?.[0] ?? {}
  const genreCounts = ((facet[0]?.genres ?? []) as any[]).map((g) => ({
    genre: String(g._id),
    books: g.books as number,
    withFields: g.withFields as number,
  }))

  const rows = buildGenreRows(
    genreCounts,
    registered.map((g) => String(g._id)),
    jobs as unknown as JobSummary[]
  )

  const total = (totals.total as number) ?? 0
  const complete = (totals.complete as number) ?? 0
  return {
    books: {
      total,
      complete,
      incomplete: total - complete,
      byField: Object.fromEntries(SHELF_FIELDS.map((f) => [f, (totals[f] as number) ?? 0])) as BackfillOverview['books']['byField'],
    },
    genres: rows,
    summary: summarize(rows),
    schemaReady,
    rateLimitMs: (config?.rateLimitMs as number | undefined) ?? DEFAULT_RATE_LIMIT_MS,
  }
}

// Queue documents for a re-scrape: ordinary scrape jobs (same queue, cookie and
// rate limit) marked kind 'backfill', with the override flag since they
// deliberately revisit already-scraped shelves. createdAt is staggered by 1ms
// so the ticker's oldest-first pick follows the given order.
export function buildBackfillJobs(rows: GenreBackfillRow[], now: Date = new Date()) {
  return rows.map((row, i) => {
    const at = new Date(now.getTime() + i)
    return {
      _id: new ObjectId(),
      genre: row.genre,
      requestedGenre: row.genre,
      startPage: new Int32(1),
      currentPage: new Int32(1),
      maxPage: new Int32(row.targetPages),
      pagesScraped: new Int32(0),
      status: 'queued',
      override: true,
      lastRequestAt: null,
      error: null,
      scraperVersion: new Int32(SCRAPER_VERSION),
      kind: 'backfill',
      schemaVersion: new Int32(1),
      createdAt: at,
      updatedAt: at,
    }
  })
}

// Genres to queue, most un-enriched books first.
export function rescrapeQueueOrder(rows: GenreBackfillRow[]): GenreBackfillRow[] {
  return rows
    .filter(needsRescrape)
    .sort(
      (a, b) =>
        b.books - b.booksWithFields - (a.books - a.booksWithFields) || a.genre.localeCompare(b.genre)
    )
}
