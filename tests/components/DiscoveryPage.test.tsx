// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DiscoveryPage from '@/components/DiscoveryPage'
import { Book } from '@/types'

// Genres for the sidebar. The fixture book's own genres are distinct strings
// so text queries never collide between the panel and the results table.
const SIDEBAR_GENRES = ['fantasy', 'magic', 'war']

const BOOK: Book = {
  goodreadsUrl: 'https://www.goodreads.com/book/show/99.Test',
  title: 'The Great Test Novel',
  author: 'Testy McAuthor',
  avgRating: 4.5,
  numRatings: 42000,
  genres: ['epic-classics'],
}

let fetchCalls: string[]

function booksCalls() {
  return fetchCalls.filter((u) => u.startsWith('/api/books'))
}

function lastBooksQuery() {
  const calls = booksCalls()
  return calls[calls.length - 1]?.split('?')[1] ?? ''
}

beforeEach(() => {
  fetchCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url)
      fetchCalls.push(u)
      const body = u.startsWith('/api/genres')
        ? { genres: SIDEBAR_GENRES }
        : {
            books: [BOOK],
            total: 60,
            totalDataset: 50000,
            genreFacets: [
              { genre: 'fantasy', count: 10 },
              { genre: 'magic', count: 5 },
              { genre: 'war', count: 2 },
            ],
          }
      return { ok: true, status: 200, json: async () => body } as Response
    })
  )
})

async function renderDiscovery() {
  render(<DiscoveryPage />)
  // Initial data: sidebar genres + first results page.
  await screen.findByText('fantasy')
  await screen.findByRole('link', { name: 'The Great Test Novel' })
}

function genreRow(genre: string) {
  return within(screen.getByText(genre).closest('div')!)
}

describe('DiscoveryPage — API URL contract', () => {
  it('loads genres and the default first page on mount', async () => {
    await renderDiscovery()

    expect(fetchCalls).toContain('/api/genres')
    expect(booksCalls()[0]).toBe('/api/books?sortBy=avgRating&sortDir=desc&page=1')
  })

  it('shows the matching and dataset totals', async () => {
    await renderDiscovery()
    expect(screen.getByText('60')).toBeInTheDocument()
    expect(screen.getByText('matching')).toBeInTheDocument()
    expect(screen.getByText('50,000')).toBeInTheDocument()
    expect(screen.getByText('books shelved')).toBeInTheDocument()
  })

  it('sends included genres as repeated genres params', async () => {
    await renderDiscovery()

    await userEvent.click(genreRow('fantasy').getByTitle('Include'))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('genres=fantasy&sortBy=avgRating&sortDir=desc&page=1')
    )

    await userEvent.click(genreRow('magic').getByTitle('Include'))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('genres=fantasy&genres=magic&sortBy=avgRating&sortDir=desc&page=1')
    )
  })

  it('sends excluded genres as excludeGenres params', async () => {
    await renderDiscovery()

    await userEvent.click(genreRow('war').getByTitle('Exclude'))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('excludeGenres=war&sortBy=avgRating&sortDir=desc&page=1')
    )
  })

  it('sends rating filters only when they differ from the defaults', async () => {
    await renderDiscovery()

    await userEvent.click(screen.getByRole('button', { name: '≥ 4' }))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('minRating=4&sortBy=avgRating&sortDir=desc&page=1')
    )

    await userEvent.click(screen.getByRole('button', { name: '≥ 1,000' }))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('minRating=4&minRatings=1000&sortBy=avgRating&sortDir=desc&page=1')
    )
  })

  it('sends sort field and direction changes', async () => {
    await renderDiscovery()

    await userEvent.selectOptions(screen.getByRole('combobox'), 'numRatings')
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('sortBy=numRatings&sortDir=desc&page=1')
    )

    await userEvent.click(screen.getByTitle('Toggle sort direction'))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('sortBy=numRatings&sortDir=asc&page=1')
    )
  })

  it('paginates without resetting filters, and filter changes reset to page 1', async () => {
    await renderDiscovery()

    await userEvent.click(genreRow('fantasy').getByTitle('Include'))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('genres=fantasy&sortBy=avgRating&sortDir=desc&page=1')
    )

    // total=60 → 3 pages of 25
    await userEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('genres=fantasy&sortBy=avgRating&sortDir=desc&page=2')
    )

    await userEvent.click(genreRow('magic').getByTitle('Include'))
    await waitFor(() =>
      expect(lastBooksQuery()).toBe('genres=fantasy&genres=magic&sortBy=avgRating&sortDir=desc&page=1')
    )
  })
})

describe('DiscoveryPage — search debounce', () => {
  it('debounces text search ~400ms and sends a single q request', async () => {
    await renderDiscovery()
    const initialBooksCalls = booksCalls().length

    await userEvent.type(screen.getByPlaceholderText('Search title or author…'), 'dune')

    // No immediate fetch — the query is debounced.
    expect(booksCalls().length).toBe(initialBooksCalls)
    await new Promise((r) => setTimeout(r, 150))
    expect(booksCalls().length).toBe(initialBooksCalls)

    await waitFor(
      () => expect(lastBooksQuery()).toBe('q=dune&sortBy=avgRating&sortDir=desc&page=1'),
      { timeout: 2000 }
    )

    // Intermediate keystrokes must not each fire a request.
    expect(booksCalls().length).toBe(initialBooksCalls + 1)
  })
})
