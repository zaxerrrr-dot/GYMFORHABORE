// @vitest-environment happy-dom
// Habcore Gym (patch 0013): the one-time acceptance for a profile made before the documents.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mocks = vi.hoisted(() => ({ config: { legal: { v: 'V1' } }, user: { id: 'u1', name: 'Ola', legal_ok: false }, setUser: vi.fn(), api: vi.fn() }))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ config: mocks.config, user: mocks.user, setUser: mocks.setUser })
  const useStore = sel => sel ? sel(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('./api.js', () => ({ api: (...a) => mocks.api(...a) }))
import { LegalAccept, needsLegal, legalUrl } from './legal.jsx'

const mounted = []
const mount = el => { const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host); mounted.push({ root, host }); act(() => root.render(el)); return host }
afterEach(() => { act(() => { mounted.splice(0).forEach(({ root, host }) => { root.unmount(); host.remove() }) }) })

describe('needsLegal', () => {
  it('asks a signed-in profile that has not accepted, never a trainer leading a client, never without LEGAL', () => {
    expect(needsLegal({ legal: { v: 'V1' } }, { id: 'a', legal_ok: false })).toBe(true)
    expect(needsLegal({ legal: { v: 'V1' } }, { id: 'a', legal_ok: true })).toBe(false)
    expect(needsLegal({ legal: { v: 'V1' } }, { id: 'a', legal_ok: false, acting: { by: { id: 't' } } })).toBe(false)
    expect(needsLegal({}, { id: 'a', legal_ok: false })).toBe(false)
    expect(needsLegal({ legal: { v: 'V1' } }, null)).toBe(false)
  })
  it('the documents are pages beside the app, English outside Polish', () => {
    expect(legalUrl('terms')).toMatch(/\/terms$/)
    expect(legalUrl('privacy')).toMatch(/\/privacy$/)
  })
})

describe('LegalAccept', () => {
  it('needs both boxes, then sends the acceptance and takes the answer', async () => {
    mocks.api.mockResolvedValue({ user: { id: 'u1', name: 'Ola', legal_ok: true } })
    const host = mount(<LegalAccept />)
    const btn = host.querySelector('[data-testid="legal-accept-btn"]')
    await act(async () => { btn.click() })
    expect(host.querySelector('[role=alert]').textContent).toBe('Tick both boxes to continue.')
    expect(mocks.api).not.toHaveBeenCalled()
    act(() => host.querySelector('[data-testid="legal-terms"] [role=checkbox]').click())
    act(() => host.querySelector('[data-testid="legal-health"] [role=checkbox]').click())
    await act(async () => { btn.click() })
    expect(mocks.api).toHaveBeenCalledWith('/api/account/legal', { method: 'POST', body: JSON.stringify({ legal: { v: 'V1', terms: true, health: true } }) })
    expect(mocks.setUser).toHaveBeenCalledWith({ id: 'u1', name: 'Ola', legal_ok: true })
  })
})
