// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, within } from '@testing-library/react'
import AdminPage from '@/app/admin/page'

const { routerMock } = vi.hoisted(() => ({
  routerMock: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }))

const OVERVIEW = {
  originals: [
    { genre: 'science-fiction', count: 42, mergedInto: 'sci-fi' },
    { genre: 'scifi', count: 7, mergedInto: 'sci-fi' },
    { genre: 'space-opera', count: 12, mergedInto: null },
    { genre: 'westerns', count: 3, mergedInto: null },
  ],
  // 45 < 42 + 7 + … — the API dedupes books tagged with several sources.
  merges: [{ canonical: 'sci-fi', sources: ['science-fiction', 'scifi'], count: 45 }],
}

let state: {
  aliases: typeof OVERVIEW
  mergeStatus: number
  mergeBody: unknown
}
let fetchLog: { url: string; init?: RequestInit }[]

function jsonRes(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response
}

beforeEach(() => {
  state = { aliases: OVERVIEW, mergeStatus: 200, mergeBody: { ok: true } }
  fetchLog = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      fetchLog.push({ url: u, init })
      const method = init?.method ?? 'GET'
      if (u === '/api/admin/config' && method === 'GET') {
        return jsonRes({ _id: 'global', goodreadsCookie: 'ck', rateLimitMs: 10000 })
      }
      if (u === '/api/admin/jobs') return jsonRes({ jobs: [] })
      if (u === '/api/admin/logs') return jsonRes({ logs: [] })
      if (u === '/api/admin/aliases' && method === 'GET') return jsonRes(state.aliases)
      if (u === '/api/admin/aliases' && method === 'POST') {
        return jsonRes(state.mergeBody, state.mergeStatus)
      }
      if (u.startsWith('/api/admin/aliases?') && method === 'DELETE') {
        return jsonRes({ ok: true, canonical: 'sci-fi', released: 2 })
      }
      return jsonRes({ error: 'not found' }, 404)
    })
  )
})

function calls(predicate: (c: { url: string; init?: RequestInit }) => boolean) {
  return fetchLog.filter(predicate)
}

const aliasGETs = () =>
  calls((c) => c.url === '/api/admin/aliases' && (c.init?.method ?? 'GET') === 'GET')

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

function mergedCard() {
  return within(screen.getByText('Merged genres').closest('div')!)
}

function originalsCard() {
  return within(screen.getByText('Original genres').closest('div')!.parentElement!)
}

describe('Genre Merges — overview', () => {
  it('lists merged genres with their sources, deduped count, and a Split button', async () => {
    await renderAdmin()

    expect(screen.getByText('Genre Merges')).toBeInTheDocument()
    const card = mergedCard()
    expect(card.getByText('sci-fi')).toBeInTheDocument()
    expect(card.getByText('45 books')).toBeInTheDocument()
    expect(card.getByText('← science-fiction, scifi')).toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Split' })).toBeInTheDocument()
  })

  it('lists every original genre with its count, marking merged-away ones', async () => {
    await renderAdmin()

    const card = originalsCard()
    expect(card.getByText('science-fiction')).toBeInTheDocument()
    expect(card.getByText('42')).toBeInTheDocument()
    expect(card.getByText('space-opera')).toBeInTheDocument()
    expect(card.getByText('12')).toBeInTheDocument()
    expect(card.getAllByText('→ sci-fi')).toHaveLength(2) // science-fiction and scifi
  })

  it('filters the original list', async () => {
    await renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('Filter original genres…'), {
      target: { value: 'space' },
    })
    const card = originalsCard()
    expect(card.getByText('space-opera')).toBeInTheDocument()
    expect(card.queryByText('westerns')).not.toBeInTheDocument()
  })

  it('shows empty states before any merge exists', async () => {
    state.aliases = { originals: [], merges: [] }
    await renderAdmin()
    expect(screen.getByText('No merged genres yet.')).toBeInTheDocument()
    expect(screen.getByText('No genres yet.')).toBeInTheDocument()
  })
})

describe('Genre Merges — merge action', () => {
  it('POSTs { from, into } and reloads the overview on success', async () => {
    await renderAdmin()
    const loadsBefore = aliasGETs().length

    fireEvent.change(screen.getByPlaceholderText('e.g. science-fiction'), {
      target: { value: 'space-opera' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. sci-fi'), {
      target: { value: 'sci-fi' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await flush()
    await flush()

    const posts = calls((c) => c.url === '/api/admin/aliases' && c.init?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0].init!.body))).toEqual({ from: 'space-opera', into: 'sci-fi' })

    expect(screen.getByText('Merged "space-opera" into "sci-fi"')).toBeInTheDocument()
    expect(aliasGETs().length).toBeGreaterThan(loadsBefore)
  })

  it('submits on Enter in the target field', async () => {
    await renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('e.g. science-fiction'), {
      target: { value: 'westerns' },
    })
    const into = screen.getByPlaceholderText('e.g. sci-fi')
    fireEvent.change(into, { target: { value: 'western' } })
    fireEvent.keyDown(into, { key: 'Enter' })
    await flush()

    const posts = calls((c) => c.url === '/api/admin/aliases' && c.init?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(String(posts[0].init!.body))).toEqual({ from: 'westerns', into: 'western' })
  })

  it('does nothing when either field is blank', async () => {
    await renderAdmin()
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await flush()
    expect(calls((c) => c.init?.method === 'POST' && c.url === '/api/admin/aliases')).toHaveLength(0)
  })

  it('surfaces the server error, e.g. the chain-prevention 409', async () => {
    state.mergeStatus = 409
    state.mergeBody = { error: '"scifi" is already merged into "sci-fi" — merge into "sci-fi" instead' }
    await renderAdmin()

    fireEvent.change(screen.getByPlaceholderText('e.g. science-fiction'), {
      target: { value: 'space-opera' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. sci-fi'), {
      target: { value: 'scifi' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    await flush()
    await flush()

    expect(
      screen.getByText('"scifi" is already merged into "sci-fi" — merge into "sci-fi" instead')
    ).toBeInTheDocument()
  })

  it('prefills the merge source when an original genre row is clicked', async () => {
    await renderAdmin()

    fireEvent.click(originalsCard().getByText('space-opera').closest('button')!)
    expect(screen.getByPlaceholderText('e.g. science-fiction')).toHaveValue('space-opera')
  })
})

describe('Genre Merges — split action', () => {
  it('DELETEs the canonical and reloads the overview', async () => {
    await renderAdmin()
    const loadsBefore = aliasGETs().length

    fireEvent.click(mergedCard().getByRole('button', { name: 'Split' }))
    await flush()
    await flush()

    const deletes = calls((c) => c.init?.method === 'DELETE')
    expect(deletes).toHaveLength(1)
    expect(deletes[0].url).toBe('/api/admin/aliases?canonical=sci-fi')

    expect(screen.getByText('Split "sci-fi" — 2 genre(s) restored')).toBeInTheDocument()
    expect(aliasGETs().length).toBeGreaterThan(loadsBefore)
  })
})
