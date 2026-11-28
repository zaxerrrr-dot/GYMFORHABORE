// @vitest-environment happy-dom
/* Habcore Gym (kl16): sessions a trainer planned at a time of day (components/Sessions.jsx, lib/sessions-core.js):
   the client sees them on Home, in the day sheet and in Plan, and starts one; a trainer leading the
   client plans one through the gym route (its answer lands in the store at once); the sync merge keeps
   both copies' sessions; the phone app's reminder and change notifications; the calendar sheet's note
   about calendars refreshing on their own. On the real store. */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { dayOverrideSheet } from '../sheets.jsx'
import { UpcomingSessions, PlanSessions, SessionSheet, SessionForm } from './Sessions.jsx'
import { applySessionOp, sessionStart, plannedSessionDays } from '../lib/sessions-core.js'
import { MonthDays } from './GymClientFeed.jsx'
import { mergeStates } from '../lib/sync-merge.js'
import { buildSessionNotifications, sessionChangeNotifications } from '../lib/mobile.js'
import { CalendarSheet } from './CalendarFeed.jsx'
import { todayISO } from '../lib/format.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mounted = []
const mount = el => { const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host); mounted.push(r); act(() => r.render(<MemoryRouter>{el}</MemoryRouter>)); return host }
const top = () => { const s = useUI.getState().sheets.at(-1); return mount(s.render(() => useUI.getState().closeSheet(s.id))) }
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const TR = { id: 'TR1', name: 'Tomasz', role: 'trainer' }
const plus = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const setS = patch => useStore.setState(() => ({ S: { ...structuredClone(DEF), unit: 'kg', ...patch } }))
const routine = { id: 'r1', name: 'Upper', emoji: '', ex: [] }
// A session later today (or tomorrow if it is late), and one next week.
const soon = () => { const at = new Date(Date.now() + 2 * 3600000); return { d: at.toISOString().slice(0, 10) === todayISO() ? todayISO() : plus(1), t: '23:30' } }
const planned = (extra = {}) => applySessionOp([], { op: 'add', ...soon(), rid: 'r1', rname: 'Upper', note: 'Bring water', tr: TR, ...extra }, TR, Date.now() - 1000).list
beforeEach(() => { useUI.setState({ sheets: [] }); useStore.setState({ user: { id: 'CLI', name: 'Ania' } }) })
afterEach(() => { act(() => mounted.splice(0).forEach(r => r.unmount())); vi.restoreAllMocks() })

describe('sessions on the client side (kl16)', () => {
  it('Home shows the next sessions with time and trainer; the sheet starts the plan', () => {
    const list = planned()
    setS({ routines: [routine], sessions: list })
    const page = mount(<UpcomingSessions S={useStore.getState().S} />)
    const card = page.querySelector('[data-testid=home-sessions]')
    expect(card.textContent).toMatch(/Workout with Tomasz/)
    expect(card.textContent).toMatch(/23:30/)
    expect(card.textContent).toMatch(/00:30/)   // 60 min by default
    act(() => page.querySelector('[data-testid=sess-row]').click())
    const sheet = top()
    expect(sheet.textContent).toMatch(/Bring water/)
    expect(sheet.textContent).toMatch(/Mickiewicza 25J/)
    expect(sheet.querySelector('[data-testid=sess-edit]')).toBeNull()   // a client does not edit
    act(() => sheet.querySelector('[data-testid=sess-start]').click())
    const st = useStore.getState().S
    // Started (the plan's workout runs) or the preview of it opened.
    expect(!!st.active || useUI.getState().sheets.length > 0).toBe(true)
  })

  it('Home shows the 3 next sessions; "Show more (N)" opens the rest and "Fold away" closes them (kl17)', () => {
    let list = []
    for (let i = 1; i <= 5; i++) list = applySessionOp(list, { op: 'add', d: plus(i), t: '18:00', rid: 'r1', rname: 'Upper', tr: TR }, TR, Date.now() - 1000).list
    setS({ routines: [routine], sessions: list })
    const page = mount(<UpcomingSessions S={useStore.getState().S} />)
    const card = page.querySelector('[data-testid=home-sessions]')
    const more = card.querySelector('[data-testid=home-sessions-more]')
    const hidden = card.querySelector('[data-testid=home-sessions-more-list]')
    expect(more.textContent).toBe('Show more (2)')
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(hidden.classList.contains('open')).toBe(false)
    expect(hidden.querySelectorAll('[data-testid=sess-row]')).toHaveLength(2)
    expect(card.querySelectorAll('[data-testid=sess-row]').length - hidden.querySelectorAll('[data-testid=sess-row]').length).toBe(3)
    act(() => more.click())
    expect(hidden.classList.contains('open')).toBe(true)
    expect(more.textContent).toBe('Fold away')
    act(() => more.click())
    expect(hidden.classList.contains('open')).toBe(false)
  })

  it('calendars mark a planned session day with a ring, a trained one with the full dot (kl17)', () => {
    let list = applySessionOp([], { op: 'add', d: plus(2), t: '18:00', rid: 'r1', rname: 'Upper', tr: TR }, TR, Date.now() - 1000).list
    list = applySessionOp(list, { op: 'add', d: plus(3), t: '18:00', rid: 'r1', rname: 'Upper', tr: TR }, TR, Date.now() - 1000).list
    list = applySessionOp(list, { op: 'cancel', id: list[1].id }, TR).list
    setS({ routines: [routine], sessions: list })
    const days = plannedSessionDays(useStore.getState().S)
    expect([...days.keys()]).toEqual([plus(2)])   // the cancelled one is no planned day
    const page = mount(<MonthDays days={new Set([plus(1)])} planned={new Set([plus(1), plus(2)])} S={useStore.getState().S} onDay={() => {}} />)
    const cls = [...page.querySelectorAll('.wf-day-cal button')].map(b => b.className.trim())
    // a trained day stays the full dot even when a session was planned on it; the planned one gets the ring
    expect(cls.filter(c => c.startsWith('has')).length).toBeGreaterThanOrEqual(plus(1).slice(0, 7) === todayISO().slice(0, 7) ? 1 : 0)
    if (plus(2).slice(0, 7) === todayISO().slice(0, 7)) expect(cls.filter(c => c.startsWith('sess'))).toHaveLength(1)
  })

  it('"Plan a session": the trainer is the one signed in, another only after "Change"; an edit keeps its own (kl17)', () => {
    const trainers = [{ id: 'T1', name: 'Anna' }, { id: 'T2', name: 'Tomasz' }]
    setS({ routines: [routine] })
    useStore.setState({ user: { id: 'T2', name: 'Tomasz' } })
    let page = mount(<SessionForm client={{ id: 'C', name: 'Ania' }} routines={[routine]} trainers={trainers} close={() => {}} />)
    expect(page.querySelector('[data-testid=sess-trainer-name]').textContent).toBe('Tomasz')
    expect(page.querySelector('[data-testid=sess-trainer]')).toBeNull()
    act(() => page.querySelector('[data-testid=sess-trainer-change]').click())
    expect(page.querySelector('[data-testid=sess-trainer]').value).toBe('T2')
    // leading a client: the trainer behind the client's account
    useStore.setState({ user: { id: 'C', name: 'Ania', acting: { by: { id: 'T1', name: 'Anna' } } } })
    page = mount(<SessionForm client={{ id: 'C', name: 'Ania' }} routines={[routine]} trainers={trainers} close={() => {}} />)
    expect(page.querySelector('[data-testid=sess-trainer-name]').textContent).toBe('Anna')
    // an admin who is not a trainer: the first trainer
    useStore.setState({ user: { id: 'ADM', name: 'admin' } })
    page = mount(<SessionForm client={{ id: 'C', name: 'Ania' }} routines={[routine]} trainers={trainers} close={() => {}} />)
    expect(page.querySelector('[data-testid=sess-trainer-name]').textContent).toBe('Anna')
    // an edit keeps the session's trainer
    useStore.setState({ user: { id: 'T1', name: 'Anna' } })
    const s0 = applySessionOp([], { op: 'add', d: plus(2), t: '18:00', rid: 'r1', rname: 'Upper', tr: { id: 'T2', name: 'Tomasz' } }, TR, Date.now() - 1000).list[0]
    page = mount(<SessionForm client={{ id: 'C', name: 'Ania' }} routines={[routine]} trainers={trainers} s0={s0} close={() => {}} />)
    expect(page.querySelector('[data-testid=sess-trainer-name]').textContent).toBe('Tomasz')
  })

  it('three sessions or fewer: no "Show more" (kl17)', () => {
    let list = []
    for (let i = 1; i <= 3; i++) list = applySessionOp(list, { op: 'add', d: plus(i), t: '18:00', rid: 'r1', rname: 'Upper', tr: TR }, TR, Date.now() - 1000).list
    setS({ routines: [routine], sessions: list })
    const page = mount(<UpcomingSessions S={useStore.getState().S} />)
    expect(page.querySelectorAll('[data-testid=sess-row]')).toHaveLength(3)
    expect(page.querySelector('[data-testid=home-sessions-more]')).toBeNull()
  })

  it('nothing planned and not leading: no card; a cancelled one is not "next"', () => {
    const list = planned()
    setS({ routines: [routine], sessions: applySessionOp(list, { op: 'cancel', id: list[0].id }, TR).list })
    const page = mount(<UpcomingSessions S={useStore.getState().S} />)
    expect(page.querySelector('[data-testid=home-sessions]')).toBeNull()
  })

  it('the day sheet and Plan list the day\'s sessions', () => {
    const list = applySessionOp([], { op: 'add', d: plus(2), t: '07:15', dur: 45, tr: TR, rep: { days: [new Date(plus(2) + 'T12:00:00').getDay()], weeks: 2 } }, TR).list
    setS({ routines: [routine], sessions: list })
    dayOverrideSheet(plus(2))
    const sheet = top()
    expect(sheet.querySelector('[data-testid=day-sessions]').textContent).toMatch(/07:15/)
    expect(sheet.querySelector('[data-testid=day-sess-plan]')).toBeNull()   // only while leading
    const plan = mount(<PlanSessions S={useStore.getState().S} />)
    expect(plan.querySelectorAll('[data-testid=sess-row]').length).toBe(2)
    expect(plan.textContent).toMatch(/08:00/)
  })

  it('a trainer leading the client plans a series; the answer lands in the store at once', async () => {
    useStore.setState({ user: { id: 'CLI', name: 'Ania', acting: { by: { id: 'TR1', name: 'Tomasz' } } } })
    setS({ routines: [routine], sessions: [] })
    const made = applySessionOp([], { op: 'add', d: plus(1), t: '18:00', tr: TR, rep: { days: [1, 3], weeks: 2 } }, TR).list
    const calls = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null })
      if (String(url).includes('/client/sessions')) return new Response(JSON.stringify({ sessions: [], routines: [routine], trainers: [{ id: 'TR1', name: 'Tomasz' }, { id: 'TR2', name: 'Ola' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true, sessions: made, changed: made.map(s => s.id), overlaps: [{ id: 'x', d: plus(1), t: '18:30', dur: 30, client: { id: 'CL2', name: 'Basia' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    dayOverrideSheet(plus(1))
    const day = top()
    act(() => day.querySelector('[data-testid=day-sess-plan]').click())
    await flush()
    const form = top()
    expect(form.querySelector('[data-testid=sess-trainer-change]')).not.toBeNull()   // two trainers: the one planning, another after "Change" (kl17)
    act(() => form.querySelector('[data-testid=sess-repeat] input, [data-testid=sess-repeat]').click())
    await flush()
    act(() => form.querySelector('[data-testid=sess-save]').click())
    await flush()
    const sent = calls.find(c => c.url.includes('/client/session') && c.body)?.body
    expect(sent).toMatchObject({ id: 'CLI', op: 'add', d: plus(1), t: '18:00', dur: 60, tr: { id: 'TR1' } })
    expect(sent.rep.weeks).toBe(8)
    expect(useStore.getState().S.sessions.length).toBe(made.length)
    // The overlap is only a warning sheet.
    expect(top().textContent).toMatch(/Basia/)
  })

  it('a trainer sees Change and Cancel in the sheet; the series asks which ones', () => {
    const list = applySessionOp([], { op: 'add', d: plus(3), t: '10:00', tr: TR, rep: { days: [new Date(plus(3) + 'T12:00:00').getDay()], weeks: 3 } }, TR).list
    const page = mount(<SessionSheet s={list[0]} staff={{ client: { id: 'CLI', name: 'Ania' } }} close={() => {}} />)
    expect(page.textContent).toMatch(/Part of a weekly series/)
    act(() => page.querySelector('[data-testid=sess-cancel]').click())
    const menu = top()
    expect(menu.textContent).toMatch(/Only this session/)
    expect(menu.textContent).toMatch(/This and all following in the series/)
  })
})

describe('sync and notifications (kl16)', () => {
  it('mergeStates keeps both copies\' sessions, the later change of one occurrence wins', () => {
    const a = applySessionOp([], { op: 'add', d: '2026-12-01', t: '18:00', tr: TR }, TR, 1000).list
    const moved = applySessionOp(a, { op: 'edit', id: a[0].id, t: '19:00' }, TR, 3000).list
    const b = applySessionOp(a, { op: 'add', d: '2026-12-02', t: '08:00', tr: TR }, TR, 2000).list
    const m = mergeStates({ ...structuredClone(DEF), _ts: 5, sessions: moved }, { ...structuredClone(DEF), _ts: 9, sessions: b })
    expect(m.sessions.map(s => s.d + ' ' + s.t)).toEqual(['2026-12-01 19:00', '2026-12-02 08:00'])
  })

  it('the phone plans a reminder an hour before (or as set), and tells about a trainer\'s change once', () => {
    const list = applySessionOp([], { op: 'add', d: plus(2), t: '18:00', rname: 'Upper', tr: TR }, TR).list
    const S = { sessions: list, reminder: {} }
    const n = buildSessionNotifications(S)
    expect(n.length).toBe(1)
    expect(+n[0].schedule.at).toBe(sessionStart(list[0]) - 3600000)
    expect(n[0].title).toMatch(/Tomasz/)
    expect(buildSessionNotifications({ ...S, reminder: { sessBefore: 0 } })).toEqual([])
    expect(+buildSessionNotifications({ ...S, reminder: { sessBefore: 15 } })[0].schedule.at).toBe(sessionStart(list[0]) - 900000)
    const store = new Map(); const ls = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
    expect(sessionChangeNotifications({ sessions: [] }, ls)).toEqual([])          // first look
    expect(sessionChangeNotifications(S, ls).map(x => x.title)).toEqual(['Tomasz planned a workout'])
    expect(sessionChangeNotifications(S, ls)).toEqual([])                         // once
    const moved = applySessionOp(list, { op: 'edit', id: list[0].id, t: '19:00' }, TR).list
    expect(sessionChangeNotifications({ sessions: moved }, ls).map(x => x.title)).toEqual(['Tomasz moved a workout'])
    const gone = applySessionOp(moved, { op: 'cancel', id: list[0].id }, TR).list
    expect(sessionChangeNotifications({ sessions: gone }, ls).map(x => x.title)).toEqual(['Tomasz cancelled a workout'])
  })

  it('the calendar sheet says calendars refresh on their own', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ on: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const page = mount(<CalendarSheet close={() => {}} feed="trainer" />)
    await flush()
    expect(page.querySelector('[data-testid=cal-lag]').textContent).toMatch(/Apple: usually within an hour/)
    expect(page.textContent).toMatch(/first name and plan only/)
    expect(page.textContent).not.toMatch(/Show finished workouts too/)
  })
})
