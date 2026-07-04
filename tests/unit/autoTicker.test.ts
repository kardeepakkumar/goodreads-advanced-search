import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// autoTicker keeps module-level state (`started`) and a global log buffer, so
// each test loads a fresh module instance against a fresh global buffer.

describe('autoTicker', () => {
  let runOneTick: Mock

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    delete (global as unknown as Record<string, unknown>).__scraperLogs
    vi.spyOn(console, 'log').mockImplementation(() => {})
    runOneTick = vi.fn()
    vi.doMock('@/lib/ticker', () => ({ runOneTick }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('@/lib/ticker')
  })

  async function load() {
    return await import('@/lib/autoTicker')
  }

  it('shares the log buffer through global.__scraperLogs (cross-module contract)', async () => {
    const mod = await load()
    expect(mod.recentLogs).toBe((global as unknown as Record<string, unknown>).__scraperLogs)
  })

  it('starts after 2s, logs successful ticks, and re-ticks every 500ms while working', async () => {
    runOneTick.mockResolvedValue({
      status: 'ok',
      genre: 'fantasy',
      currentPage: 3,
      booksProcessed: 50,
      missingRatings: 0,
    })
    const mod = await load()
    mod.startBackgroundTicker()

    expect(mod.recentLogs.some((l) => l.includes('Background ticker started'))).toBe(true)
    expect(runOneTick).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)
    expect(runOneTick).toHaveBeenCalledTimes(1)
    expect(mod.recentLogs.some((l) => l.includes('✓ fantasy p3 — 50 books'))).toBe(true)

    await vi.advanceTimersByTimeAsync(500)
    expect(runOneTick).toHaveBeenCalledTimes(2)
  })

  it('is idempotent — calling start twice never runs two loops', async () => {
    runOneTick.mockResolvedValue({ status: 'no_jobs' })
    const mod = await load()
    mod.startBackgroundTicker()
    mod.startBackgroundTicker()

    await vi.advanceTimersByTimeAsync(2000)
    expect(runOneTick).toHaveBeenCalledTimes(1)
  })

  it('backs off 30s when there are no jobs', async () => {
    runOneTick.mockResolvedValue({ status: 'no_jobs' })
    const mod = await load()
    mod.startBackgroundTicker()

    await vi.advanceTimersByTimeAsync(2000)
    expect(runOneTick).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(29_999)
    expect(runOneTick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runOneTick).toHaveBeenCalledTimes(2)
  })

  it('waits out the reported rate-limit window plus a small buffer', async () => {
    runOneTick.mockResolvedValue({ status: 'rate_limited', waitMs: 4000 })
    const mod = await load()
    mod.startBackgroundTicker()

    await vi.advanceTimersByTimeAsync(2000)
    expect(runOneTick).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4199)
    expect(runOneTick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(runOneTick).toHaveBeenCalledTimes(2)
  })

  it('keeps looping after an unexpected rejection (10s backoff) and logs it', async () => {
    runOneTick.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ status: 'no_jobs' })
    const mod = await load()
    mod.startBackgroundTicker()

    await vi.advanceTimersByTimeAsync(2000)
    expect(mod.recentLogs.some((l) => l.includes('✗ Unexpected error: boom'))).toBe(true)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(runOneTick).toHaveBeenCalledTimes(2)
  })

  it('caps the in-memory log buffer at 20 lines', async () => {
    runOneTick.mockResolvedValue({ status: 'error', message: 'some failure' })
    const mod = await load()
    mod.startBackgroundTicker()

    await vi.advanceTimersByTimeAsync(2000)
    for (let i = 0; i < 40; i++) {
      await vi.advanceTimersByTimeAsync(500)
    }

    expect(runOneTick.mock.calls.length).toBeGreaterThan(20)
    expect(mod.recentLogs.length).toBe(20)
    // Oldest lines (including the startup line) have been evicted.
    expect(mod.recentLogs.every((l) => l.includes('✗ some failure'))).toBe(true)
  })
})
