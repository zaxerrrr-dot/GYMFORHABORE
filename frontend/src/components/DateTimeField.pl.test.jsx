// @vitest-environment happy-dom
// Habcore Gym (kl17): the date and time fields speak the app's language, not the browser's. The owner
// saw the native pickers in English ("December 2026", M T W T F S S, Clear/Today, 03/12/2026, AM/PM)
// in a Polish app. In Polish: Polish month and day names, the week from Monday, "Wyczyść" and "Dziś",
// dd.mm.rrrr in the field, and a 24-hour clock.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { setLang } from '../lib/i18n.js'
import DateField from './DateField.jsx'
import TimeField from './TimeField.jsx'
import { pickTime } from './TimeField.test-util.js'
import { weekLine, PassaCard } from './Passa.jsx'

const mounted = []
function mount(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}
function openSheet(host, sel) {
  act(() => { host.querySelector(sel).click() })
  const sheet = useUI.getState().sheets.at(-1)
  return mount(sheet.render(() => useUI.getState().closeSheet(sheet.id)))
}
function DateHarness({ initial, ...rest }) {
  const [v, setV] = useState(initial)
  return <DateField value={v} onChange={setV} label="Data" {...rest} />
}
function TimeHarness({ initial }) {
  const [v, setV] = useState(initial)
  return <TimeField value={v} onChange={setV} aria-label="Godzina" />
}

describe('date and time fields in Polish', () => {
  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    await setLang('pl')
    useStore.setState(s => ({ S: { ...s.S, weekStart: undefined } }))
  })
  afterEach(async () => {
    while (mounted.length) act(() => mounted.pop().unmount())
    document.body.innerHTML = ''
    useUI.setState({ sheets: [] })
    await setLang('en')
  })

  it('shows the day as dd.mm.rrrr in the field', () => {
    const host = mount(<DateHarness initial="2026-12-03" />)
    expect(host.querySelector('[data-datefield]').textContent).toBe('03.12.2026')
  })

  it('names the month and the days in Polish, the week starting on Monday', () => {
    const host = mount(<DateHarness initial="2026-12-03" />)
    const p = openSheet(host, '[data-datefield]')
    expect(p.querySelector('[data-datep-title] .datep-t').textContent).toBe('Grudzień 2026')
    const heads = [...p.querySelectorAll('.cal-h')].map(e => e.textContent)
    expect(heads).toEqual(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'])
    // 1 December 2026 is a Tuesday: one empty cell before it in a Monday week.
    const grid = p.querySelector('.datep-grid')
    const firstDay = [...grid.children].findIndex(c => c.matches('[data-iso]'))
    expect(firstDay).toBe(7 + 1)
    expect(p.textContent).toContain('Dziś')
    expect(p.textContent).not.toMatch(/December|Today|Clear/)
  })

  it('offers "Wyczyść" where the field may be empty, and clears it', () => {
    const host = mount(<DateHarness initial="1990-05-04" clearable />)
    const p = openSheet(host, '[data-datefield]')
    const clear = p.querySelector('[data-datep-clear]')
    expect(clear.textContent).toBe('Wyczyść')
    act(() => { clear.click() })
    expect(host.querySelector('[data-datefield]').value).toBe('')
  })

  it('picks a time on a 24-hour clock, with no AM/PM', () => {
    const host = mount(<TimeHarness initial="07:30" />)
    const field = host.querySelector('[data-timefield]')
    expect(field.textContent).toBe('07:30')
    const p = openSheet(host, '[data-timefield]')
    const hours = [...p.querySelectorAll('[data-hour]')].map(b => b.textContent)
    expect(hours).toHaveLength(24)
    expect(hours[0]).toBe('00')
    expect(hours[23]).toBe('23')
    expect(p.textContent).not.toMatch(/AM|PM/)
    expect(p.textContent).toContain('Teraz')
    act(() => { while (mounted.length > 1) mounted.pop().unmount() })
    useUI.setState({ sheets: [] })
    expect(pickTime(host.querySelector('[data-timefield]'), '18:45')).toBe(true)
    expect(host.querySelector('[data-timefield]').value).toBe('18:45')
  })

  it('writes the Passa week line and day names in Polish, Monday first', () => {
    expect(weekLine({ count: 2, ms: 0, vol: 0 })).toBe('2 treningi')
    const host = mount(<PassaCard S={{ weekStart: 1, unit: 'kg', workouts: [] }} />)
    expect([...host.querySelectorAll('.passa-dl')].map(e => e.textContent)).toEqual(['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'])
  })
})
