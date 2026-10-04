// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FieldBackfillPanel from '@/components/FieldBackfillPanel'
import { BackfillOverview } from '@/types'

const OVERVIEW: BackfillOverview = {
  books: {
    total: 3000,
    complete: 1250,
    incomplete: 1750,
    byField: { publishedYear: 1260, coverUrl: 1300, authorUrl: 1300, shelvedCounts: 1300 },
  },
  genres: [
    { genre: 'fantasy', status: 'complete', books: 1250, booksWithFields: 1250, targetPages: 25 },
    { genre: 'horror', status: 'pending', books: 1000, booksWithFields: 0, targetPages: 30 },
    { genre: 'magic', status: 'failed', books: 750, booksWithFields: 50, targetPages: 25 },
    { genre: 'poetry', status: 'complete', books: 0, booksWithFields: 0, targetPages: 25 },
  ],
  summary: { total: 4, complete: 2, rescraped: 0, active: 0, failed: 1, pending: 1, needsRescrape: 2, plannedPages: 55 },
  schemaReady: true,
  rateLimitMs: 3000,
}

let state: { overview: BackfillOverview; getStatus: number }
let fetchLog: { url: string; method: string }[]

beforeEach(() => {
  state = { overview: OVERVIEW, getStatus: 200 }
  fetchLog = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      fetchLog.push({ url: String(url), method })
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, json: async () => body }) as Response
      if (method === 'POST') {
        state.overview = {
          ...OVERVIEW,
          summary: { ...OVERVIEW.summary, active: 2, failed: 0, pending: 0, needsRescrape: 0, plannedPages: 0 },
        }
        return json({ queued: 2, genres: ['horror', 'magic'] })
      }
      return state.getStatus === 200 ? json(state.overview) : json({ error: 'boom' }, state.getStatus)
    })
  )
})

const calls = (method: string) => fetchLog.filter((c) => c.url === '/api/admin/backfill' && c.method === method)

describe('FieldBackfillPanel', () => {
  it('shows how many books have the new fields and how many do not', async () => {
    render(<FieldBackfillPanel />)

    const withAll = (await screen.findByText(/have all 4 fields \(42% of\s+3,000\)/)).parentElement!
    expect(within(withAll).getByText('1,250')).toBeInTheDocument()
    const missing = screen.getByText('missing at least one').parentElement!
    expect(within(missing).getByText('1,750')).toBeInTheDocument()

    for (const label of ['Published year', 'Cover image', 'Author link', 'Shelved count']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('summarizes genre progress and the re-scrape plan at the current rate limit', async () => {
    render(<FieldBackfillPanel />)

    expect(await screen.findByText('Genres (4)')).toBeInTheDocument()
    expect(screen.getByText(/fetches about 55 pages — roughly 3 min at the current rate limit \(3s between requests\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Queue re-scrape for 2 genres' })).toBeEnabled()
  })

  it('queues the re-scrape, reports it, and refreshes jobs and status', async () => {
    const onQueued = vi.fn()
    render(<FieldBackfillPanel onQueued={onQueued} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Queue re-scrape for 2 genres' }))

    expect(await screen.findByText('Queued 2 genres for re-scrape.')).toBeInTheDocument()
    expect(calls('POST')).toHaveLength(1)
    expect(onQueued).toHaveBeenCalledTimes(1)
    expect(calls('GET')).toHaveLength(2) // initial load + refresh after queueing
    expect(await screen.findByRole('button', { name: 'Queue re-scrape' })).toBeDisabled()
  })

  it('blocks queuing with an explanation while the validators predate the new fields', async () => {
    state.overview = { ...OVERVIEW, schemaReady: false }
    render(<FieldBackfillPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('scripts/mongo-upgrade-shelf-fields.js')
    expect(screen.getByRole('button', { name: 'Queue re-scrape for 2 genres' })).toBeDisabled()
  })

  it('lists per-genre status with what still needs doing first', async () => {
    render(<FieldBackfillPanel />)
    await screen.findByText('Per-genre status')

    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true }).slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell', { hidden: true })[0].textContent)).toEqual([
      'horror',
      'magic',
      'fantasy',
      'poetry',
    ])
    expect(within(rows[0]).getByText('needs re-scrape')).toBeInTheDocument()
    expect(within(rows[1]).getByText('failed')).toBeInTheDocument()
    expect(within(rows[2]).getByText('up to date')).toBeInTheDocument()
  })

  it('refreshes on demand', async () => {
    render(<FieldBackfillPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Refresh' }))
    expect(calls('GET')).toHaveLength(2)
  })

  it('says so when the status cannot be loaded', async () => {
    state.getStatus = 500
    render(<FieldBackfillPanel />)
    expect(await screen.findByText("Couldn't load re-scrape status.")).toBeInTheDocument()
  })
})
