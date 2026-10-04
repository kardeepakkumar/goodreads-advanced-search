'use client'

import { useEffect, useRef, useState } from 'react'
import { FilterState } from '@/types'

interface Props {
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

const RATING_PRESETS = [0, 3, 3.5, 4, 4.25, 4.5]
const MIN_RATINGS_PRESETS = [0, 1000, 10000, 100000, 500000]

// Typing a year commits after a short pause (or on Enter / blur), so "1980"
// sends one request rather than one per digit.
export const YEAR_COMMIT_DELAY_MS = 500

function parseYear(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isInteger(n) ? n : null
}

function YearInput({
  label, placeholder, value, onCommit,
}: { label: string; placeholder: string; value: number | null; onCommit: (year: number | null) => void }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Latest committed value, read by delayed commits so they never re-send it.
  const current = useRef(value)
  current.current = value

  // Follow outside changes (e.g. a committed value coming back down).
  useEffect(() => {
    setDraft(value === null ? '' : String(value))
  }, [value])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function commit(text: string) {
    if (timer.current) clearTimeout(timer.current)
    const year = parseYear(text)
    if (year !== current.current) onCommit(year)
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(text), YEAR_COMMIT_DELAY_MS)
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => e.key === 'Enter' && commit(draft)}
      className="w-20 rounded px-2 py-2 md:py-1 text-sm focus:outline-none"
      style={{ background: 'var(--bg-element)', color: 'var(--text)', border: '1px solid var(--border-sub)' }}
    />
  )
}

function PresetButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 md:py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white' : ''}`}
      style={active ? {} : { background: 'var(--bg-element)', color: 'var(--text-2)', border: '1px solid var(--border-sub)' }}
    >
      {children}
    </button>
  )
}

// Groups stack on phones and flow into one row on wider screens. Each group
// keeps its label and controls inside a single container.
export default function RatingFilters({ filters, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:gap-x-8">
      <div>
        <label className="block text-xs mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Min avg rating
        </label>
        <div className="flex flex-wrap gap-1.5">
          {RATING_PRESETS.map((r) => (
            <PresetButton key={r} active={filters.minRating === r} onClick={() => onChange({ minRating: r })}>
              {r === 0 ? 'Any' : `≥ ${r}`}
            </PresetButton>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Min ratings count
        </label>
        <div className="flex flex-wrap gap-1.5">
          {MIN_RATINGS_PRESETS.map((n) => (
            <PresetButton key={n} active={filters.minRatings === n} onClick={() => onChange({ minRatings: n })}>
              {n === 0 ? 'Any' : `≥ ${n.toLocaleString('en-US')}`}
            </PresetButton>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Published year
        </label>
        <div className="flex items-center gap-1.5">
          <YearInput
            label="Published from year"
            placeholder="From"
            value={filters.minYear}
            onCommit={(minYear) => onChange({ minYear })}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }} aria-hidden="true">–</span>
          <YearInput
            label="Published to year"
            placeholder="To"
            value={filters.maxYear}
            onCommit={(maxYear) => onChange({ maxYear })}
          />
        </div>
      </div>

      <div className="w-full sm:w-auto sm:min-w-[220px]">
        <label className="block text-xs mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Sort by
        </label>
        <div className="flex gap-2">
          <select
            value={filters.sortBy}
            onChange={(e) => onChange({ sortBy: e.target.value as FilterState['sortBy'] })}
            className="flex-1 rounded px-2 py-2 md:py-1.5 text-sm focus:outline-none"
            style={{ background: 'var(--bg-element)', color: 'var(--text)', border: '1px solid var(--border-sub)' }}
          >
            <option value="avgRating">Avg rating</option>
            <option value="numRatings">Num ratings</option>
            <option value="title">Title</option>
            <option value="searchRank">Search rank</option>
          </select>
          <button
            onClick={() => onChange({ sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' })}
            className="px-3 md:px-2.5 py-2 md:py-1.5 rounded text-sm"
            style={{ background: 'var(--bg-element)', color: 'var(--text-2)', border: '1px solid var(--border-sub)' }}
            title="Toggle sort direction"
          >
            {filters.sortDir === 'desc' ? '↓' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}
