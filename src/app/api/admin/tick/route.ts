import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, SessionData } from '@/lib/auth'
import { runOneTick } from '@/lib/ticker'

async function requireAuth(req: NextRequest) {
  const res = NextResponse.json({})
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  return session.isLoggedIn
}

export async function POST(req: NextRequest) {
  if (!(await requireAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runOneTick()
    return NextResponse.json(result)
  } catch (err) {
    console.error('/api/admin/tick error', err)
    return NextResponse.json({ status: 'error', message: 'Internal server error' })
  }
}
