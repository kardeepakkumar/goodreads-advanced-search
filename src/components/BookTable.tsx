'use client'

import { Book } from '@/types'

interface Props {
  books: Book[]
  loading: boolean
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span className="text-yellow-500 text-xs" title={`${rating.toFixed(2)}`}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}
    </span>
  )
}

export default function BookTable({ books, loading }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <svg
          className="animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: 'var(--text-muted)' }}
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</span>
      </div>
    )
  }

  if (books.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-sm" style={{ color: 'var(--text-faint)' }}>
        No books match your filters.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider" style={{ borderBottom: '1px solid var(--border-sub)', color: 'var(--text-muted)' }}>
            <th className="text-left py-2 pr-4 font-medium">Title</th>
            <th className="text-left py-2 pr-4 font-medium">Author</th>
            <th className="text-right py-2 pr-4 font-medium">Rating</th>
            <th className="text-right py-2 pr-4 font-medium"># Ratings</th>
            <th className="text-left py-2 font-medium">Genres</th>
          </tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <tr
              key={book.goodreadsUrl}
              className="transition-colors hover:bg-[var(--bg-surface)]"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <td className="py-2.5 pr-4 max-w-[260px]">
                <a
                  href={book.goodreadsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline transition-colors line-clamp-2"
                  style={{ color: '#60a5fa' }}
                >
                  {book.title}
                </a>
              </td>
              <td className="py-2.5 pr-4 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                {book.author}
              </td>
              <td className="py-2.5 pr-4 text-right whitespace-nowrap">
                <div className="flex flex-col items-end gap-0.5">
                  <StarRating rating={book.avgRating} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{book.avgRating.toFixed(2)}</span>
                </div>
              </td>
              <td className="py-2.5 pr-4 text-right whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                {book.numRatings.toLocaleString('en-US')}
              </td>
              <td className="py-2.5 max-w-[200px]">
                <div className="flex flex-wrap gap-1">
                  {book.genres.slice(0, 5).map((g) => (
                    <span
                      key={g}
                      className="px-1.5 py-0.5 rounded text-xs"
                      style={{ background: 'var(--bg-element)', color: 'var(--text-2)' }}
                    >
                      {g}
                    </span>
                  ))}
                  {book.genres.length > 5 && (
                    <span className="text-xs" style={{ color: 'var(--text-faint)' }}>+{book.genres.length - 5}</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
