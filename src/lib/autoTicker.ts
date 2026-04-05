import { runOneTick } from './ticker'

let started = false

// In-memory ring buffer stored on global so API routes share the same instance
const LOG_MAX = 20
const g = global as any
if (!g.__scraperLogs) g.__scraperLogs = []
export const recentLogs: string[] = g.__scraperLogs

function log(msg: string) {
  const line = `[${new Date().toLocaleTimeString('en-US')}] ${msg}`
  console.log('[ticker]', line)
  if (recentLogs.length >= LOG_MAX) recentLogs.shift()
  recentLogs.push(line)
}

export function startBackgroundTicker() {
  if (started) return
  started = true
  log('Background ticker started')

  async function loop() {
    try {
      const result = await runOneTick()

      if (result.status === 'ok') {
        log(`✓ ${result.genre} p${result.currentPage} — ${result.booksProcessed} books${result.missingRatings ? ` (⚠ ${result.missingRatings} missing ratings)` : ''}`)
      } else if (result.status === 'done') {
        log(`✅ Done: ${result.genre} (${result.booksProcessed} books on last page)${result.missingRatings ? ` (⚠ ${result.missingRatings} missing ratings)` : ''}`)
      } else if (result.status === 'error') {
        log(`✗ ${result.message}`)
      }
      // no_jobs and rate_limited are silent

      const delay =
        result.status === 'no_jobs'      ? 30_000
        : result.status === 'rate_limited' ? (result.waitMs ?? 10_000) + 200
        : 500

      setTimeout(loop, delay)
    } catch (err: any) {
      log(`✗ Unexpected error: ${err?.message ?? err}`)
      setTimeout(loop, 10_000)
    }
  }

  setTimeout(loop, 2000)
}
