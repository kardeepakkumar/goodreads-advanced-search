import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import bcrypt from 'bcryptjs'
import { sessionOptions, SessionData } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  const validUser = process.env.ADMIN_USERNAME
  const hashB64 = process.env.ADMIN_PASSWORD_HASH_B64

  if (!validUser || !hashB64) {
    return NextResponse.json({ error: 'Admin not configured' }, { status: 500 })
  }

  // Decode from base64 — stored this way to prevent dotenv-expand mangling the $ signs
  const validHash = Buffer.from(hashB64, 'base64').toString('utf8')

  const ok = username === validUser && (await bcrypt.compare(password, validHash))
  if (!ok) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  const session = await getIronSession<SessionData>(req, res, sessionOptions)
  session.isLoggedIn = true
  await session.save()
  return res
}
