import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { Int32 } from 'mongodb'
import { sessionOptions, SessionData } from '@/lib/auth'
import { getDb } from '@/lib/mongodb'
import { AppConfig } from '@/types'

async function requireAuth(req: NextRequest, res: NextResponse) {
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return session.isLoggedIn
}

export async function GET(req: NextRequest) {
  const res = NextResponse.json({})
  if (!(await requireAuth(req, res))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = await getDb()
    const config = await db.collection<AppConfig>('appConfig').findOne({ _id: 'global' as any })
    if (!config) return NextResponse.json({ error: 'Config not found' }, { status: 404 })
    return NextResponse.json(config)
  } catch (err) {
    console.error('/api/admin/config GET error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const res = NextResponse.json({})
  if (!(await requireAuth(req, res))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { goodreadsCookie, rateLimitMs } = body

  if (typeof goodreadsCookie !== 'string' || typeof rateLimitMs !== 'number') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  try {
    const db = await getDb()
    await db.collection('appConfig').updateOne(
      { _id: 'global' as any },
      {
        $set: {
          goodreadsCookie,
          rateLimitMs: new Int32(rateLimitMs), // validator requires BSON int, not double
          updatedAt: new Date(),               // validator requires BSON date, not string
        },
      },
      { upsert: true }
    )
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[config PUT] error:', err?.message, JSON.stringify(err?.errInfo, null, 2))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
