'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FilterState, DEFAULT_FILTERS, BooksResponse, GenresResponse } from '@/types'
import SearchBar from './SearchBar'
import RatingFilters from './RatingFilters'
import GenrePanel from './GenrePanel'
import BookTable from './BookTable'
import Pagination from './Pagination'

const PAGE_SIZE = 25

function buildQueryString(filters: FilterState): string {
  const p = new URLSearchParams()
  if (filters.q) p.set('q', filters.q)
  for (const g of filters.genres) p.append('genres', g)
  for (const g of filters.excludeGenres) p.append('excludeGenres', g)
  if (filters.minRating > 0) p.set('minRating', String(filters.minRating))
  if (filters.maxRating < 5) p.set('maxRating', String(filters.maxRating))
  if (filters.minRatings > 0) p.set('minRatings', String(filters.minRatings))
  p.set('sortBy', filters.sortBy)
  p.set('sortDir', filters.sortDir)
  p.set('page', String(filters.page))
  return p.toString()
}

export default function DiscoveryPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [data, setData] = useState<BooksResponse | null>(null)
  const [allGenres, setAllGenres] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  // Presentation-only state: the genre drawer (< lg) and the rating/sort
  // disclosure (< md). Both panels stay mounted at every size.
  const [panelOpen, setPanelOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/genres')
      .then((r) => r.json())
      .then((body: GenresResponse) => setAllGenres(body.genres))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const delay = filters.q ? 400 : 0
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      fetch(`/api/books?${buildQueryString(filters)}`)
        .then((r) => r.json())
        .then((body: BooksResponse) => setData(body))
        .catch(console.error)
        .finally(() => setLoading(false))
    }, delay)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [filters])

  const patch = useCallback((p: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...p, page: p.page ?? 1 }))
  }, [])

  const activeGenreCount = filters.genres.length + filters.excludeGenres.length
  const ratingFiltersActive =
    filters.minRating > 0 ||
    filters.maxRating < 5 ||
    filters.minRatings > 0 ||
    filters.sortBy !== DEFAULT_FILTERS.sortBy ||
    filters.sortDir !== DEFAULT_FILTERS.sortDir

  return (
    <div className="app-shell flex overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Backdrop for the mobile genre drawer */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setPanelOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Genre sidebar — static column on lg+, slide-over drawer below */}
      <aside
        id="genre-panel"
        className={`fixed inset-y-0 left-0 z-40 w-[85vw] max-w-xs flex flex-col p-3 pb-safe transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:transition-none ${
          panelOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
        style={{ background: 'var(--bg)', borderRight: '1px solid var(--border)' }}
      >
        <div className="lg:hidden shrink-0 flex justify-end">
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close genre filters"
            className="w-9 h-9 -mr-1 flex items-center justify-center rounded text-xl"
            style={{ color: 'var(--text-muted)' }}
          >
            ×
          </button>
        </div>
        <GenrePanel
          allGenres={allGenres}
          facets={data?.genreFacets ?? []}
          filters={filters}
          onChange={patch}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top toolbar */}
        <div className="shrink-0 p-3 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPanelOpen(true)}
              aria-label="Open genre filters"
              aria-expanded={panelOpen}
              aria-controls="genre-panel"
              className="lg:hidden shrink-0 flex items-center gap-1.5 rounded px-3 py-2.5 text-sm"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-2)', border: '1px solid var(--border-sub)' }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41 12 22l-8.59-8.59A2 2 0 0 1 3 12V4a1 1 0 0 1 1-1h8a2 2 0 0 1 1.41.59l8.18 8.18a2 2 0 0 1 0 2.82z" />
                <circle cx="7.5" cy="7.5" r="0.5" fill="currentColor" />
              </svg>
              Genres
              {activeGenreCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center">
                  {activeGenreCount}
                </span>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <SearchBar value={filters.q} onChange={(q) => patch({ q, page: 1 })} />
            </div>

            <button
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className="md:hidden relative shrink-0 flex items-center gap-1.5 rounded px-3 py-2.5 text-sm"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-2)', border: '1px solid var(--border-sub)' }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="10" y1="18" x2="14" y2="18" />
              </svg>
              Filters
              {ratingFiltersActive && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Rating/sort controls: disclosure on phones, always visible from md up */}
          <div className={`${filtersOpen ? 'block' : 'hidden'} md:block`}>
            <RatingFilters filters={filters} onChange={patch} />
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="shrink-0 px-3 sm:px-4 py-2 flex items-center flex-wrap gap-x-3 gap-y-1 text-xs"
          style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          {data && (
            <>
              <span>
                <span className="font-medium" style={{ color: 'var(--text)' }}>{data.total.toLocaleString('en-US')}</span> matching
              </span>
              <span>·</span>
              <span>
                <span style={{ color: 'var(--text-2)' }}>{data.totalDataset.toLocaleString('en-US')}</span> books shelved
              </span>
            </>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2">
          <BookTable books={data?.books ?? []} loading={loading} />
        </div>

        {/* Pagination */}
        <div className="shrink-0 px-3 sm:px-4 py-2 pb-safe" style={{ borderTop: '1px solid var(--border)' }}>
          <Pagination
            page={filters.page}
            total={data?.total ?? 0}
            pageSize={PAGE_SIZE}
            onChange={(p) => setFilters((prev) => ({ ...prev, page: p }))}
          />
        </div>
      </main>
    </div>
  )
}
