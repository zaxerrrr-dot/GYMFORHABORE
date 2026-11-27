// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Settings → "Server & sync": which server, which account, how things stand, when this device
   last held what the server holds, how much is still waiting, and "Sync now" with its outcome.
   Then the way out — Disconnect, Sign out, Sign out everywhere — which no longer promises a sync
   it never checked, and which asks before leaving changes the server has not got: try again,
   export a backup, or go ahead anyway with the changes kept on the device. */
const mocks = vi.hoisted(() => {
  const state = { S: null, user: null, sync: null, MOBILE: false, unsynced: { owed: false, count: 0 }, kept: [], sheets: [], navs: [] }
  state.toast = vi.fn()
  state.confirmSheet = vi.fn()
  state.syncNow = vi.fn(async () => state.sync)
  state.disconnectServer = vi.fn()
  state.signOut = vi.fn()
  state.signOutAll = vi.fn()
  state.shareExport = vi.fn(async () => {})
  state.snapshot = () => ({
    S: state.S, user: state.user, sync: state.sync, coachLocal: null,
    update: vi.fn(), replaceState: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(), resetDemo: vi.fn(),
    syncNow: state.syncNow, unsyncedChanges: () => state.unsynced, keptChanges: async () => state.kept,
    disconnectServer: state.disconnectServer, signOut: state.signOut, signOutAll: state.signOutAll,
    adoptProfile: vi.fn(),
  })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: (render, opts) => { mocks.sheets.push({ render, opts }); return {} } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => to => mocks.navs.push(to) }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(() => Promise.resolve({})), webauthnOK: () => true, passkeyLogin: vi.fn(), passkeyRegister: vi.fn(), IS_ANDROID: false,
}))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({
  get MOBILE() { return mocks.MOBILE },
  isAndroid: () => Promise.resolve(false), shareExport: (...a) => mocks.shareExport(...a), syncReminder: vi.fn(),
}))
vi.mock('./MobileOnboarding.jsx', () => ({ ConnectSheet: props => <div className="connect" data-url={props.initialUrl ?? ''} data-again={String(!!props.again)} /> }))
vi.mock('../sheets.jsx', () => ({
  starterPlanSheet: vi.fn(), confirmSheet: (...a) => mocks.confirmSheet(...a), importFromApp: vi.fn(),
  importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(), menuSheet: vi.fn(), askAddDeviceData: vi.fn(),
}))

globalThis.__APP_VERSION__ ??= 'test'

const BASE = 'https://gym.example.com'
const USER = { id: 'u1', name: 'andi' }
const sync = (status, extra = {}) => ({ status, offline: false, pending: false, auth: false, lastError: null, lastSynced: 0, server: BASE, ...extra })

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => root.render(el))
  return host
}
const settle = () => act(() => new Promise(r => setTimeout(r, 0)))
beforeEach(() => {
  mocks.S = { unit: 'kg', restSec: 90, restPauseSec: 15, sound: false, effort: 'none', gifSize: 'full', workouts: [], routines: [], exWeights: {} }
  mocks.user = USER
  mocks.MOBILE = true
  mocks.sync = sync('ok', { lastSynced: Date.now() - 5 * 60000 })
  mocks.unsynced = { owed: false, count: 0 }
  mocks.kept = []
  mocks.sheets.length = 0
  mocks.navs.length = 0
  for (const f of [mocks.toast, mocks.confirmSheet, mocks.syncNow, mocks.disconnectServer, mocks.signOut, mocks.signOutAll, mocks.shareExport]) f.mockClear()
})
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

const block = page => [...page.querySelectorAll('.sect')].find(s => s.querySelector('.sect-t')?.textContent === 'Server & sync')
const rowByTitle = (el, title) => [...el.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === title)
const buttonByText = (el, text) => [...el.querySelectorAll('button')].find(b => b.textContent === text)
const openSheet = (i = -1) => mount(mocks.sheets.at(i).render(() => {}))

/* Habcore Gym (kl12): no "Server & sync" block in Settings → Account any more, on the phone or in
   a browser. Sync is automatic, the banner says when something waits, and the account rows (with
   "Sign out") are the same on the phone as on the site, minus the passkeys. */
describe('Account without "Server & sync" (kl12)', () => {
  it('a signed-in phone: no server block, no Sync now, no Disconnect, no pairing; Sign out is there', () => {
    const page = mount(<Settings page="account" />)
    expect(block(page)).toBeUndefined()
    expect(rowByTitle(page, 'Sync now')).toBeUndefined()
    expect(rowByTitle(page, 'Disconnect')).toBeUndefined()
    expect(rowByTitle(page, 'Pair the mobile app')).toBeUndefined()
    expect(rowByTitle(page, 'Passkeys')).toBeUndefined()
    expect(rowByTitle(page, 'Sign out')).toBeTruthy()
    expect(rowByTitle(page, 'Sign out everywhere')).toBeTruthy()
  })

  it('a signed-in browser: no server block and no "Pair the mobile app"; Sign out is there', () => {
    mocks.MOBILE = false
    const page = mount(<Settings page="account" />)
    expect(block(page)).toBeUndefined()
    expect(rowByTitle(page, 'Pair the mobile app')).toBeUndefined()
    expect(rowByTitle(page, 'Sign out')).toBeTruthy()
  })

  it('the changes a forced sign-out kept for another account are still listed', async () => {
    mocks.kept = [{ server: BASE, uid: 'u0', name: 'mia', count: 2 }]
    const page = mount(<Settings page="account" />)
    await settle()
    expect(rowByTitle(page, 'Changes kept for mia')).toBeTruthy()
  })
})

describe('leaving the server', () => {
  const confirm = () => mocks.confirmSheet.mock.calls.at(-1)[0]

  it('phone: Sign out does not promise a sync it did not check, and goes straight through when nothing is waiting', async () => {
    mocks.signOut.mockResolvedValueOnce({ owed: false })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    expect(confirm().message).toContain('checks that the server has every change')
    await act(async () => { await confirm().onConfirm() })
    expect(mocks.signOut).toHaveBeenCalledWith(undefined)
    expect(mocks.sheets).toHaveLength(0)
    expect(mocks.navs).toEqual(['/home'])
  })

  it('with changes waiting it asks: how many, try again, export, or sign out anyway — which keeps them', async () => {
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 2 })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    await act(async () => { await confirm().onConfirm() })
    expect(mocks.navs).toEqual([])                         // nothing left, nothing wiped
    expect(mocks.sheets.at(-1).opts).toMatchObject({ kind: 'center' })
    const sheet = openSheet()
    expect(sheet.textContent).toContain('Not on your server yet: 2 changes')
    expect(sheet.textContent).toContain('keeps a copy of these changes on this device')

    await act(async () => { buttonByText(sheet, 'Export backup (JSON)').click() })
    expect(mocks.shareExport).toHaveBeenCalledTimes(1)     // the phone exports through the share sheet
    expect(mocks.shareExport.mock.calls[0][1]).toMatch(/^habcore-gym-backup-\d{4}-\d{2}-\d{2}\.json$/)

    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 2, stashed: true })
    await act(async () => { buttonByText(sheet, 'Sign out anyway').click() })
    expect(mocks.signOut).toHaveBeenLastCalledWith({ force: true })
    expect(mocks.navs).toEqual(['/home'])
    expect(mocks.toast).toHaveBeenLastCalledWith('The changes your server has not seen are kept on this device, and added back when it connects as this account again.')
  })

  it('"Try again" syncs, and leaves once the server has everything', async () => {
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 1 })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    await act(async () => { await confirm().onConfirm() })
    const sheet = openSheet()

    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 1 })
    mocks.sync = sync('offline', { offline: true, pending: true, lastError: { status: 0, code: 'network' } })
    await act(async () => { buttonByText(sheet, 'Try again').click() })
    expect(mocks.syncNow).toHaveBeenCalledTimes(1)
    expect(mocks.navs).toEqual([])
    expect(sheet.textContent).toContain('The server cannot be reached')   // why it is still waiting (the device itself is online)

    mocks.signOut.mockResolvedValueOnce({ owed: false })
    await act(async () => { buttonByText(sheet, 'Try again').click() })
    expect(mocks.navs).toEqual(['/home'])
  })

  it('refused by the server, the phone is told to sign in again (kl12), with the button that does', async () => {
    mocks.sync = sync('auth', { auth: true, pending: true, lastError: { status: 401, code: 'auth' } })
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: null })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    await act(async () => { await confirm().onConfirm() })
    const sheet = openSheet()
    expect(sheet.textContent).toContain('Some changes on this device have not reached your server.')
    expect(buttonByText(sheet, 'Try again')).toBeUndefined()
    expect(sheet.textContent).toContain('Sign in again, or export a backup first.')
    expect(sheet.textContent).not.toContain('Pair again')
    expect(buttonByText(sheet, 'Sign in')).toBeTruthy()
  })

  it('a browser the server refuses is told to sign in again, next to the button that does', async () => {
    mocks.MOBILE = false
    mocks.sync = sync('auth', { auth: true, pending: true, lastError: { status: 401, code: 'auth' } })
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 2 })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    await act(async () => { await confirm().onConfirm() })
    const sheet = openSheet()
    expect(sheet.textContent).toContain('Sign in again, or export a backup first.')
    expect(sheet.textContent).not.toContain('Try again')
    expect(buttonByText(sheet, 'Sign in with passkey')).toBeTruthy()
  })

  it('a server that is only out of reach still offers Try again, and says so', async () => {
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 1 })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    await act(async () => { await confirm().onConfirm() })
    const sheet = openSheet()
    expect(sheet.textContent).toContain('Try again, or export a backup first.')
    expect(buttonByText(sheet, 'Try again')).toBeTruthy()
  })

  it('a copy that cannot be kept aside is not wiped either, and it says so', async () => {
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 1 })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    await act(async () => { await confirm().onConfirm() })
    const sheet = openSheet()
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 1, stashed: false })
    await act(async () => { buttonByText(sheet, 'Sign out anyway').click() })
    expect(mocks.navs).toEqual([])
    expect(mocks.toast).toHaveBeenLastCalledWith('Couldn’t keep a copy of the changes on this device. Nothing was removed.')
  })

  it('browser: Sign out checks first too, and "Sign out everywhere" says phones too, signing in again as usual', async () => {
    mocks.MOBILE = false
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 4 })
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Sign out').click())
    expect(confirm().message).not.toMatch(/synced to your profile first/)
    await act(async () => { await confirm().onConfirm() })
    const sheet = openSheet()
    expect(sheet.textContent).toContain('Not on your server yet: 4 changes')
    mocks.signOut.mockResolvedValueOnce({ owed: true, count: 4, stashed: true })
    await act(async () => { buttonByText(sheet, 'Sign out anyway').click() })
    expect(mocks.signOut).toHaveBeenLastCalledWith({ force: true })
    expect(mocks.navs).toEqual(['/home'])

    act(() => rowByTitle(page, 'Sign out everywhere').click())
    expect(confirm().message).toContain('including this one, phones too. You sign in again as usual')
    mocks.signOutAll.mockRejectedValueOnce(new Error('HTTP 502'))
    await act(async () => { await confirm().onConfirm() })
    expect(mocks.toast).toHaveBeenLastCalledWith('Couldn’t sign out everywhere. You’re still signed in.')
  })
})

/* "Delete my account" (App Store rule 5.1.1(v)): wherever there is a server account, a paired
   phone or a signed-in browser, and nowhere there is none. Once it is gone, Settings goes home. */
describe('deleting the account', () => {
  it('a signed-in phone and a signed-in browser both have the row; it goes home once the account is gone', async () => {
    const phone = mount(<Settings page="account" />)
    expect(rowByTitle(phone, 'Delete my account')).toBeTruthy()

    mocks.MOBILE = false
    const page = mount(<Settings page="account" />)
    act(() => rowByTitle(page, 'Delete my account').click())
    const done = mocks.sheets.at(-1).render(() => {}).props.done
    done()
    expect(mocks.navs).toEqual(['/home'])
  })

  it('no account, no row: a phone kept local, and a guest in a browser', async () => {
    mocks.user = null
    mocks.sync = sync('local', { server: null })
    expect(rowByTitle(mount(<Settings page="account" />), 'Delete my account')).toBeUndefined()
    mocks.MOBILE = false
    expect(rowByTitle(mount(<Settings page="account" />), 'Delete my account')).toBeUndefined()
  })
})
