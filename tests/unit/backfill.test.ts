import { describe, it, expect } from 'vitest'
import { Int32, ObjectId } from 'mongodb'
import {
  bookFieldStatsPipeline,
  buildBackfillJobs,
  buildGenreRows,
  DEFAULT_BACKFILL_PAGES,
  genreStatus,
  JobSummary,
  rescrapeQueueOrder,
  summarize,
  targetPagesFor,
} from '@/lib/backfill'
import { GenreBackfillRow } from '@/types'

// A pre-v2 job (no scraperVersion) that scraped pages 1..25.
function job(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    genre: 'fantasy',
    status: 'done',
    startPage: 1,
    currentPage: 25,
    maxPage: 25,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const v2 = (overrides: Partial<JobSummary> = {}) =>
  job({ scraperVersion: 2, createdAt: '2026-10-01T00:00:00.000Z', ...overrides })

function row(genre: string, overrides: Partial<GenreBackfillRow> = {}): GenreBackfillRow {
  return { genre, status: 'pending', books: 100, booksWithFields: 0, targetPages: 25, ...overrides }
}

describe('targetPagesFor', () => {
  it('re-scrapes as deep as the deepest pre-v2 job went', () => {
    expect(targetPagesFor([job({ maxPage: 10 }), job({ maxPage: 40 })])).toBe(40)
  })

  it('uses the default depth for genres with no pre-v2 job (bootstrapped from books_raw.jl)', () => {
    expect(targetPagesFor([])).toBe(DEFAULT_BACKFILL_PAGES)
    // v2 jobs never move the target
    expect(targetPagesFor([v2({ maxPage: 5 })])).toBe(DEFAULT_BACKFILL_PAGES)
  })
})

describe('genreStatus', () => {
  it('is complete when every tagged book already has the genre shelf count — new genres never need a re-scrape', () => {
    expect(genreStatus(120, 120, [v2({ maxPage: 3, currentPage: 3 })])).toBe('complete')
    expect(genreStatus(0, 0, [])).toBe('complete')
  })

  it('is pending for legacy genres whose books lack the fields, with or without job history', () => {
    expect(genreStatus(1250, 0, [job()])).toBe('pending')
    expect(genreStatus(800, 0, [])).toBe('pending')
  })

  it('is active while any job for the genre is queued or running, so it is never queued twice', () => {
    expect(genreStatus(1250, 10, [job(), v2({ status: 'running', currentPage: 3 })])).toBe('active')
    expect(genreStatus(1250, 0, [job({ status: 'queued' })])).toBe('active')
  })

  it('is rescraped once a v2 job from page 1 reached the target depth, even if a few books stay without fields', () => {
    expect(genreStatus(1250, 1190, [job({ maxPage: 25 }), v2({ maxPage: 25, currentPage: 25 })])).toBe('rescraped')
    expect(genreStatus(2000, 1500, [job({ maxPage: 30 }), v2({ maxPage: 40, currentPage: 40 })])).toBe('rescraped')
  })

  it('treats a v2 job that ran out of shelf before maxPage as covering the genre', () => {
    expect(genreStatus(300, 290, [job({ maxPage: 25 }), v2({ maxPage: 25, currentPage: 7 })])).toBe('rescraped')
  })

  it('does not count partial v2 runs: resumed mid-shelf, too shallow, or failed', () => {
    const legacy = job({ maxPage: 25 })
    expect(genreStatus(1250, 600, [legacy, v2({ startPage: 10, currentPage: 25 })])).toBe('pending')
    expect(genreStatus(1250, 250, [legacy, v2({ maxPage: 5, currentPage: 5 })])).toBe('pending')
    expect(genreStatus(1250, 100, [legacy, v2({ status: 'failed', currentPage: 3 })])).toBe('failed')
  })

  it('reports failed only when the latest v2 attempt failed', () => {
    const legacy = job({ maxPage: 25 })
    const failedEarlier = v2({ status: 'failed', currentPage: 3, createdAt: '2026-10-01T00:00:00.000Z' })
    const shallowLater = v2({ maxPage: 5, currentPage: 5, createdAt: '2026-10-02T00:00:00.000Z' })
    expect(genreStatus(1250, 250, [legacy, failedEarlier, shallowLater])).toBe('pending')
    expect(genreStatus(1250, 250, [legacy, shallowLater, failedEarlier])).toBe('pending')
  })
})

describe('buildGenreRows + summarize', () => {
  it('covers registered genres and genres only found on books', () => {
    const rows = buildGenreRows(
      [
        { genre: 'fantasy', books: 1250, withFields: 1250 },
        { genre: 'horror', books: 1000, withFields: 0 },
      ],
      ['fantasy', 'poetry'],
      [job({ genre: 'horror', maxPage: 30, currentPage: 30 })]
    )

    expect(rows).toEqual([
      { genre: 'fantasy', status: 'complete', books: 1250, booksWithFields: 1250, targetPages: 25 },
      { genre: 'horror', status: 'pending', books: 1000, booksWithFields: 0, targetPages: 30 },
      { genre: 'poetry', status: 'complete', books: 0, booksWithFields: 0, targetPages: 25 },
    ])
  })

  it('counts statuses and plans pages only for genres that need a re-scrape', () => {
    const summary = summarize([
      row('a', { status: 'pending', targetPages: 30 }),
      row('b', { status: 'failed', targetPages: 25 }),
      row('c', { status: 'active' }),
      row('d', { status: 'rescraped' }),
      row('e', { status: 'complete' }),
    ])
    expect(summary).toEqual({
      total: 5,
      complete: 1,
      rescraped: 1,
      active: 1,
      failed: 1,
      pending: 1,
      needsRescrape: 2,
      plannedPages: 55,
    })
  })
})

describe('rescrapeQueueOrder', () => {
  it('keeps only pending/failed genres, most books without fields first', () => {
    const order = rescrapeQueueOrder([
      row('small', { books: 100, booksWithFields: 90 }),
      row('done', { status: 'rescraped', books: 5000 }),
      row('big', { books: 1250, booksWithFields: 0 }),
      row('retry', { status: 'failed', books: 600, booksWithFields: 100 }),
      row('busy', { status: 'active', books: 9000 }),
    ])
    expect(order.map((r) => r.genre)).toEqual(['big', 'retry', 'small'])
  })
})

describe('buildBackfillJobs', () => {
  it('builds schema-safe queued jobs covering pages 1..target with the v2 stamp and override flag', () => {
    const now = new Date('2026-10-04T00:00:00.000Z')
    const [first, second] = buildBackfillJobs([row('fantasy', { targetPages: 40 }), row('horror')], now)

    expect(first._id).toBeInstanceOf(ObjectId)
    expect(first.genre).toBe('fantasy')
    expect(first.requestedGenre).toBe('fantasy')
    for (const field of ['startPage', 'currentPage', 'maxPage', 'pagesScraped', 'scraperVersion', 'schemaVersion'] as const) {
      expect(first[field]).toBeInstanceOf(Int32)
    }
    expect(first.startPage.value).toBe(1)
    expect(first.currentPage.value).toBe(1)
    expect(first.maxPage.value).toBe(40)
    expect(first.pagesScraped.value).toBe(0)
    expect(first.scraperVersion.value).toBe(2)
    expect(first.schemaVersion.value).toBe(1)
    expect(first.status).toBe('queued')
    expect(first.override).toBe(true)
    expect(first.kind).toBe('backfill')
    expect(first.lastRequestAt).toBeNull()
    expect(first.error).toBeNull()
    expect(first.createdAt).toBeInstanceOf(Date)
    expect(first.updatedAt).toEqual(first.createdAt)

    // Staggered by 1ms so the ticker's oldest-first pick follows queue order.
    expect(second.createdAt.getTime() - first.createdAt.getTime()).toBe(1)
  })
})

describe('bookFieldStatsPipeline', () => {
  it('computes collection totals and per-genre coverage in a single $facet pass', () => {
    const pipeline = bookFieldStatsPipeline() as any[]
    expect(pipeline).toHaveLength(1)

    const { totals, genres } = pipeline[0].$facet
    expect(Object.keys(totals[0].$group)).toEqual([
      '_id',
      'total',
      'complete',
      'publishedYear',
      'coverUrl',
      'authorUrl',
      'shelvedCounts',
    ])
    expect(genres.map((s: object) => Object.keys(s)[0])).toEqual(['$project', '$unwind', '$group'])
  })
})
