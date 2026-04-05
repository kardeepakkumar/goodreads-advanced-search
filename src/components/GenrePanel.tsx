'use client'

import { useMemo, useState } from 'react'
import { FilterState, GenreFacet } from '@/types'

interface Props {
  allGenres: string[]
  facets: GenreFacet[]
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

type GenreState = 'neutral' | 'include' | 'exclude'

export default function GenrePanel({ allGenres, facets, filters, onChange }: Props) {
  const [search, setSearch] = useState('')
  const [activeOrder, setActiveOrder] = useState<string[]>([])

  const facetMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const f of facets) m[f.genre] = f.count
    return m
  }, [facets])

  const genreState = useMemo(() => {
    const m: Record<string, GenreState> = {}
    for (const g of allGenres) m[g] = 'neutral'
    for (const g of filters.genres) m[g] = 'include'
    for (const g of filters.excludeGenres) m[g] = 'exclude'
    return m
  }, [allGenres, filters.genres, filters.excludeGenres])

  const sorted = useMemo(() => {
    const activeSet = new Set([...filters.genres, ...filters.excludeGenres])
    const orderedActive = activeOrder.filter((g) => activeSet.has(g))
    const inactive = allGenres.filter((g) => !activeSet.has(g))
    inactive.sort((a, b) => (facetMap[b] ?? 0) - (facetMap[a] ?? 0))
    return [...orderedActive, ...inactive]
  }, [allGenres, activeOrder, filters.genres, filters.excludeGenres, facetMap])

  const filtered = useMemo(() => {
    if (!search) return sorted
    const lower = search.toLowerCase()
    const activeSet = new Set([...filters.genres, ...filters.excludeGenres])
    // Active genres always visible at top; inactive genres filtered by search
    return sorted.filter((g) => activeSet.has(g) || g.toLowerCase().includes(lower))
  }, [sorted, search, filters.genres, filters.excludeGenres])

  function setInclude(genre: string, e: React.MouseEvent) {
    e.stopPropagation()
    const current = genreState[genre]
    const newInclude = filters.genres.filter((g) => g !== genre)
    const newExclude = filters.excludeGenres.filter((g) => g !== genre)
    if (current !== 'include') {
      newInclude.push(genre)
      if (current === 'neutral') {
        setActiveOrder((prev) => [...prev, genre])
        setSearch('')
      }
    } else {
      setActiveOrder((prev) => prev.filter((g) => g !== genre))
    }
    onChange({ genres: newInclude, excludeGenres: newExclude, page: 1 })
  }

  function setExclude(genre: string, e: React.MouseEvent) {
    e.stopPropagation()
    const current = genreState[genre]
    const newInclude = filters.genres.filter((g) => g !== genre)
    const newExclude = filters.excludeGenres.filter((g) => g !== genre)
    if (current !== 'exclude') {
      newExclude.push(genre)
      if (current === 'neutral') {
        setActiveOrder((prev) => [...prev, genre])
        setSearch('')
      }
    } else {
      setActiveOrder((prev) => prev.filter((g) => g !== genre))
    }
    onChange({ genres: newInclude, excludeGenres: newExclude, page: 1 })
  }

  function clearAll() {
    setActiveOrder([])
    onChange({ genres: [], excludeGenres: [], page: 1 })
  }

  const activeCount = filters.genres.length + filters.excludeGenres.length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Genres</span>
        {activeCount > 0 && (
          <button onClick={clearAll} className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Clear ({activeCount})
          </button>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter genres…"
        className="mb-2 w-full rounded px-2.5 py-1.5 text-xs focus:outline-none"
        style={{ background: 'var(--bg-surface)', color: 'var(--text)', border: '1px solid var(--border-sub)' }}
      />

      <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
        {filtered.map((genre) => {
          const state = genreState[genre]
          const count = facetMap[genre]
          const isActive = state !== 'neutral'

          const rowStyle =
            state === 'include'
              ? { background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(59,130,246,0.35)' }
              : state === 'exclude'
              ? { background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }
              : { border: '1px solid transparent' }

          return (
            <div key={genre} className="flex items-center gap-1 rounded text-xs transition-colors" style={rowStyle}>
              {/* Include checkbox */}
              <button
                onClick={(e) => setInclude(genre, e)}
                title="Include"
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-l"
                style={{ color: state === 'include' ? '#3b82f6' : 'var(--text-faint)' }}
              >
                {state === 'include' ? (
                  <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="currentColor">
                    <rect width="12" height="12" rx="2" />
                    <path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="0.75" y="0.75" width="10.5" height="10.5" rx="1.5" />
                  </svg>
                )}
              </button>

              {/* Label */}
              <span
                className="flex-1 truncate py-1.5"
                style={{
                  color: state === 'include' ? '#3b82f6' : state === 'exclude' ? '#ef4444' : 'var(--text-2)',
                  textDecoration: state === 'exclude' ? 'line-through' : 'none',
                }}
              >
                {genre}
              </span>

              {/* Count (neutral only) */}
              {!isActive && count !== undefined && (
                <span className="shrink-0 italic pr-1 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {count.toLocaleString('en-US')}
                </span>
              )}

              {/* Exclude minus */}
              <button
                onClick={(e) => setExclude(genre, e)}
                title="Exclude"
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded-r"
                style={{ color: state === 'exclude' ? '#ef4444' : 'var(--text-faint)' }}
              >
                <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="2" y1="6" x2="10" y2="6" />
                </svg>
              </button>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-xs px-2 py-3" style={{ color: 'var(--text-faint)' }}>No genres match.</p>
        )}
      </div>
    </div>
  )
}
