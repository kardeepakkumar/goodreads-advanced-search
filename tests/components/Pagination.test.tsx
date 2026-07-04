// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pagination from '@/components/Pagination'

describe('Pagination', () => {
  it('renders nothing when everything fits on one page', () => {
    const { container } = render(<Pagination page={1} total={25} pageSize={25} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists every page when there are 7 or fewer', () => {
    render(<Pagination page={1} total={75} pageSize={25} onChange={() => {}} />)
    for (const label of ['1', '2', '3']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByText('…')).not.toBeInTheDocument()
  })

  it('collapses long ranges around the current page with ellipses', () => {
    // 1000 books / 25 per page = 40 pages, currently on page 10
    render(<Pagination page={10} total={1000} pageSize={25} onChange={() => {}} />)

    for (const label of ['1', '9', '10', '11', '40']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getAllByText('…')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument()
    expect(screen.getByText('1,000 books')).toBeInTheDocument()
  })

  it('only shows the trailing ellipsis near the start of a long range', () => {
    render(<Pagination page={1} total={1000} pageSize={25} onChange={() => {}} />)
    expect(screen.getAllByText('…')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '40' })).toBeInTheDocument()
  })

  it('navigates by page number and prev/next arrows', async () => {
    const onChange = vi.fn()
    render(<Pagination page={10} total={1000} pageSize={25} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: '11' }))
    expect(onChange).toHaveBeenLastCalledWith(11)

    await userEvent.click(screen.getByRole('button', { name: '‹' }))
    expect(onChange).toHaveBeenLastCalledWith(9)

    await userEvent.click(screen.getByRole('button', { name: '›' }))
    expect(onChange).toHaveBeenLastCalledWith(11)
  })

  it('disables prev on the first page and next on the last', () => {
    const { rerender } = render(<Pagination page={1} total={75} pageSize={25} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '‹' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '›' })).toBeEnabled()

    rerender(<Pagination page={3} total={75} pageSize={25} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '‹' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '›' })).toBeDisabled()
  })
})
