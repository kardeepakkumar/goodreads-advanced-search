// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import AdminPage from '@/app/admin/page'

const { routerMock } = vi.hoisted(() => ({
  routerMock: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }))

const RUNNING_JOB = {
  _id: 'j1',
  genre: 'fantasy',
  status: 'running',
  startPage: 1,
  currentPage: 3,
  maxPage: 25,
  pagesScraped: 2,
  override: false,
  schemaVersion: 1,
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T10:05:00.000Z',
  error: null,
}

const DONE_JOB = { ...RUNNING_JOB, _id: 'j2', genre: 'magic', status: 'done' }

let state: { authOk: boolean; jobs: unknown[]; logs: string[] }
let fetchLog: { url: string; init?: RequestInit }[]

function jsonRes(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response
}

beforeEach(() => {
  state = { authOk: true, jobs: [], logs: [] }
  fetchLog = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      fetchLog.push({ url: u, init })
      const method = init?.method ?? 'GET'
      if (u === '/api/admin/config' && method === 'GET') {
        return state.authOk
          ? jsonRes({ _id: 'global', goodreadsCookie: 'existing-cookie', rateLimitMs: 10000 })
          : jsonRes({ error: 'Unauthorized' }, 401)
      }
      if (u === '/api/admin/config' && method === 'PUT') return jsonRes({ ok: true })
      if (u === '/api/admin/jobs' && method === 'POST') {
        return jsonRes({ job: { genre: JSON.parse(String(init!.body)).genre } })
      }
      if (u === '/api/admin/jobs') return jsonRes({ jobs: state.jobs })
      if (u === '/api/admin/logs') return jsonRes({ logs: state.logs })
      if (u === '/api/admin/auth/logout') return jsonRes({ ok: true })
      return jsonRes({ error: 'not found' }, 404)
    })
  )
})

function calls(url: string, method = 'GET') {
  return fetchLog.filter((c) => c.url === url && (c.init?.method ?? 'GET') === method)
}

// The fetch mock resolves in microtasks only, so draining the microtask queue
// settles all mount-time loads deterministically (works under fake timers too).
async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

async function renderAdmin() {
  render(<AdminPage />)
  await flush()
  await flush()
  await flush()
}

describe('AdminPage — auth gate', () => {
  it('redirects to the login page when the session is rejected', async () => {
    state.authOk = false
    await renderAdmin()

    expect(routerMock.replace).toHaveBeenCalledWith('/admin/login')
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })
})

describe('AdminPage — content and forms', () => {
  it('renders all four sections with loaded config, jobs and logs', async () => {
    state.jobs = [DONE_JOB]
    state.logs = ['[10:00:00 AM] ✓ magic p3 — 50 books']
    await renderAdmin()

    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    for (const section of ['Config', 'Queue Job', 'Scraper Log', 'Recent Jobs']) {
      expect(screen.getByText(section)).toBeInTheDocument()
    }

    expect(screen.getByPlaceholderText('Paste your Goodreads session cookie here…')).toHaveValue('existing-cookie')
    expect(screen.getByText('[10:00:00 AM] ✓ magic p3 — 50 books')).toBeInTheDocument()

    const jobRow = screen.getByText('magic').closest('tr')!
    expect(within(jobRow).getByText('done')).toBeInTheDocument()
  })

  it('shows empty states before any activity', async () => {
    await renderAdmin()
    expect(screen.getByText('No scraper activity yet…')).toBeInTheDocument()
    expect(screen.getByText('No jobs yet.')).toBeInTheDocument()
  })

  it('queues a job with genre, startPage and maxPage from the form', async () => {
    await renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('e.g. fantasy'), { target: { value: 'horror' } })
    const [startInput, maxInput] = screen.getAllByRole('spinbutton')
    fireEvent.change(startInput, { target: { value: '2' } })
    fireEvent.change(maxInput, { target: { value: '9' } })

    const jobsBefore = calls('/api/admin/jobs').length
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    await flush()
    await flush()

    const post = calls('/api/admin/jobs', 'POST')
    expect(post).toHaveLength(1)
    expect(JSON.parse(String(post[0].init!.body))).toEqual({ genre: 'horror', startPage: 2, maxPage: 9 })
    expect(post[0].init!.headers).toMatchObject({ 'Content-Type': 'application/json' })

    expect(screen.getByText('Queued job for "horror"')).toBeInTheDocument()
    // The job list refreshes right after queueing.
    expect(calls('/api/admin/jobs').length).toBeGreaterThan(jobsBefore)
  })

  it('submits the queue form on Enter in the genre field', async () => {
    await renderAdmin()

    const genreInput = screen.getByPlaceholderText('e.g. fantasy')
    fireEvent.change(genreInput, { target: { value: 'mystery' } })
    fireEvent.keyDown(genreInput, { key: 'Enter' })
    await flush()

    const post = calls('/api/admin/jobs', 'POST')
    expect(post).toHaveLength(1)
    expect(JSON.parse(String(post[0].init!.body))).toMatchObject({ genre: 'mystery' })
  })

  it('does not queue anything for a blank genre', async () => {
    await renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
    await flush()
    expect(calls('/api/admin/jobs', 'POST')).toHaveLength(0)
  })

  it('saves the Goodreads cookie with the existing rate limit', async () => {
    await renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('Paste your Goodreads session cookie here…'), {
      target: { value: 'fresh-cookie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await flush()
    await flush()

    const put = calls('/api/admin/config', 'PUT')
    expect(put).toHaveLength(1)
    expect(JSON.parse(String(put[0].init!.body))).toEqual({
      goodreadsCookie: 'fresh-cookie',
      rateLimitMs: 10000,
    })
    expect(screen.getByText('Saved.')).toBeInTheDocument()
  })

  it('logs out and returns to the login page', async () => {
    await renderAdmin()

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await flush()

    expect(calls('/api/admin/auth/logout', 'POST')).toHaveLength(1)
    expect(routerMock.push).toHaveBeenCalledWith('/admin/login')
  })
})

describe('AdminPage — polling cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it('refreshes jobs every 4s while a job is queued or running', async () => {
    state.jobs = [RUNNING_JOB]
    await renderAdmin()
    expect(calls('/api/admin/jobs')).toHaveLength(1)

    await advance(3999)
    expect(calls('/api/admin/jobs')).toHaveLength(1)
    await advance(1)
    expect(calls('/api/admin/jobs')).toHaveLength(2)

    await advance(4000)
    expect(calls('/api/admin/jobs')).toHaveLength(3)
  })

  it('slows to a 20s refresh when no job is active', async () => {
    state.jobs = [DONE_JOB]
    await renderAdmin()
    expect(calls('/api/admin/jobs')).toHaveLength(1)

    await advance(19_999)
    expect(calls('/api/admin/jobs')).toHaveLength(1)
    await advance(1)
    expect(calls('/api/admin/jobs')).toHaveLength(2)
  })

  it('polls the scraper log every 3s', async () => {
    await renderAdmin()
    expect(calls('/api/admin/logs')).toHaveLength(1) // immediate poll on load

    await advance(3000)
    expect(calls('/api/admin/logs')).toHaveLength(2)
    await advance(3000)
    expect(calls('/api/admin/logs')).toHaveLength(3)
  })
})
