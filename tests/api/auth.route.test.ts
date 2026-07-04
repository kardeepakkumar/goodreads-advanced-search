import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as loginPOST } from '@/app/api/admin/auth/login/route'
import { POST as logoutPOST } from '@/app/api/admin/auth/logout/route'
import { GET as configGET } from '@/app/api/admin/config/route'
import { getDb } from '@/lib/mongodb'
import { makeDb, makeCollection } from '../helpers/mockDb'
import {
  stubAdminEnv,
  loginAndGetCookie,
  requestWithCookie,
  TEST_ADMIN_USER,
  TEST_ADMIN_PASSWORD,
} from '../helpers/adminSession'

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }))

function loginRequest(username: string, password: string) {
  return new NextRequest('http://localhost/api/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/admin/auth/login', () => {
  it('returns 500 when the admin env vars are missing', async () => {
    vi.stubEnv('ADMIN_USERNAME', '')
    vi.stubEnv('ADMIN_PASSWORD_HASH_B64', '')

    const res = await loginPOST(loginRequest('any', 'any'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Admin not configured' })
  })

  it('rejects a wrong username or wrong password with 401 and no session cookie', async () => {
    stubAdminEnv()

    const badUser = await loginPOST(loginRequest('intruder', TEST_ADMIN_PASSWORD))
    expect(badUser.status).toBe(401)
    expect(badUser.headers.get('set-cookie')).toBeNull()

    const badPass = await loginPOST(loginRequest(TEST_ADMIN_USER, 'wrong-password'))
    expect(badPass.status).toBe(401)
    expect(await badPass.json()).toEqual({ error: 'Invalid credentials' })
  })

  it('verifies the password against the base64-decoded bcrypt hash and sets the session cookie', async () => {
    stubAdminEnv()
    // The env var must be base64 — a raw bcrypt hash contains `$` sequences
    // that dotenv-expand would mangle (see CLAUDE.md).
    expect(process.env.ADMIN_PASSWORD_HASH_B64).not.toContain('$')

    const res = await loginPOST(loginRequest(TEST_ADMIN_USER, TEST_ADMIN_PASSWORD))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain('gr-admin-session=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
  })

  it('issues a cookie that authenticates guarded admin routes (token round trip)', async () => {
    const cookie = await loginAndGetCookie()

    const appConfig = makeCollection()
    appConfig.findOne.mockResolvedValue({ _id: 'global', goodreadsCookie: 'c', rateLimitMs: 10000 })
    ;(getDb as Mock).mockResolvedValue(makeDb({ appConfig }))

    const res = await configGET(requestWithCookie('http://localhost/api/admin/config', cookie))
    expect(res.status).toBe(200)

    // A tampered cookie must not authenticate.
    const tampered = cookie.slice(0, -6) + 'xxxxxx'
    const denied = await configGET(requestWithCookie('http://localhost/api/admin/config', tampered))
    expect(denied.status).toBe(401)
  })
})

describe('POST /api/admin/auth/logout', () => {
  it('destroys the session cookie', async () => {
    const res = await logoutPOST(new NextRequest('http://localhost/api/admin/auth/logout', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toContain('gr-admin-session=')
    // Destroyed session — emptied value and/or immediate expiry.
    expect(cookie).toMatch(/gr-admin-session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  })
})
