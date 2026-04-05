'use client'

import { useCallback, useRef } from 'react'

interface Props {
  value: string
  onChange: (q: string) => void
}

export default function SearchBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value), [onChange])

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
        style={{ color: 'var(--text-faint)' }}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Search title or author…"
        className="w-full rounded pl-9 pr-3 py-2 text-sm focus:outline-none"
        style={{
          background: 'var(--bg-surface)',
          color: 'var(--text)',
          border: '1px solid var(--border-sub)',
        }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-faint)' }}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  )
}
