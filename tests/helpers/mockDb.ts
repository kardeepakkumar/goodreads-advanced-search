import { vi, type Mock } from 'vitest'

// In-memory stand-ins for the MongoDB driver surface the app uses.
// Tests configure return values per collection and inspect recorded calls.

export interface MockCursor {
  sort: Mock
  limit: Mock
  project: Mock
  toArray: Mock
}

export function makeCursor(docs: unknown[] = []): MockCursor {
  const cursor: MockCursor = {
    sort: vi.fn(() => cursor),
    limit: vi.fn(() => cursor),
    project: vi.fn(() => cursor),
    toArray: vi.fn().mockResolvedValue(docs),
  }
  return cursor
}

export interface MockCollection {
  findOne: Mock
  find: Mock
  aggregate: Mock
  updateOne: Mock
  updateMany: Mock
  insertOne: Mock
  deleteMany: Mock
  bulkWrite: Mock
  countDocuments: Mock
}

export function makeCollection(): MockCollection {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn(() => makeCursor()),
    aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    updateMany: vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 0 }),
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 }),
    bulkWrite: vi.fn().mockResolvedValue({ ok: 1 }),
    countDocuments: vi.fn().mockResolvedValue(0),
  }
}

export type MockDb = {
  collection: Mock
  collections: Record<string, MockCollection>
}

export function makeDb(preset: Record<string, MockCollection> = {}): MockDb {
  const collections: Record<string, MockCollection> = { ...preset }
  return {
    collections,
    collection: vi.fn((name: string) => {
      if (!collections[name]) collections[name] = makeCollection()
      return collections[name]
    }),
  }
}
