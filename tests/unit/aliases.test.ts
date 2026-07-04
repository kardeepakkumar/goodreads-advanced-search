import { describe, it, expect } from 'vitest'
import {
  resolveGenre,
  sourcesFor,
  canonicalizeGenres,
  hasAliases,
  genreSwitchExpr,
  canonicalGenresExpr,
  AliasMap,
} from '@/lib/aliases'

const ALIASES: AliasMap = {
  'science-fiction': 'sci-fi',
  scifi: 'sci-fi',
  'high-fantasy': 'fantasy',
}

describe('resolveGenre', () => {
  it('maps merged tags to their canonical and leaves others alone', () => {
    expect(resolveGenre('science-fiction', ALIASES)).toBe('sci-fi')
    expect(resolveGenre('scifi', ALIASES)).toBe('sci-fi')
    expect(resolveGenre('romance', ALIASES)).toBe('romance')
    expect(resolveGenre('sci-fi', ALIASES)).toBe('sci-fi') // canonical resolves to itself
  })

  it('is the identity with no aliases', () => {
    expect(resolveGenre('science-fiction', {})).toBe('science-fiction')
  })
})

describe('sourcesFor', () => {
  it('returns the canonical itself plus everything merged into it', () => {
    expect(sourcesFor('sci-fi', ALIASES)).toEqual(['sci-fi', 'science-fiction', 'scifi'])
    expect(sourcesFor('fantasy', ALIASES)).toEqual(['fantasy', 'high-fantasy'])
  })

  it('returns just the genre when nothing is merged into it', () => {
    expect(sourcesFor('romance', ALIASES)).toEqual(['romance'])
    expect(sourcesFor('sci-fi', {})).toEqual(['sci-fi'])
  })
})

describe('canonicalizeGenres', () => {
  it('maps and deduplicates so a book with several sources shows the canonical once', () => {
    expect(canonicalizeGenres(['sci-fi', 'science-fiction', 'classics', 'scifi'], ALIASES)).toEqual([
      'sci-fi',
      'classics',
    ])
  })

  it('keeps first-appearance order', () => {
    expect(canonicalizeGenres(['classics', 'science-fiction', 'sci-fi'], ALIASES)).toEqual([
      'classics',
      'sci-fi',
    ])
  })

  it('is the identity with no aliases', () => {
    expect(canonicalizeGenres(['a', 'b'], {})).toEqual(['a', 'b'])
  })
})

describe('hasAliases', () => {
  it('reports whether any merge exists', () => {
    expect(hasAliases({})).toBe(false)
    expect(hasAliases(ALIASES)).toBe(true)
  })
})

describe('aggregation expressions', () => {
  it('genreSwitchExpr builds one branch per alias with the raw value as default', () => {
    const expr = genreSwitchExpr(ALIASES) as any
    expect(expr.$switch.default).toBe('$$g')
    expect(expr.$switch.branches).toEqual([
      { case: { $eq: ['$$g', 'science-fiction'] }, then: 'sci-fi' },
      { case: { $eq: ['$$g', 'scifi'] }, then: 'sci-fi' },
      { case: { $eq: ['$$g', 'high-fantasy'] }, then: 'fantasy' },
    ])
  })

  it('canonicalGenresExpr wraps the mapping in $setUnion so duplicates collapse', () => {
    const expr = canonicalGenresExpr(ALIASES) as any
    expect(expr.$setUnion).toHaveLength(1)
    expect(expr.$setUnion[0].$map.input).toBe('$genres')
    expect(expr.$setUnion[0].$map.in.$switch.branches).toHaveLength(3)
  })
})
