// @vitest-environment happy-dom
/* Habcore Gym (kl14): the workout feed (views/Workouts.jsx), a workout's notes thread in its summary
   (sheets.jsx WorkoutDetail), written by the client and by a trainer leading them, and the day sheet
   every calendar opens. On the real store. */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { EXDB } from '../lib/exercises-data.js'
import Workouts from './Workouts.jsx'
import { dayOverrideSheet } from '../sheets.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mounted = []
const mount = el => { const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host); mounted.push(r); act(() => r.render(<MemoryRouter>{el}</MemoryRouter>)); return host }
const top = () => { const s = useUI.getState().sheets.at(-1); return mount(s.render(() => useUI.getState().closeSheet(s.id))) }
const type = (el, v) => act(() => { Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) })
const lift = EXDB.find(e => e.equipment === 'barbell')?.id || EXDB[0].id
const W = (id, d, extra = {}) => ({ id, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:00:00'), name: 'Push ' + id, routineIds: [], entries: [{ id: lift, sets: [{ w: 80, r: 8, done: true }, { w: 80, r: 8, done: true }] }], prs: [], ...extra })
const setS = patch => useStore.setState(() => ({ S: { ...structuredClone(DEF), unit: 'kg', ...patch } }))
beforeEach(() => { useUI.setState({ sheets: [] }); useStore.setState({ user: { id: 'CLI', name: 'Ania' } }) })
afterEach(() => { act(() => mounted.splice(0).forEach(r => r.unmount())) })

describe('Treningi (kl14)', () => {
  it('lists cards newest first in week groups, searches, and pages through hundreds', () => {
    const many = Array.from({ length: 250 }, (_, i) => W('w' + i, new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10)))
    many[249].led = { kind: 'trainer', id: 'TR1', name: 'Tomasz' }
    many[249].notes = [{ id: 'n1', text: 'Great work', at: 1, by: { id: 'TR1', name: 'Tomasz', role: 'trainer' } }]
    setS({ workouts: many })
    const t0 = performance.now()
    const page = mount(<Workouts />)
    expect(performance.now() - t0).toBeLessThan(3000)
    const cards = page.querySelectorAll('[data-testid=wf-card]')
    expect(cards.length).toBe(30)
    expect(cards[0].dataset.id).toBe('w249')
    expect(cards[0].textContent).toMatch(/Tomasz/)
    expect(cards[0].textContent).toMatch(/1 note/)
    expect(page.querySelectorAll('[data-testid=wf-group]').length).toBeGreaterThan(3)
    act(() => page.querySelector('[data-testid=wf-more]').click())
    expect(page.querySelectorAll('[data-testid=wf-card]').length).toBe(60)
    type(page.querySelector('[data-testid=wf-search] input, input[data-testid=wf-search]'), 'Great work')
    expect(page.querySelectorAll('[data-testid=wf-card]').length).toBe(1)
  })

  it('the summary\'s notes: the old note is the first one, the client and a trainer add theirs', () => {
    setS({ workouts: [W('a', '2026-11-20', { note: 'Felt strong', name: 'Push' }), W('b', '2026-11-24', { name: 'Push' })] })
    const page = mount(<Workouts />)
    act(() => page.querySelector('[data-testid=wf-card] button').click())
    let sheet = top()
    expect(sheet.querySelector('[data-testid=wf-compare]')).toBeTruthy()
    // b is newest: no notes yet; the client writes one.
    type(sheet.querySelector('[data-tour=wd-note]'), 'Easy today')
    act(() => sheet.querySelector('[data-testid=wf-send]').click())
    let b = useStore.getState().S.workouts.find(w => w.id === 'b')
    expect(b.notes.map(n => [n.text, n.by.role])).toEqual([['Easy today', 'self']])
    expect(b.note).toBe('Easy today')
    // A trainer leading Ania answers on the older workout; the old note stays first and hers.
    act(() => useUI.setState({ sheets: [] }))
    useStore.setState({ user: { id: 'CLI', name: 'Ania', acting: { by: { id: 'TR1', name: 'Tomasz' } } } })
    act(() => page.querySelectorAll('[data-testid=wf-card] button')[1].click())
    sheet = top()
    type(sheet.querySelector('[data-tour=wd-note]'), 'Nice depth')
    act(() => sheet.querySelector('[data-testid=wf-send]').click())
    const a = useStore.getState().S.workouts.find(w => w.id === 'a')
    expect(a.notes.map(n => [n.text, n.by?.role])).toEqual([['Felt strong', 'self'], ['Nice depth', 'trainer']])
    expect(a.note).toBe('Felt strong')
    const again = top()
    const notes = again.querySelectorAll('[data-testid=wf-note]')
    expect(notes[1].textContent).toMatch(/Tomasz.*Trainer/)
    // The trainer may edit only their own note.
    expect(notes[0].querySelector('.wf-note-a')).toBe(null)
    expect(notes[1].querySelector('.wf-note-a')).toBeTruthy()
  })

  it('the day sheet: the day\'s workouts, add on a past day, start today, plan a day to come', () => {
    const today = new Date(); const iso = d => new Date(today.getFullYear(), today.getMonth(), today.getDate() + d, 12).toISOString().slice(0, 10)
    setS({ workouts: [W('p', iso(-2))] })
    dayOverrideSheet(iso(-2))
    let s = top()
    expect(s.querySelector('[data-testid=day-workouts]').textContent).toMatch(/Push p/)
    expect(s.querySelector('[data-testid=day-add-past]')).toBeTruthy()
    dayOverrideSheet(new Date(today.getFullYear(), today.getMonth(), today.getDate()).toLocaleDateString('sv'))
    s = top()
    expect(s.querySelector('[data-testid=day-start]')).toBeTruthy()
    dayOverrideSheet(iso(3))
    s = top()
    expect(s.querySelector('[data-testid=day-planned]')).toBeTruthy()
  })
})
