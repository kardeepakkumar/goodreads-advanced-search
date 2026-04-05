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

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Left sidebar */}
      <aside className="w-64 shrink-0 flex flex-col p-3 overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
        <GenrePanel
          allGenres={allGenres}
          facets={data?.genreFacets ?? []}
          filters={filters}
          onChange={patch}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top toolbar */}
        <div className="shrink-0 p-3 flex items-start gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-[200px]">
            <SearchBar value={filters.q} onChange={(q) => patch({ q, page: 1 })} />
          </div>
          <div className="shrink-0">
            <RatingFilters filters={filters} onChange={patch} />
          </div>
        </div>

        {/* Stats bar */}
        <div
          className="shrink-0 px-4 py-2 flex items-center gap-3 text-xs"
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

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          <BookTable books={data?.books ?? []} loading={loading} />
        </div>

        {/* Pagination */}
        <div className="shrink-0 px-4 py-2" style={{ borderTop: '1px solid var(--border)' }}>
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
