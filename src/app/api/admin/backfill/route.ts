import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, SessionData } from '@/lib/auth'
import { getDb } from '@/lib/mongodb'
import { buildBackfillJobs, getBackfillOverview, rescrapeQueueOrder } from '@/lib/backfill'
import { BackfillQueueResponse } from '@/types'

async function requireAuth(req: NextRequest) {
  const res = NextResponse.json({})
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return session.isLoggedIn
}

// Status of the shelf-fields re-scrape: book field coverage plus per-genre
// progress. It runs one aggregation over every book, so the admin panel loads
// it on demand instead of polling it.
export async function GET(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getDb()
    return NextResponse.json(await getBackfillOverview(db))
  } catch (err) {
    console.error('/api/admin/backfill GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Queues a re-scrape job for every genre that still needs one. Genres already
// covered, or with a job queued/running, are skipped — so this is safe to run
// again after failures or partial runs.
export async function POST(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getDb()
    const overview = await getBackfillOverview(db)

    if (overview.schemaReady === false) {
      return NextResponse.json(
        {
          error:
            'MongoDB validators do not allow the new fields yet — run scripts/mongo-upgrade-shelf-fields.js first',
        },
        { status: 409 }
      )
    }

    const rows = rescrapeQueueOrder(overview.genres)
    if (rows.length > 0) {
      await db.collection('scrapeJobs').insertMany(buildBackfillJobs(rows) as any[])
    }

    const body: BackfillQueueResponse = { queued: rows.length, genres: rows.map((r) => r.genre) }
    return NextResponse.json(body)
  } catch (err) {
    console.error('/api/admin/backfill POST error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
