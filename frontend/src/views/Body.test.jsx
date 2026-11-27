// @vitest-environment happy-dom
/* Habcore Gym (kl13): the body module page (views/Body.jsx) on the real store. */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import Body, { BodyMeasurementForm, BodyProfileForm } from './Body.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mounted = []
const mount = el => { const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host); mounted.push(r); act(() => r.render(<MemoryRouter>{el}</MemoryRouter>)); return host }
const setS = patch => useStore.setState(s => ({ S: { ...structuredClone(DEF), unit: 'kg', ...patch } }))
beforeEach(() => { useUI.setState({ sheets: [] }); setS({}) })
afterEach(() => { act(() => mounted.splice(0).forEach(r => r.unmount())) })

describe('Body (kl13)', () => {
  it('asks for the profile first, and the profile form saves sex, date of birth and height', () => {
    const page = mount(<Body />)
    expect(page.querySelector('[data-body-need]')).toBeTruthy()
    const f = mount(<BodyProfileForm close={() => {}} />)
    act(() => [...f.querySelectorAll('button')].find(b => b.textContent === 'Female').click())
    const birth = f.querySelector('[data-testid=body-birth]')
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(birth, '1990-05-04'); birth.dispatchEvent(new Event('input', { bubbles: true })) })
    const h = f.querySelector('[data-testid=body-height] input, input[data-testid=body-height]')
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(h, '168'); h.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => f.querySelector('[data-testid=body-profile-save]').click())
    expect(useStore.getState().S).toMatchObject({ sex: 'female', birthDate: '1990-05-04', birthYear: 1990, heightCm: 168 })
  })

  it('shows the latest reading with BMI, its category and the changes', () => {
    setS({ sex: 'male', birthDate: '1990-01-01', heightCm: 180, bodyweight: [{ d: '2026-11-01', w: 84 }, { d: '2026-11-20', w: 82 }], measurements: [{ d: '2026-11-20', t: 1, bodyFat: 18, body: { muscle: 38 }, src: 'scale', by: { id: 't', name: 'Tomek' } }] })
    const page = mount(<Body />)
    const latest = page.querySelector('[data-body-latest]')
    expect(latest.querySelector('[data-k=bmi] b').textContent).toBe('25.3')
    expect(latest.querySelector('.body-cat.is-over')).toBeTruthy()
    expect(latest.querySelector('[data-k=w]').textContent).toMatch(/−2 kg/)
    expect(page.querySelector('[data-body-row="2026-11-20"]').textContent).toMatch(/Tomek/)
  })

  it('under 18 says the adult ranges do not apply', () => {
    const y = new Date().getFullYear() - 15
    setS({ sex: 'female', birthDate: y + '-01-01', heightCm: 160, bodyweight: [{ d: '2026-11-20', w: 50 }] })
    expect(mount(<Body />).querySelector('[data-body-minor]')).toBeTruthy()
  })

  it('a trainer leading the client signs the entry', () => {
    setS({ sex: 'male', birthDate: '1990-01-01', heightCm: 180 })
    useStore.setState({ user: { id: 'c1', name: 'Klient', acting: { by: { id: 'tr1', name: 'Tomek' } } } })
    const f = mount(<BodyMeasurementForm close={() => {}} />)
    const w = f.querySelector('input[data-testid=body-w]')
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(w, '81'); w.dispatchEvent(new Event('input', { bubbles: true })) })
    const fat = f.querySelector('input[data-testid=body-fat]')
    act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(fat, '19'); fat.dispatchEvent(new Event('input', { bubbles: true })) })
    act(() => f.querySelector('[data-testid=body-save]').click())
    const S = useStore.getState().S
    expect(S.bodyweight.at(-1).w).toBe(81)
    expect(S.measurements.at(-1)).toMatchObject({ bodyFat: 19, by: { id: 'tr1', name: 'Tomek' } })
    useStore.setState({ user: null })
  })
})
