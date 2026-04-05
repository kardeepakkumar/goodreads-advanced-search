'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppConfig, ScrapeJob } from '@/types'

interface JobsResponse {
  jobs: ScrapeJob[]
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

  useEffect(() => {
    loadConfig()
    loadJobs()
  }, [loadConfig, loadJobs])

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

  // ── Logout ──────────────────────────────────────────────────────────────────
  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  if (authState !== 'ok') return null

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <h1 className="text-base font-semibold">Admin Panel</h1>
        <div className="flex items-center gap-3">
          <a href="/" className="text-xs text-zinc-400 hover:text-zinc-200">← Discovery</a>
          <button onClick={logout} className="text-xs text-zinc-400 hover:text-zinc-200">Log out</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">

        {/* ── Config ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">Config</h2>
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 space-y-4">
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
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium transition-colors"
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
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Genre slug</label>
                <input
                  type="text"
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  placeholder="e.g. fantasy"
                  className="w-48 bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
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
                  className="w-20 bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Max page</label>
                <input
                  type="number"
                  value={newMaxPage}
                  onChange={(e) => setNewMaxPage(parseInt(e.target.value, 10))}
                  min={1}
                  className="w-20 bg-zinc-900 border border-zinc-600 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <button
                onClick={queueJob}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
              >
                Queue
              </button>
            </div>
            {jobMsg && <p className="mt-2 text-xs text-zinc-400">{jobMsg}</p>}
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
              <div className="overflow-y-auto max-h-[420px]">
                <table className="w-full text-sm">
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
                        <td className="px-4 py-2.5 text-xs text-zinc-500">
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
