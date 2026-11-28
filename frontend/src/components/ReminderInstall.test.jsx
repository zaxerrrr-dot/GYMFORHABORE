// @vitest-environment happy-dom
/* Habcore Gym (kl15): Settings → Reminders says how reminders reach a phone (components/ReminderInstall.jsx). */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import ReminderInstall, { runsInstalled, phoneKind } from './ReminderInstall.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const roots = []
const mount = el => { const h = document.createElement('div'); document.body.appendChild(h); const r = createRoot(h); roots.push(r); act(() => r.render(el)); return h }
afterEach(() => act(() => roots.splice(0).forEach(r => r.unmount())))

describe('ReminderInstall', () => {
  it('in a browser tab: the notice and both guides, this phone\'s open', () => {
    const h = mount(<ReminderInstall native={false} installed={false} kind="android" />)
    expect(h.querySelector('[data-testid=reminder-install]').textContent).toMatch(/install the Habcore Gym app or add this page/)
    expect(h.querySelector('[data-testid=ri-android] ol')).toBeTruthy()
    expect(h.querySelector('[data-testid=ri-ios] ol')).toBe(null)
    act(() => h.querySelector('[data-testid=ri-ios] button').click())
    expect(h.querySelector('[data-testid=ri-ios]').textContent).toMatch(/Add to Home Screen/)
    expect(h.querySelector('[data-testid=ri-ios]').textContent).toMatch(/iOS 16.4/)
  })
  it('installed: nothing; the phone app: reminders are local', () => {
    expect(mount(<ReminderInstall native={false} installed kind="ios" />).textContent).toBe('')
    expect(mount(<ReminderInstall native installed={false} />).querySelector('[data-testid=reminder-native]').textContent).toMatch(/local notifications/)
  })
  it('tells an installed web app and the phone', () => {
    expect(runsInstalled({ matchMedia: q => ({ matches: q === '(display-mode: standalone)' }) }, {})).toBe(true)
    expect(runsInstalled({ matchMedia: () => ({ matches: false }) }, { standalone: true })).toBe(true)
    expect(runsInstalled({ matchMedia: () => ({ matches: false }) }, {})).toBe(false)
    expect(phoneKind({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe('ios')
    expect(phoneKind({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe('android')
  })
})
