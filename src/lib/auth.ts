import { SessionOptions } from 'iron-session'

export interface SessionData {
  isLoggedIn: boolean
}

const secret = process.env.IRON_SESSION_SECRET
if (!secret && process.env.NODE_ENV === 'production') {
  throw new Error('IRON_SESSION_SECRET env var is not set')
}

export const sessionOptions: SessionOptions = {
  password: secret ?? 'dev-only-secret-replace-in-production-32c',
  cookieName: 'gr-admin-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}
