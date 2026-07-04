// @vitest-environment jsdom
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GenrePanel from '@/components/GenrePanel'
import { DEFAULT_FILTERS, FilterState, GenreFacet } from '@/types'

// Drives GenrePanel exactly the way DiscoveryPage does: onChange patches are
// applied to shared filter state (with the page-reset rule) and recorded.
function Harness({
  allGenres,
  facets = [],
  onPatch = () => {},
}: {
  allGenres: string[]
  facets?: GenreFacet[]
  onPatch?: (p: Partial<FilterState>) => void
}) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  return (
    <GenrePanel
      allGenres={allGenres}
      facets={facets}
      filters={filters}
      onChange={(p) => {
        onPatch(p)
        setFilters((prev) => ({ ...prev, ...p, page: p.page ?? 1 }))
      }}
    />
  )
}

// A genre row is the container that holds the genre label together with its
// include/exclude controls (buttons titled "Include" / "Exclude").
function row(genre: string) {
  return within(screen.getByText(genre).closest('div')!)
}

function expectVisualOrder(genres: string[]) {
  for (let i = 0; i < genres.length - 1; i++) {
    const a = screen.getByText(genres[i])
    const b = screen.getByText(genres[i + 1])
    // eslint-disable-next-line no-bitwise
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
}

describe('GenrePanel include/exclude cycling', () => {
  it('include click adds the genre; a second click removes it', async () => {
    const onPatch = vi.fn()
    render(<Harness allGenres={['fantasy', 'magic']} onPatch={onPatch} />)

    await userEvent.click(row('fantasy').getByTitle('Include'))
    expect(onPatch).toHaveBeenLastCalledWith({ genres: ['fantasy'], excludeGenres: [], page: 1 })

    await userEvent.click(row('fantasy').getByTitle('Include'))
    expect(onPatch).toHaveBeenLastCalledWith({ genres: [], excludeGenres: [], page: 1 })
  })

  it('exclude click adds to excludeGenres; a second click removes it', async () => {
    const onPatch = vi.fn()
    render(<Harness allGenres={['fantasy']} onPatch={onPatch} />)

    await userEvent.click(row('fantasy').getByTitle('Exclude'))
    expect(onPatch).toHaveBeenLastCalledWith({ genres: [], excludeGenres: ['fantasy'], page: 1 })

    await userEvent.click(row('fantasy').getByTitle('Exclude'))
    expect(onPatch).toHaveBeenLastCalledWith({ genres: [], excludeGenres: [], page: 1 })
  })

  it('a genre can flip directly between include and exclude, never in both', async () => {
    const onPatch = vi.fn()
    render(<Harness allGenres={['fantasy']} onPatch={onPatch} />)

    await userEvent.click(row('fantasy').getByTitle('Include'))
    await userEvent.click(row('fantasy').getByTitle('Exclude'))
    expect(onPatch).toHaveBeenLastCalledWith({ genres: [], excludeGenres: ['fantasy'], page: 1 })

    await userEvent.click(row('fantasy').getByTitle('Include'))
    expect(onPatch).toHaveBeenLastCalledWith({ genres: ['fantasy'], excludeGenres: [], page: 1 })
  })

  it('included genres accumulate (AND semantics)', async () => {
    const onPatch = vi.fn()
    render(<Harness allGenres={['fantasy', 'magic', 'war']} onPatch={onPatch} />)

    await userEvent.click(row('fantasy').getByTitle('Include'))
    await userEvent.click(row('magic').getByTitle('Include'))
    await userEvent.click(row('war').getByTitle('Exclude'))
    expect(onPatch).toHaveBeenLastCalledWith({
      genres: ['fantasy', 'magic'],
      excludeGenres: ['war'],
      page: 1,
    })
  })

  it('Clear resets both lists and disappears when nothing is active', async () => {
    const onPatch = vi.fn()
    render(<Harness allGenres={['fantasy', 'magic']} onPatch={onPatch} />)

    expect(screen.queryByText(/^Clear \(/)).not.toBeInTheDocument()

    await userEvent.click(row('fantasy').getByTitle('Include'))
    await userEvent.click(row('magic').getByTitle('Exclude'))

    await userEvent.click(screen.getByText('Clear (2)'))
    expect(onPatch).toHaveBeenLastCalledWith({ genres: [], excludeGenres: [], page: 1 })
    expect(screen.queryByText(/^Clear \(/)).not.toBeInTheDocument()
  })
})

describe('GenrePanel ordering and filtering', () => {
  const FACETS: GenreFacet[] = [
    { genre: 'beta', count: 100 },
    { genre: 'gamma', count: 50 },
    { genre: 'alpha', count: 1 },
  ]

  it('sorts inactive genres by facet count descending', () => {
    render(<Harness allGenres={['alpha', 'beta', 'gamma']} facets={FACETS} />)
    expectVisualOrder(['beta', 'gamma', 'alpha'])
  })

  it('pins active genres to the top in the order they were selected', async () => {
    render(<Harness allGenres={['alpha', 'beta', 'gamma']} facets={FACETS} />)

    await userEvent.click(row('alpha').getByTitle('Include'))
    expectVisualOrder(['alpha', 'beta', 'gamma'])

    await userEvent.click(row('gamma').getByTitle('Exclude'))
    expectVisualOrder(['alpha', 'gamma', 'beta'])

    // Deselecting drops the genre back into the count-ordered pool.
    await userEvent.click(row('alpha').getByTitle('Include'))
    expectVisualOrder(['gamma', 'beta', 'alpha'])
  })

  it('shows facet counts for inactive genres and hides them once active', async () => {
    render(<Harness allGenres={['alpha', 'beta']} facets={[{ genre: 'beta', count: 1234 }]} />)
    expect(screen.getByText('1,234')).toBeInTheDocument()

    await userEvent.click(row('beta').getByTitle('Include'))
    expect(screen.queryByText('1,234')).not.toBeInTheDocument()
  })

  it('filters inactive genres by the search box but always keeps active ones visible', async () => {
    render(<Harness allGenres={['alpha', 'beta', 'gamma']} facets={FACETS} />)

    await userEvent.click(row('alpha').getByTitle('Include'))
    await userEvent.type(screen.getByPlaceholderText('Filter genres…'), 'bet')

    expect(screen.getByText('alpha')).toBeInTheDocument() // active — pinned
    expect(screen.getByText('beta')).toBeInTheDocument() // matches search
    expect(screen.queryByText('gamma')).not.toBeInTheDocument()
  })

  it('shows an empty message when the search matches nothing', async () => {
    render(<Harness allGenres={['alpha']} />)
    await userEvent.type(screen.getByPlaceholderText('Filter genres…'), 'zzz')
    expect(screen.getByText('No genres match.')).toBeInTheDocument()
  })

  it('clears the search box when a newly searched genre is selected', async () => {
    render(<Harness allGenres={['alpha', 'beta']} />)
    const search = screen.getByPlaceholderText('Filter genres…')

    await userEvent.type(search, 'bet')
    await userEvent.click(row('beta').getByTitle('Include'))
    expect(search).toHaveValue('')
    expect(screen.getByText('alpha')).toBeInTheDocument()
  })
})
