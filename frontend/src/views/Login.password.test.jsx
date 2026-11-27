// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Login from './Login.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* The sign-in screen with password sign-in (#118). Only an instance that advertises
   `password_login` shows any of it; there, a browser without passkey support finally has a way
   in instead of being told to stay local, and creating a profile can use a password. */
const mocks = vi.hoisted(() => {
  const state = { webauthn: true, config: null, sheets: [] }
  state.snapshot = () => ({
    config: state.config, S: {},
    setUser: vi.fn(), adoptProfile: vi.fn(), setGuest: vi.fn(), loadConfig: vi.fn(async () => state.config),
    pushState: vi.fn(), pullState: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: render => { mocks.sheets.push(render); return {} } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('../lib/api.js', () => ({
  webauthnOK: () => mocks.webauthn, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), BIO: 'your fingerprint', bio: () => 'your fingerprint',
  api: vi.fn(), passkeyAssertion: vi.fn(), passwordLogin: vi.fn(), passwordRegister: vi.fn(), passwordResetRedeem: vi.fn(),
}))
vi.mock('../lib/demo.js', () => ({ DEMO: false, REPO: 'https://example.invalid' }))
vi.mock('../sheets.jsx', () => ({ askAddDeviceData: vi.fn(), confirmSheet: vi.fn() }))

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const buttons = host => [...host.querySelectorAll('button')].map(b => b.textContent)
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent === text)

beforeEach(() => { mocks.webauthn = true; mocks.config = null; mocks.sheets.length = 0 })
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('Login with password sign-in', () => {
  it('an instance without it looks exactly as before', () => {
    const page = mount(<Login />)
    expect(buttons(page)).not.toContain('Sign in with password')
    expect(page.textContent).toContain('Passkeys use your fingerprint. No passwords to remember.')
    mocks.webauthn = false
    const noPasskeys = mount(<Login />)
    expect(noPasskeys.textContent).toContain("This browser doesn't do passkeys, but you can still use Habcore Gym locally on this device.")
    expect(buttons(noPasskeys)).not.toContain('Sign in with password')
  })

  // Habcore Gym (kl9): the start screen is the password form itself, then "Sign in with passkey"
  // as a link, then Registration, which opens on the password form.
  it('the start screen: password form, then the passkey link, then Registration', () => {
    mocks.config = { password_login: true, allow_guest: false }
    const page = mount(<Login />)
    const form = page.querySelector('[data-testid="login-password-form"]')
    expect(form).toBeTruthy()
    expect(form.querySelector('input[autocomplete="username"]').placeholder).toBe('Name or e-mail')
    expect(form.querySelector('input[autocomplete="current-password"]').type).toBe('password')
    expect(page.querySelector('h3')).toBeNull()
    // In this order: the form's own Sign in, the passkey link, Registration, then the small links.
    expect(buttons(page)).toEqual(['Sign in', 'Sign in with passkey', 'Registration', 'Have a reset code from your admin?', 'Lost access?'])
    const order = ['login-password-form', 'login-passkey', 'login-register'].map(id => page.querySelector(`[data-testid="${id}"]`))
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(page.textContent).not.toContain('No passwords to remember.')
    // The reset code still has its form, on a sheet.
    act(() => button(page, 'Have a reset code from your admin?').click())
    const sheet = mount(mocks.sheets[0](() => {}))
    expect(sheet.querySelector('h3').textContent).toBe('Reset your password')
  })

  it('a browser without passkeys gets the same form, without the passkey link', () => {
    mocks.webauthn = false
    mocks.config = { password_login: true, allow_guest: false }
    const page = mount(<Login />)
    expect(page.textContent).not.toContain('Try a browser or device with passkey support.')
    expect(buttons(page)).toEqual(['Sign in', 'Registration', 'Have a reset code from your admin?', 'Lost access?'])
    // Creating a profile here can only mean a password: no link to the passkey.
    act(() => button(page, 'Registration').click())
    const sheet = mount(mocks.sheets[0](() => {}))
    expect(sheet.querySelector('.seg')).toBeNull()
    expect(sheet.querySelector('input[placeholder="Repeat the password"]')).toBeTruthy()
    expect(buttons(sheet)).toEqual(['Create profile'])
  })

  it('where both work, Registration opens on the password and the passkey is a link under it', () => {
    mocks.config = { password_login: true, invite_only: true }
    const page = mount(<Login />)
    act(() => button(page, 'Registration').click())
    const sheet = mount(mocks.sheets[0](() => {}))
    expect(sheet.querySelector('.seg')).toBeNull()
    expect(buttons(sheet)).toEqual(['Create profile', 'Register with a passkey instead'])
    expect(sheet.querySelector('input[placeholder="Invite code"]')).toBeTruthy()
    expect(sheet.querySelector('input[autocomplete="new-password"]')).toBeTruthy()
    expect(sheet.textContent).toContain('At least 8 characters.')
    act(() => button(sheet, 'Register with a passkey instead').click())
    expect(buttons(sheet)).toEqual(['Create passkey', 'Register with a password instead'])
    act(() => button(sheet, 'Register with a password instead').click())
    expect(buttons(sheet)).toContain('Create profile')
  })
})
