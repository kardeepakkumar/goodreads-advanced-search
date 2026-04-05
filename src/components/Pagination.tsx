'use client'

interface Props {
  page: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}

export default function Pagination({ page, total, pageSize, onChange }: Props) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const pages: (number | '…')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('…')
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
    if (page < totalPages - 2) pages.push('…')
    pages.push(totalPages)
  }

  const navBtn = 'px-2.5 py-1.5 rounded text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed'

  return (
    <div className="flex items-center gap-1 justify-center pt-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className={navBtn}
        style={{ color: 'var(--text-muted)' }}
      >
        ‹
      </button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e-${i}`} className="px-2" style={{ color: 'var(--text-faint)' }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            className={`${navBtn} ${p === page ? 'bg-blue-600 text-white' : ''}`}
            style={p === page ? {} : { color: 'var(--text-muted)' }}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        className={navBtn}
        style={{ color: 'var(--text-muted)' }}
      >
        ›
      </button>

      <span className="ml-3 text-xs" style={{ color: 'var(--text-faint)' }}>
        {total.toLocaleString('en-US')} books
      </span>
    </div>
  )
}
