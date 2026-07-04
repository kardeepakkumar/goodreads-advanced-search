import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { vi } from 'vitest'

export const TEST_ADMIN_USER = 'test-admin'
export const TEST_ADMIN_PASSWORD = 'correct-horse-battery-staple'

// Configures the admin env vars exactly as production stores them: the bcrypt
// hash base64-encoded (see CLAUDE.md — raw hashes get mangled by dotenv-expand).
export function stubAdminEnv() {
  const hash = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 4)
  vi.stubEnv('ADMIN_USERNAME', TEST_ADMIN_USER)
  vi.stubEnv('ADMIN_PASSWORD_HASH_B64', Buffer.from(hash, 'utf8').toString('base64'))
}

// Logs in through the real login route handler and returns the session cookie
// pair ("gr-admin-session=..."), so guarded-route tests exercise the real
// iron-session seal/unseal round trip.
export async function loginAndGetCookie(): Promise<string> {
  stubAdminEnv()
  const { POST } = await import('@/app/api/admin/auth/login/route')
  const req = new NextRequest('http://localhost/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: TEST_ADMIN_USER, password: TEST_ADMIN_PASSWORD }),
    headers: { 'content-type': 'application/json' },
  })
  const res = await POST(req)
  const setCookie = res.headers.get('set-cookie')
  if (res.status !== 200 || !setCookie) {
    throw new Error(`test login failed: status ${res.status}`)
  }
  return setCookie.split(';')[0]
}

export function requestWithCookie(url: string, cookie: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), cookie },
  } as ConstructorParameters<typeof NextRequest>[1])
}
