// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BookTable from '@/components/BookTable'
import { Book } from '@/types'

const BOOK: Book = {
  goodreadsUrl: 'https://www.goodreads.com/book/show/1.Dune',
  title: 'Dune',
  author: 'Frank Herbert',
  avgRating: 4.27,
  numRatings: 1234567,
  genres: ['scifi', 'classics', 'space', 'adventure', 'epic', 'desert', 'politics'],
}

describe('BookTable', () => {
  it('shows a loading state', () => {
    render(<BookTable books={[]} loading={true} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows an empty state when nothing matches', () => {
    render(<BookTable books={[]} loading={false} />)
    expect(screen.getByText('No books match your filters.')).toBeInTheDocument()
  })

  it('links each title to its Goodreads page in a new tab', () => {
    render(<BookTable books={[BOOK]} loading={false} />)
    const link = screen.getByRole('link', { name: 'Dune' })
    expect(link).toHaveAttribute('href', BOOK.goodreadsUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('shows author, two-decimal rating, and localized ratings count', () => {
    render(<BookTable books={[BOOK]} loading={false} />)
    expect(screen.getByText('Frank Herbert')).toBeInTheDocument()
    expect(screen.getByText('4.27')).toBeInTheDocument()
    expect(screen.getByText('1,234,567')).toBeInTheDocument()
  })

  it('shows at most five genre tags plus an overflow counter', () => {
    render(<BookTable books={[BOOK]} loading={false} />)
    for (const g of ['scifi', 'classics', 'space', 'adventure', 'epic']) {
      expect(screen.getByText(g)).toBeInTheDocument()
    }
    expect(screen.queryByText('desert')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders one row per book', () => {
    const second: Book = { ...BOOK, goodreadsUrl: 'https://www.goodreads.com/book/show/2.Foundation', title: 'Foundation', author: 'Isaac Asimov', genres: ['scifi'] }
    render(<BookTable books={[BOOK, second]} loading={false} />)
    expect(screen.getByRole('link', { name: 'Dune' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Foundation' })).toBeInTheDocument()
  })
})
