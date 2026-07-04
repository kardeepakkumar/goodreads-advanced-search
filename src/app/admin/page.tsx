'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppConfig, ScrapeJob } from '@/types'

interface JobsResponse {
  jobs: ScrapeJob[]
}

interface AliasOverview {
  originals: { genre: string; count: number; mergedInto: string | null }[]
  merges: { canonical: string; sources: string[]; count: number }[]
}

function StatusBadge({ status }: { status: ScrapeJob['status'] }) {
  const styles: Record<ScrapeJob['status'], string> = {
    queued: 'bg-zinc-700 text-zinc-300',
    running: 'bg-blue-600/30 text-blue-300 animate-pulse',
    done: 'bg-green-900/40 text-green-400',
    failed: 'bg-red-900/40 text-red-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function AdminPage() {
  const router = useRouter()

  const [config, setConfig] = useState<AppConfig | null>(null)
  const [cookieDraft, setCookieDraft] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState('')

  const [jobs, setJobs] = useState<ScrapeJob[]>([])
  const [newGenre, setNewGenre] = useState('')
  const [newStartPage, setNewStartPage] = useState(1)
  const [newMaxPage, setNewMaxPage] = useState(25)
  const [jobMsg, setJobMsg] = useState('')

  const [scraperLogs, setScraperLogs] = useState<string[]>([])

  const [aliasData, setAliasData] = useState<AliasOverview | null>(null)
  const [mergeFrom, setMergeFrom] = useState('')
  const [mergeInto, setMergeInto] = useState('')
  const [aliasMsg, setAliasMsg] = useState('')
  const [genreFilter, setGenreFilter] = useState('')

  const [authState, setAuthState] = useState<'checking' | 'ok' | 'denied'>('checking')

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function checkAuth() {
      const res = await fetch('/api/admin/config')
      if (res.status === 401) {
        setAuthState('denied')
        router.replace('/admin/login')
        return
      }
      setAuthState('ok')
    }
    checkAuth()
  }, [router])

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/admin/config')
    if (!res.ok) return
    const c: AppConfig = await res.json()
    setConfig(c)
    setCookieDraft(c.goodreadsCookie)
  }, [])

  const loadJobs = useCallback(async () => {
    const res = await fetch('/api/admin/jobs')
    if (!res.ok) return
    const body: JobsResponse = await res.json()
    setJobs(body.jobs.slice(0, 20))
  }, [])

  const loadAliases = useCallback(async () => {
    const res = await fetch('/api/admin/aliases')
    if (!res.ok) return
    const body: AliasOverview = await res.json()
    setAliasData(body)
  }, [])

  useEffect(() => {
    loadConfig()
    loadJobs()
    loadAliases()
  }, [loadConfig, loadJobs, loadAliases])

  // ── Auto-refresh jobs + logs while page is open ─────────────────────────────
  useEffect(() => {
    if (authState !== 'ok') return
    const hasActive = jobs.some((j) => j.status === 'queued' || j.status === 'running')
    const interval = setInterval(loadJobs, hasActive ? 4000 : 20000)
    return () => clearInterval(interval)
  }, [authState, jobs, loadJobs])

  useEffect(() => {
    if (authState !== 'ok') return
    function pollLogs() {
      fetch('/api/admin/logs')
        .then((r) => r.json())
        .then((body) => setScraperLogs(body.logs ?? []))
        .catch(() => {})
    }
    pollLogs()
    const interval = setInterval(pollLogs, 3000)
    return () => clearInterval(interval)
  }, [authState])

  // ── Config save ─────────────────────────────────────────────────────────────
  async function saveConfig() {
    setConfigSaving(true)
    setConfigMsg('')
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goodreadsCookie: cookieDraft,
        rateLimitMs: config?.rateLimitMs ?? 10000,
      }),
    })
    setConfigSaving(false)
    setConfigMsg(res.ok ? 'Saved.' : 'Error saving config.')
    if (res.ok) loadConfig()
  }

  // ── Queue job ───────────────────────────────────────────────────────────────
  async function queueJob() {
    if (!newGenre.trim()) return
    setJobMsg('')
    const res = await fetch('/api/admin/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre: newGenre.trim(), startPage: newStartPage, maxPage: newMaxPage }),
    })
    const body = await res.json()
    if (res.ok) {
      setNewGenre('')
      setJobMsg(`Queued job for "${body.job.genre}"`)
      loadJobs()
    } else {
      setJobMsg(body.error || 'Error queuing job')
    }
  }

  // ── Genre merges ────────────────────────────────────────────────────────────
  async function mergeGenres() {
    const from = mergeFrom.trim()
    const into = mergeInto.trim()
    if (!from || !into) return
    setAliasMsg('')
    const res = await fetch('/api/admin/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, into }),
    })
    const body = await res.json()
    if (res.ok) {
      setMergeFrom('')
      setMergeInto('')
      setAliasMsg(`Merged "${from}" into "${into}"`)
      loadAliases()
    } else {
      setAliasMsg(body.error || 'Error merging genres')
    }
  }

  async function splitGenre(canonical: string) {
    setAliasMsg('')
    const res = await fetch(`/api/admin/aliases?canonical=${encodeURIComponent(canonical)}`, {
      method: 'DELETE',
    })
    const body = await res.json()
    if (res.ok) {
      setAliasMsg(`Split "${canonical}" — ${body.released} genre(s) restored`)
      loadAliases()
    } else {
      setAliasMsg(body.error || 'Error splitting genre')
    }
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  if (authState !== 'ok') return null

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold truncate">Admin Panel</h1>
        <div className="flex items-center gap-1 shrink-0">
          <a href="/" className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-2 rounded">← Discovery</a>
          <button onClick={logout} className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-2 rounded">Log out</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-10 pb-safe">

        {/* ── Config ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Config</h2>
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Goodreads Cookie</label>
              <textarea
                value={cookieDraft}
                onChange={(e) => setCookieDraft(e.target.value)}
                rows={4}
                className="w-full bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-400 resize-y"
                placeholder="Paste your Goodreads session cookie here…"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={saveConfig}
                disabled={configSaving}
                className="px-4 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium transition-colors"
              >
                {configSaving ? 'Saving…' : 'Save'}
              </button>
              {configMsg && <span className="text-xs text-zinc-400">{configMsg}</span>}
            </div>
          </div>
        </section>

        {/* ── Queue Job ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Queue Job</h2>
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
              <div className="col-span-2 sm:col-auto">
                <label className="block text-xs text-zinc-400 mb-1">Genre slug</label>
                <input
                  type="text"
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  placeholder="e.g. fantasy"
                  className="w-full sm:w-48 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 sm:py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                  onKeyDown={(e) => e.key === 'Enter' && queueJob()}
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Start page</label>
                <input
                  type="number"
                  value={newStartPage}
                  onChange={(e) => setNewStartPage(parseInt(e.target.value, 10))}
                  min={1}
                  className="w-full sm:w-20 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 sm:py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Max page</label>
                <input
                  type="number"
                  value={newMaxPage}
                  onChange={(e) => setNewMaxPage(parseInt(e.target.value, 10))}
                  min={1}
                  className="w-full sm:w-20 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 sm:py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <button
                onClick={queueJob}
                className="col-span-2 sm:col-auto px-4 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
              >
                Queue
              </button>
            </div>
            {jobMsg && <p className="mt-2 text-xs text-zinc-400">{jobMsg}</p>}
          </div>
        </section>

        {/* ── Genre Merges ───────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Genre Merges</h2>
          <div className="space-y-4">

            {/* Merge form */}
            <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
                <div className="col-span-2 sm:col-auto">
                  <label className="block text-xs text-zinc-400 mb-1">Merge genre</label>
                  <input
                    type="text"
                    value={mergeFrom}
                    onChange={(e) => setMergeFrom(e.target.value)}
                    list="alias-from-options"
                    placeholder="e.g. science-fiction"
                    className="w-full sm:w-56 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 sm:py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                  />
                </div>
                <div className="col-span-2 sm:col-auto">
                  <label className="block text-xs text-zinc-400 mb-1">Into</label>
                  <input
                    type="text"
                    value={mergeInto}
                    onChange={(e) => setMergeInto(e.target.value)}
                    list="alias-into-options"
                    placeholder="e.g. sci-fi"
                    className="w-full sm:w-56 bg-zinc-900 border border-zinc-600 rounded px-3 py-2 sm:py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                    onKeyDown={(e) => e.key === 'Enter' && mergeGenres()}
                  />
                </div>
                <button
                  onClick={mergeGenres}
                  className="col-span-2 sm:col-auto px-4 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
                >
                  Merge
                </button>
              </div>
              <datalist id="alias-from-options">
                {aliasData?.originals.filter((o) => !o.mergedInto).map((o) => <option key={o.genre} value={o.genre} />)}
              </datalist>
              <datalist id="alias-into-options">
                {[
                  ...new Set([
                    ...(aliasData?.merges.map((m) => m.canonical) ?? []),
                    ...(aliasData?.originals.filter((o) => !o.mergedInto).map((o) => o.genre) ?? []),
                  ]),
                ].map((g) => <option key={g} value={g} />)}
              </datalist>
              {aliasMsg && <p className="mt-2 text-xs text-zinc-400">{aliasMsg}</p>}
              <p className="mt-2 text-xs text-zinc-500">
                Merges only change how genres display and filter — raw tags on books stay untouched, so a split fully restores the originals.
              </p>
            </div>

            {/* Merged genres */}
            <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-5">
              <h3 className="text-xs text-zinc-400 uppercase tracking-wider mb-3">Merged genres</h3>
              {!aliasData || aliasData.merges.length === 0 ? (
                <p className="text-xs text-zinc-500">No merged genres yet.</p>
              ) : (
                <ul className="space-y-2">
                  {aliasData.merges.map((m) => (
                    <li
                      key={m.canonical}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
                    >
                      <div className="min-w-0 text-sm">
                        <span className="font-mono text-zinc-200">{m.canonical}</span>
                        <span className="ml-2 text-xs text-zinc-500">{m.count.toLocaleString('en-US')} books</span>
                        <div className="text-xs text-zinc-400 mt-0.5 break-words">← {m.sources.join(', ')}</div>
                      </div>
                      <button
                        onClick={() => splitGenre(m.canonical)}
                        className="shrink-0 self-start sm:self-auto px-3 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
                      >
                        Split
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Original genres */}
            <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-xs text-zinc-400 uppercase tracking-wider">Original genres</h3>
                <input
                  type="text"
                  value={genreFilter}
                  onChange={(e) => setGenreFilter(e.target.value)}
                  placeholder="Filter original genres…"
                  className="w-40 sm:w-56 bg-zinc-900 border border-zinc-600 rounded px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-400"
                />
              </div>
              {!aliasData || aliasData.originals.length === 0 ? (
                <p className="text-xs text-zinc-500">No genres yet.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-0.5 pr-1">
                  {aliasData.originals
                    .filter((o) => !genreFilter || o.genre.includes(genreFilter.trim().toLowerCase()))
                    .map((o) => (
                      <button
                        key={o.genre}
                        onClick={() => setMergeFrom(o.genre)}
                        title={`Use "${o.genre}" as merge source`}
                        className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-700/40 transition-colors"
                      >
                        <span className={`font-mono truncate ${o.mergedInto ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                          {o.genre}
                        </span>
                        {o.mergedInto && <span className="shrink-0 text-zinc-500">→ {o.mergedInto}</span>}
                        <span className="ml-auto shrink-0 text-zinc-500 italic">{o.count.toLocaleString('en-US')}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Scraper Log ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Scraper Log</h2>
          <div className="bg-zinc-900 border border-zinc-700 rounded h-40 overflow-y-auto p-2 font-mono text-xs text-zinc-400">
            {scraperLogs.length === 0 ? (
              <span className="text-zinc-600">No scraper activity yet…</span>
            ) : (
              scraperLogs.map((line, i) => <div key={i}>{line}</div>)
            )}
          </div>
        </section>

        {/* ── Recent Jobs ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Recent Jobs</h2>
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 overflow-hidden">
            {jobs.length === 0 ? (
              <p className="text-xs text-zinc-500 p-5">No jobs yet.</p>
            ) : (
              <div className="overflow-y-auto overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="sticky top-0 bg-zinc-800">
                    <tr className="border-b border-zinc-700 text-xs text-zinc-400 uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 font-medium">Genre</th>
                      <th className="text-left px-4 py-2.5 font-medium">Status</th>
                      <th className="text-right px-4 py-2.5 font-medium">Page</th>
                      <th className="text-right px-4 py-2.5 font-medium">Scraped</th>
                      <th className="text-right px-4 py-2.5 font-medium">Max</th>
                      <th className="text-left px-4 py-2.5 font-medium">Created</th>
                      <th className="text-left px-4 py-2.5 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job._id} className="border-b border-zinc-700/50 hover:bg-zinc-700/20">
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-200">{job.genre}</td>
                        <td className="px-4 py-2.5"><StatusBadge status={job.status} /></td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{job.currentPage}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{job.pagesScraped}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{job.maxPage}</td>
                        <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                          {new Date(job.createdAt).toLocaleString('en-US')}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-red-400 max-w-[200px] truncate" title={job.error ?? ''}>
                          {job.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
