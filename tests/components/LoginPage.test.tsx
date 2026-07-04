// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/admin/login/page'

const { routerMock } = vi.hoisted(() => ({
  routerMock: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }))

let loginResponse: { status: number; body: unknown }
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  loginResponse = { status: 200, body: { ok: true } }
  fetchMock = vi.fn(async () => ({
    ok: loginResponse.status < 400,
    status: loginResponse.status,
    json: async () => loginResponse.body,
  }))
  vi.stubGlobal('fetch', fetchMock)
})

function fields() {
  return {
    username: screen.getByRole('textbox'),
    password: document.querySelector('input[type="password"]') as HTMLInputElement,
    submit: screen.getByRole('button', { name: 'Log in' }),
  }
}

describe('LoginPage', () => {
  it('POSTs the credentials as JSON and redirects to /admin on success', async () => {
    render(<LoginPage />)
    const { username, password, submit } = fields()

    await userEvent.type(username, 'admin')
    await userEvent.type(password, 'hunter2')
    await userEvent.click(submit)

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'hunter2' }),
    })
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/admin'))
  })

  it('surfaces the server error message and stays on the page', async () => {
    loginResponse = { status: 401, body: { error: 'Invalid credentials' } }
    render(<LoginPage />)
    const { username, password, submit } = fields()

    await userEvent.type(username, 'admin')
    await userEvent.type(password, 'wrong')
    await userEvent.click(submit)

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  it('requires both fields before submitting', () => {
    render(<LoginPage />)
    const { username, password } = fields()
    expect(username).toBeRequired()
    expect(password).toBeRequired()
  })
})
