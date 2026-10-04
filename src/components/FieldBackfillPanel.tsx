'use client'

import { useCallback, useEffect, useState } from 'react'
import { BackfillOverview, BackfillQueueResponse, GenreBackfillRow, GenreBackfillStatus } from '@/types'
import { SHELF_FIELDS, ShelfField } from '@/lib/shelfFields'

// Admin section for the one-time re-scrape that fills the shelf fields added
// in scraper v2 into books scraped before them. Loaded on demand (the
// overview aggregates every book), refreshed after queuing or via Refresh.

const FIELD_LABELS: Record<ShelfField, string> = {
  publishedYear: 'Published year',
  coverUrl: 'Cover image',
  authorUrl: 'Author link',
  shelvedCounts: 'Shelved count',
}

const STATUS_LABELS: Record<GenreBackfillStatus, string> = {
  pending: 'needs re-scrape',
  failed: 'failed',
  active: 'in queue',
  rescraped: 're-scraped',
  complete: 'up to date',
}

const STATUS_STYLES: Record<GenreBackfillStatus, string> = {
  pending: 'bg-amber-900/40 text-amber-300',
  failed: 'bg-red-900/40 text-red-400',
  active: 'bg-blue-600/30 text-blue-300',
  rescraped: 'bg-green-900/40 text-green-400',
  complete: 'bg-green-900/40 text-green-400',
}

// Order in the per-genre list: what still needs doing first.
const STATUS_ORDER: GenreBackfillStatus[] = ['pending', 'failed', 'active', 'rescraped', 'complete']

// Rough per-page cost on top of the configured gap: the ticker's buffer plus DB work.
const PER_PAGE_OVERHEAD_MS = 300

const fmt = (n: number) => n.toLocaleString('en-US')
const pct = (n: number, total: number) => (total > 0 ? `${Math.round((n / total) * 100)}%` : '—')

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = ms / 3600000
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`
}

function StatusPill({ status }: { status: GenreBackfillStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function sortRows(rows: GenreBackfillRow[]): GenreBackfillRow[] {
  return [...rows].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      b.books - b.booksWithFields - (a.books - a.booksWithFields) ||
      a.genre.localeCompare(b.genre)
  )
}

export default function FieldBackfillPanel({ onQueued }: { onQueued?: () => void }) {
  const [data, setData] = useState<BackfillOverview | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [queueing, setQueueing] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/backfill')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function queueRescrape() {
    setQueueing(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/backfill', { method: 'POST' })
      const body = await res.json()
      if (res.ok) {
        const { queued } = body as BackfillQueueResponse
        setMsg(
          queued === 0
            ? 'Nothing to re-scrape — every genre is covered or already queued.'
            : `Queued ${fmt(queued)} genre${queued === 1 ? '' : 's'} for re-scrape.`
        )
        onQueued?.()
        await load()
      } else {
        setMsg(body.error || 'Error queuing re-scrape')
      }
    } catch {
      setMsg('Error queuing re-scrape')
    } finally {
      setQueueing(false)
    }
  }

  const s = data?.summary
  const blocked = data?.schemaReady === false
  const canQueue = !!s && s.needsRescrape > 0 && !blocked && !queueing

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Re-scrape for New Fields</h2>
      <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-5 space-y-5">
        <p className="text-xs text-zinc-400">
          One-time migration: re-scrapes genre shelves so books scraped before the change also get published year,
          cover image, author link and per-genre shelved count. Jobs go through the normal queue — same cookie, same
          rate limit. Genres already covered, or first scraped after the change, are skipped, so it is safe to run again.
        </p>

        {!data && !loadFailed && <p className="text-xs text-zinc-500">Loading re-scrape status…</p>}
        {!data && loadFailed && <p className="text-xs text-red-400">Couldn&apos;t load re-scrape status.</p>}

        {data && s && (
          <>
            {blocked && (
              <p role="alert" className="text-xs rounded border border-amber-700/60 bg-amber-900/30 text-amber-200 px-3 py-2">
                MongoDB validators don&apos;t allow the new fields yet. Run{' '}
                <code className="font-mono">scripts/mongo-upgrade-shelf-fields.js</code> (see docs/mongo-setup.md)
                first — until then book writes carrying the new fields are rejected.
              </p>
            )}

            {/* Book coverage */}
            <div>
              <h3 className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Books</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <div className="text-lg font-semibold text-green-400">{fmt(data.books.complete)}</div>
                  <div className="text-xs text-zinc-400">
                    have all {SHELF_FIELDS.length} fields ({pct(data.books.complete, data.books.total)} of{' '}
                    {fmt(data.books.total)})
                  </div>
                </div>
                <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2">
                  <div className="text-lg font-semibold text-amber-300">{fmt(data.books.incomplete)}</div>
                  <div className="text-xs text-zinc-400">missing at least one</div>
                </div>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                {SHELF_FIELDS.map((f) => (
                  <div key={f} className="flex items-center justify-between gap-3">
                    <dt className="text-zinc-400">{FIELD_LABELS[f]}</dt>
                    <dd className="text-zinc-200 tabular-nums">
                      {fmt(data.books.byField[f])}{' '}
                      <span className="text-zinc-500">· {fmt(data.books.total - data.books.byField[f])} without</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-zinc-500">
                Some books stay incomplete after a re-scrape: Goodreads shows no year for a few, and books that have
                dropped off a genre&apos;s scraped pages aren&apos;t revisited.
              </p>
            </div>

            {/* Genre progress */}
            <div>
              <h3 className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Genres ({fmt(s.total)})</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                <span><span className="text-zinc-200">{fmt(s.complete)}</span> up to date</span>
                <span><span className="text-zinc-200">{fmt(s.rescraped)}</span> re-scraped</span>
                <span><span className="text-zinc-200">{fmt(s.active)}</span> in queue</span>
                <span><span className="text-zinc-200">{fmt(s.failed)}</span> failed</span>
                <span><span className="text-zinc-200">{fmt(s.pending)}</span> {s.pending === 1 ? 'needs' : 'need'} re-scrape</span>
              </div>
              {s.needsRescrape > 0 && (
                <p className="mt-2 text-xs text-zinc-400">
                  Re-scraping {fmt(s.needsRescrape)} genre{s.needsRescrape === 1 ? '' : 's'} fetches about{' '}
                  {fmt(s.plannedPages)} pages — roughly{' '}
                  {formatDuration(s.plannedPages * (data.rateLimitMs + PER_PAGE_OVERHEAD_MS))} at the current rate
                  limit ({data.rateLimitMs / 1000}s between requests).
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={queueRescrape}
                disabled={!canQueue}
                className="px-4 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded text-sm font-medium transition-colors"
              >
                {queueing
                  ? 'Queuing…'
                  : s.needsRescrape > 0
                    ? `Queue re-scrape for ${fmt(s.needsRescrape)} genre${s.needsRescrape === 1 ? '' : 's'}`
                    : 'Queue re-scrape'}
              </button>
              <button
                onClick={load}
                disabled={refreshing}
                className="px-3 py-2 sm:py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 transition-colors"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              {msg && <span className="text-xs text-zinc-400">{msg}</span>}
            </div>

            {/* Per-genre detail */}
            {data.genres.length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200 select-none">
                  Per-genre status
                </summary>
                <div className="mt-2 overflow-x-auto overflow-y-auto max-h-80 rounded border border-zinc-700">
                  <table className="w-full text-xs min-w-[480px]">
                    <thead className="sticky top-0 bg-zinc-800">
                      <tr className="border-b border-zinc-700 text-zinc-400 uppercase tracking-wider">
                        <th className="text-left px-3 py-2 font-medium">Genre</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-right px-3 py-2 font-medium">Books</th>
                        <th className="text-right px-3 py-2 font-medium">With fields</th>
                        <th className="text-right px-3 py-2 font-medium">Pages</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortRows(data.genres).map((g) => (
                        <tr key={g.genre} className="border-b border-zinc-700/50">
                          <td className="px-3 py-1.5 font-mono text-zinc-200">{g.genre}</td>
                          <td className="px-3 py-1.5"><StatusPill status={g.status} /></td>
                          <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{fmt(g.books)}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{fmt(g.booksWithFields)}</td>
                          <td className="px-3 py-1.5 text-right text-zinc-400 tabular-nums">{fmt(g.targetPages)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  )
}
