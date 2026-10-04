// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RatingFilters from '@/components/RatingFilters'
import { DEFAULT_FILTERS, FilterState } from '@/types'

function renderFilters(overrides: Partial<FilterState> = {}) {
  const onChange = vi.fn()
  const filters = { ...DEFAULT_FILTERS, ...overrides }
  const view = render(<RatingFilters filters={filters} onChange={onChange} />)
  return { onChange, view }
}

// Each preset group shares a container with its label, so the group can be
// addressed without depending on page layout.
function group(label: string) {
  return within(screen.getByText(label).closest('div')!)
}

describe('RatingFilters', () => {
  it('offers the standard rating presets', () => {
    renderFilters()
    const ratingGroup = group('Min avg rating')
    for (const label of ['Any', '≥ 3', '≥ 3.5', '≥ 4', '≥ 4.25', '≥ 4.5']) {
      expect(ratingGroup.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('offers the standard ratings-count presets with localized labels', () => {
    renderFilters()
    const countGroup = group('Min ratings count')
    for (const label of ['Any', '≥ 1,000', '≥ 10,000', '≥ 100,000', '≥ 500,000']) {
      expect(countGroup.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('patches minRating when a rating preset is clicked', async () => {
    const { onChange } = renderFilters()
    await userEvent.click(group('Min avg rating').getByRole('button', { name: '≥ 4' }))
    expect(onChange).toHaveBeenCalledWith({ minRating: 4 })

    await userEvent.click(group('Min avg rating').getByRole('button', { name: 'Any' }))
    expect(onChange).toHaveBeenCalledWith({ minRating: 0 })
  })

  it('patches minRatings when a count preset is clicked', async () => {
    const { onChange } = renderFilters()
    await userEvent.click(group('Min ratings count').getByRole('button', { name: '≥ 1,000' }))
    expect(onChange).toHaveBeenCalledWith({ minRatings: 1000 })
  })

  it('exposes exactly the four sort fields with stable values', () => {
    renderFilters()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual([
      'avgRating',
      'numRatings',
      'title',
      'searchRank',
    ])
  })

  it('patches sortBy when a sort field is selected', async () => {
    const { onChange } = renderFilters()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'numRatings')
    expect(onChange).toHaveBeenCalledWith({ sortBy: 'numRatings' })
  })

  it('toggles the sort direction between desc and asc', async () => {
    const { onChange } = renderFilters()
    const toggle = screen.getByTitle('Toggle sort direction')
    expect(toggle).toHaveTextContent('↓')

    await userEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith({ sortDir: 'asc' })
  })

  it('shows the up arrow when sorting ascending', () => {
    renderFilters({ sortDir: 'asc' })
    expect(screen.getByTitle('Toggle sort direction')).toHaveTextContent('↑')
  })
})

describe('RatingFilters — published year', () => {
  it('offers optional from/to year inputs, empty by default', () => {
    renderFilters()
    const yearGroup = group('Published year')
    expect(yearGroup.getByLabelText('Published from year')).toHaveValue(null)
    expect(yearGroup.getByLabelText('Published to year')).toHaveValue(null)
  })

  it('commits a typed year once after a short pause, not per keystroke', async () => {
    const { onChange } = renderFilters()
    await userEvent.type(screen.getByLabelText('Published from year'), '1980')
    expect(onChange).not.toHaveBeenCalled()

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ minYear: 1980 }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('commits immediately on Enter and on blur', async () => {
    const { onChange } = renderFilters()
    await userEvent.type(screen.getByLabelText('Published to year'), '1979{Enter}')
    expect(onChange).toHaveBeenCalledWith({ maxYear: 1979 })

    await userEvent.type(screen.getByLabelText('Published from year'), '1950')
    await userEvent.tab()
    expect(onChange).toHaveBeenCalledWith({ minYear: 1950 })
  })

  it('clears a bound when the field is emptied', async () => {
    const { onChange } = renderFilters({ minYear: 2023 })
    const from = screen.getByLabelText('Published from year')
    expect(from).toHaveValue(2023)

    await userEvent.clear(from)
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith({ minYear: null })
  })
})
