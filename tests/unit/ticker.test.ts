import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { Int32 } from 'mongodb'
import { runOneTick } from '@/lib/ticker'
import { getDb } from '@/lib/mongodb'
import { scrapeShelfPage } from '@/lib/scraper'
import { makeDb, makeCollection, type MockCollection } from '../helpers/mockDb'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))
vi.mock('@/lib/scraper', () => ({ scrapeShelfPage: vi.fn() }))

const scrape = scrapeShelfPage as Mock

const CONFIG = { _id: 'global', goodreadsCookie: 'sess=abc', rateLimitMs: 10000 }

function job(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'job-1',
    genre: 'fantasy',
    startPage: 1,
    currentPage: 3,
    maxPage: 10,
    pagesScraped: 2,
    status: 'queued',
    lastRequestAt: null,
    ...overrides,
  }
}

describe('runOneTick', () => {
  let appConfig: MockCollection
  let scrapeJobs: MockCollection

  beforeEach(() => {
    appConfig = makeCollection()
    scrapeJobs = makeCollection()
    ;(getDb as Mock).mockResolvedValue(makeDb({ appConfig, scrapeJobs }))
    appConfig.findOne.mockResolvedValue(CONFIG)
  })

  it('errors out when the Goodreads cookie is not configured', async () => {
    appConfig.findOne.mockResolvedValue(null)
    expect(await runOneTick()).toEqual({ status: 'error', message: 'Goodreads cookie not configured' })

    appConfig.findOne.mockResolvedValue({ ...CONFIG, goodreadsCookie: '' })
    expect(await runOneTick()).toEqual({ status: 'error', message: 'Goodreads cookie not configured' })
    expect(scrape).not.toHaveBeenCalled()
  })

  it('reports no_jobs when the queue is empty, picking oldest queued/running first', async () => {
    scrapeJobs.findOne.mockResolvedValue(null)
    expect(await runOneTick()).toEqual({ status: 'no_jobs' })
    expect(scrapeJobs.findOne).toHaveBeenCalledWith(
      { status: { $in: ['queued', 'running'] } },
      { sort: { createdAt: 1 } }
    )
  })

  it('respects the rate limit without touching the job or scraping', async () => {
    scrapeJobs.findOne.mockResolvedValue(job({ lastRequestAt: new Date(Date.now() - 2000) }))

    const res = await runOneTick()
    expect(res.status).toBe('rate_limited')
    expect(res.jobId).toBe('job-1')
    expect(res.waitMs).toBeGreaterThan(0)
    expect(res.waitMs).toBeLessThanOrEqual(8000)
    expect(scrape).not.toHaveBeenCalled()
    expect(scrapeJobs.updateOne).not.toHaveBeenCalled()
  })

  it('scrapes once the rate-limit window has elapsed (configured rateLimitMs)', async () => {
    appConfig.findOne.mockResolvedValue({ ...CONFIG, rateLimitMs: 1000 })
    scrapeJobs.findOne.mockResolvedValue(job({ lastRequestAt: new Date(Date.now() - 1500) }))
    scrape.mockResolvedValue({ booksProcessed: 50, reachedEnd: false, missingRatings: 0 })

    const res = await runOneTick()
    expect(res.status).toBe('ok')
  })

  it('advances the page on a successful mid-run tick', async () => {
    scrapeJobs.findOne.mockResolvedValue(job())
    scrape.mockResolvedValue({ booksProcessed: 50, reachedEnd: false, missingRatings: 2 })

    const res = await runOneTick()
    expect(res).toEqual({
      status: 'ok',
      booksProcessed: 50,
      missingRatings: 2,
      jobId: 'job-1',
      genre: 'fantasy',
      currentPage: 3,
    })
    expect(scrape).toHaveBeenCalledWith('fantasy', 3, 'sess=abc')

    // First update marks it running and stamps the rate-limit checkpoint.
    const first = scrapeJobs.updateOne.mock.calls[0]
    expect(first[0]).toEqual({ _id: 'job-1' })
    expect(first[1].$set.status).toBe('running')
    expect(first[1].$set.lastRequestAt).toBeInstanceOf(Date)

    // Second update advances the page with BSON Int32 values.
    const second = scrapeJobs.updateOne.mock.calls[1]
    expect(second[1].$set.status).toBe('running')
    expect(second[1].$set.currentPage).toBeInstanceOf(Int32)
    expect(second[1].$set.currentPage.value).toBe(4)
    expect(second[1].$set.pagesScraped.value).toBe(3)
  })

  it('finishes the job when the shelf ends early', async () => {
    scrapeJobs.findOne.mockResolvedValue(job())
    scrape.mockResolvedValue({ booksProcessed: 12, reachedEnd: true, missingRatings: 0 })

    const res = await runOneTick()
    expect(res.status).toBe('done')

    const final = scrapeJobs.updateOne.mock.calls[1]
    expect(final[1].$set.status).toBe('done')
    expect(final[1].$set.currentPage.value).toBe(3) // stays on the last scraped page
    expect(final[1].$set.pagesScraped.value).toBe(3)
  })

  it('finishes the job when maxPage is reached even with a full page', async () => {
    scrapeJobs.findOne.mockResolvedValue(job({ currentPage: 10, pagesScraped: 9 }))
    scrape.mockResolvedValue({ booksProcessed: 50, reachedEnd: false, missingRatings: 0 })

    const res = await runOneTick()
    expect(res.status).toBe('done')
    expect(res.currentPage).toBe(10)
  })

  it('requeues (not fails) the job on timeout so the same page is retried', async () => {
    scrapeJobs.findOne.mockResolvedValue(job())
    scrape.mockRejectedValue(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }))

    const res = await runOneTick()
    expect(res.status).toBe('error')
    expect(res.message).toBe('Timeout — will retry page 3')

    const revert = scrapeJobs.updateOne.mock.calls[1]
    expect(revert[1].$set.status).toBe('queued')
    expect(revert[1].$set).not.toHaveProperty('error')
  })

  it('also treats a timeout-worded error without the axios code as a retry', async () => {
    scrapeJobs.findOne.mockResolvedValue(job())
    scrape.mockRejectedValue(new Error('Request Timeout while fetching'))

    const res = await runOneTick()
    expect(res.message).toBe('Timeout — will retry page 3')
    expect(scrapeJobs.updateOne.mock.calls[1][1].$set.status).toBe('queued')
  })

  it('marks the job failed with the error message on non-timeout errors', async () => {
    scrapeJobs.findOne.mockResolvedValue(job())
    scrape.mockRejectedValue(new Error('Request failed with status code 403'))

    const res = await runOneTick()
    expect(res).toEqual({
      status: 'error',
      message: 'Request failed with status code 403',
      jobId: 'job-1',
    })

    const failed = scrapeJobs.updateOne.mock.calls[1]
    expect(failed[1].$set.status).toBe('failed')
    expect(failed[1].$set.error).toBe('Request failed with status code 403')
  })
})
