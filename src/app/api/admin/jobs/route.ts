import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, SessionData } from '@/lib/auth'
import { getDb } from '@/lib/mongodb'
import { ScrapeJob } from '@/types'
import { ObjectId, Int32 } from 'mongodb'

async function requireAuth(req: NextRequest) {
  const res = NextResponse.json({})
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return session.isLoggedIn
}

export async function GET(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getDb()
    const jobs = await db
      .collection<ScrapeJob>('scrapeJobs')
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('/api/admin/jobs GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { genre, startPage = 1, maxPage = 20, override = false } = body

  if (!genre || typeof genre !== 'string') {
    return NextResponse.json({ error: 'genre is required' }, { status: 400 })
  }

  try {
    const db = await getDb()

    // Check if a non-done/non-failed job already exists for this genre
    if (!override) {
      const existing = await db.collection('scrapeJobs').findOne({
        genre,
        status: { $in: ['queued', 'running'] },
      })
      if (existing) {
        return NextResponse.json({ error: 'Job already active for this genre' }, { status: 409 })
      }
    }

    const now = new Date()
    const job = {
      _id: new ObjectId(),
      genre,
      requestedGenre: genre,
      startPage: new Int32(startPage),
      currentPage: new Int32(startPage),
      maxPage: new Int32(maxPage),
      pagesScraped: new Int32(0),
      status: 'queued',
      override,
      lastRequestAt: null,
      error: null,
      schemaVersion: new Int32(1),
      createdAt: now,
      updatedAt: now,
    }

    await db.collection('scrapeJobs').insertOne(job as any)

    // Ensure genre is registered
    await db.collection('genres').updateOne(
      { _id: genre as any },
      { $setOnInsert: { _id: genre, schemaVersion: new Int32(1), createdAt: now, updatedAt: now } },
      { upsert: true }
    )

    return NextResponse.json({ job })
  } catch (err) {
    console.error('/api/admin/jobs POST error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
