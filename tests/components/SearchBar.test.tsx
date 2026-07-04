// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SearchBar from '@/components/SearchBar'

describe('SearchBar', () => {
  it('renders the controlled value in the title/author search input', () => {
    render(<SearchBar value="dune" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('Search title or author…')).toHaveValue('dune')
  })

  it('reports every edit through onChange', async () => {
    const onChange = vi.fn()
    render(<SearchBar value="dun" onChange={onChange} />)

    await userEvent.type(screen.getByPlaceholderText('Search title or author…'), 'e')
    expect(onChange).toHaveBeenCalledWith('dune')
  })

  it('clears the query via the clear button, which only exists while there is text', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<SearchBar value="dune" onChange={onChange} />)

    await userEvent.click(screen.getByLabelText('Clear search'))
    expect(onChange).toHaveBeenCalledWith('')

    rerender(<SearchBar value="" onChange={onChange} />)
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument()
  })
})
