// Core tick logic — shared between /api/admin/tick and /api/cron/tick

import { Int32 } from 'mongodb'
import { getDb } from './mongodb'
import { scrapeShelfPage } from './scraper'
import { AppConfig, ScrapeJob, TickResponse } from '@/types'

export async function runOneTick(): Promise<TickResponse> {
  const db = await getDb()

  const config = await db.collection<AppConfig>('appConfig').findOne({ _id: 'global' as any })
  if (!config?.goodreadsCookie) {
    return { status: 'error', message: 'Goodreads cookie not configured' }
  }

  const rateLimitMs = config.rateLimitMs ?? 10000

  const job = await db.collection<ScrapeJob>('scrapeJobs').findOne(
    { status: { $in: ['queued', 'running'] } },
    { sort: { createdAt: 1 } }
  )

  if (!job) {
    return { status: 'no_jobs' }
  }

  // Rate limit check
  if (job.lastRequestAt) {
    const elapsed = Date.now() - new Date(job.lastRequestAt).getTime()
    if (elapsed < rateLimitMs) {
      return { status: 'rate_limited', waitMs: rateLimitMs - elapsed, jobId: job._id }
    }
  }

  const now = new Date()

  await db.collection('scrapeJobs').updateOne(
    { _id: job._id as any },
    { $set: { status: 'running', lastRequestAt: now, updatedAt: now } }
  )

  let booksProcessed = 0
  let reachedEnd = false
  let missingRatings = 0

  try {
    const result = await scrapeShelfPage(job.genre, job.currentPage, config.goodreadsCookie)
    booksProcessed = result.booksProcessed
    reachedEnd = result.reachedEnd
    missingRatings = result.missingRatings
  } catch (scrapeErr: any) {
    const isTimeout =
      scrapeErr.code === 'ECONNABORTED' || scrapeErr.message?.toLowerCase().includes('timeout')

    if (isTimeout) {
      await db.collection('scrapeJobs').updateOne(
        { _id: job._id as any },
        { $set: { status: 'queued', updatedAt: new Date() } }
      )
      return { status: 'error', message: `Timeout — will retry page ${job.currentPage}`, jobId: job._id }
    }

    await db.collection('scrapeJobs').updateOne(
      { _id: job._id as any },
      { $set: { status: 'failed', error: scrapeErr.message, updatedAt: new Date() } }
    )
    return { status: 'error', message: scrapeErr.message, jobId: job._id }
  }

  const nextPage = job.currentPage + 1
  const hitMaxPage = nextPage > job.maxPage

  if (reachedEnd || hitMaxPage) {
    await db.collection('scrapeJobs').updateOne(
      { _id: job._id as any },
      {
        $set: {
          status: 'done',
          currentPage: new Int32(job.currentPage),
          pagesScraped: new Int32(job.pagesScraped + 1),
          updatedAt: new Date(),
        },
      }
    )
    return { status: 'done', booksProcessed, missingRatings, jobId: job._id, genre: job.genre, currentPage: job.currentPage }
  }

  await db.collection('scrapeJobs').updateOne(
    { _id: job._id as any },
    {
      $set: {
        status: 'running',
        currentPage: new Int32(nextPage),
        pagesScraped: new Int32(job.pagesScraped + 1),
        updatedAt: new Date(),
      },
    }
  )

  return { status: 'ok', booksProcessed, missingRatings, jobId: job._id, genre: job.genre, currentPage: job.currentPage }
}
