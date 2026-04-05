'use client'

import { FilterState } from '@/types'

interface Props {
  filters: FilterState
  onChange: (patch: Partial<FilterState>) => void
}

const RATING_PRESETS = [0, 3, 3.5, 4, 4.25, 4.5]
const MIN_RATINGS_PRESETS = [0, 1000, 10000, 100000, 500000]

function PresetButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white' : ''}`}
      style={active ? {} : { background: 'var(--bg-element)', color: 'var(--text-2)', border: '1px solid var(--border-sub)' }}
    >
      {children}
    </button>
  )
}

export default function RatingFilters({ filters, onChange }: Props) {
  return (
    <div className="space-y-4">
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
          Sort by
        </label>
        <div className="flex gap-2">
          <select
            value={filters.sortBy}
            onChange={(e) => onChange({ sortBy: e.target.value as FilterState['sortBy'] })}
            className="flex-1 rounded px-2 py-1.5 text-sm focus:outline-none"
            style={{ background: 'var(--bg-element)', color: 'var(--text)', border: '1px solid var(--border-sub)' }}
          >
            <option value="avgRating">Avg rating</option>
            <option value="numRatings">Num ratings</option>
            <option value="title">Title</option>
            <option value="searchRank">Search rank</option>
          </select>
          <button
            onClick={() => onChange({ sortDir: filters.sortDir === 'desc' ? 'asc' : 'desc' })}
            className="px-2.5 py-1.5 rounded text-sm"
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
