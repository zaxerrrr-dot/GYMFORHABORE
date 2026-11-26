/* Live joint training (local patch 0006): two copies of the app's own live client (lib/gym-live.js)
   — the client's iPhone and the trainer leading the client — on the server's real channel code
   (api/gymv2/live.js, in this process, its files in a temp dir). The workout has the shape the app
   gives it (sheets.jsx beginWorkout, set ids from the watch sync), the watch's ticks are written
   with the watch sync's own patchSetIn, and the finished workout is built with finish-workout.js.
   Checked: what one side changes shows on the other, edits and removals both ways, the merge of
   two changes at once (per field, per set; the same field: the later one, then the device id),
   order independence, offline and back, a reload in between, the end on both sides. */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createLiveClient, ensureIds } from './gym-live.js'
import { createLive } from '../../../api/gymv2/live.js'
import * as core from '../../../api/gymv2/live-core.js'
import { patchSetIn } from './watch-sync.js'
import { buildCompletedWorkout } from './finish-workout.js'

const clone = v => JSON.parse(JSON.stringify(v))
const MIN = 60e3
const T0 = Date.UTC(2026, 10, 26, 17, 0, 0)

// A workout as beginWorkout starts it for a routine "Push A" (two exercises, prescriptions in
// `target`, empty rows to fill), ids already given (watch-sync ensureSetIds, gym-live ensureIds).
function startedWorkout() {
  const A = {
    id: 'mihxk2m3abcd', d: '2026-11-26', start: T0, routineIds: ['r-push'], name: 'Push A', bw: 82, cur: 0, workoutView: 'cards',
    entries: [
      { id: '0025', rid: 'r-push', target: { id: '0025', mode: 'reps', sets: 3, reps: 8, weight: 80, inc: 2.5 }, plan: { w: 80, r: 8 }, topW: 80,
        sets: [{ w: 80, r: 8, done: false }, { w: 80, r: 8, done: false }, { w: 80, r: 8, done: false }] },
      { id: '0027', rid: 'r-push', target: { id: '0027', mode: 'reps', sets: 2, reps: 10, weight: 60 }, plan: { w: 60, r: 10 }, topW: 60,
        sets: [{ w: 60, r: 10, done: false }, { w: 60, r: 10, done: false }] },
    ],
  }
  ensureIds(A)
  return A
}

// One device: a store like useStore's (update → subscribers), and the live client on top.
function device(server, { uid = 'CLI', actor = null, name, clock, from = null }) {
  let state = { S: { workouts: [], active: null, unit: 'kg' }, user: { id: uid, name: 'Sylwester', ...(actor ? { acting: { by: actor } } : {}) }, config: { gymv2: { on: true, live: true, role: actor ? 'trainer' : 'member', acting: !!actor } }, ready: true }
  const subs = []
  const storage = new Map(from || [])
  const queued = []
  const timers = { setTimeout: fn => { queued.push(fn); return queued.length }, clearTimeout: () => {} }
  let online = true
  const events = []
  const dev = {
    name, events, storage,
    get: () => state,
    update(fn) { const prev = state; const S = clone(state.S); fn(S); state = { ...state, S }; for (const f of subs) f(state, prev) },
    setOnline(v) { online = v },
  }
  const request = async (method, p, body) => {
    if (!online) throw Object.assign(new Error('offline'), { status: 0 })
    const u = new URL(p, 'http://x')
    const act = actor ? { id: actor, name: 'Tomasz' } : null
    if (method === 'POST' && u.pathname === '/api/live/ops') {
      try { return server.push(uid, { ...body, actor: act }) } catch (e) { const err = new Error(e.message); err.status = e.status; err.data = { code: e.code, ...(e.extra || {}) }; throw err }
    }
    if (method === 'POST' && u.pathname === '/api/live/end') return server.end(uid, { ...body, actor: act })
    if (method === 'GET' && u.pathname === '/api/live') {
      const q = u.searchParams
      server.seen(uid, q.get('dev'), act)
      return server.answer(uid, q.get('wid') || '', q.has('since') ? Number(q.get('since')) : null)
    }
    throw new Error('no route ' + method + ' ' + p)
  }
  dev.client = createLiveClient({
    get: dev.get, update: (fn) => dev.update(fn), request, now: clock,
    storage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    timers,
    hooks: {
      toast: k => events.push('toast:' + k), adopted: () => events.push('adopted'), ended: e => events.push('ended:' + e.how),
      finish: () => { events.push('finish'); dev.finishHere() },
    },
  })
  subs.push((s, p) => dev.client.onStore(s, p))
  // Runs what waits on a timer (the 120 ms diff, the shadow save), then lets promises settle.
  dev.tick = async () => { for (let i = 0; i < 5; i++) { while (queued.length) queued.shift()(); await new Promise(r => setTimeout(r, 0)) } }
  // A round: send what is owed, then read what is new (what the long poll / stream would bring).
  dev.sync = async () => {
    dev.client.diffNow(); await dev.tick(); await dev.client.flush(); await dev.tick()
    if (!online) return
    const st = dev.client.state
    const a = await request('GET', `/api/live?dev=${dev.client.dev}${st.attached ? `&wid=${st.wid}&since=${st.seq}` : ''}`)
    dev.client.receive(a); await dev.tick()
  }
  dev.A = () => state.S.active
  // The phone's Finish (sheets.jsx doFinishWorkout, the parts that change the document).
  dev.finishHere = () => {
    const A = state.S.active
    const w = buildCompletedWorkout(A, { end: clock() })
    dev.update(S => { S.workouts.push(w); S.active = null })
  }
  return dev
}

const view = A => A && A.entries.map(e => `${e.id}:` + e.sets.map(s => `${s.w}x${s.r}${s.done ? '✓' : ''}${s.hr ? '♥' + s.hr.avg : ''}`).join(','))

let dir, server, now
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-live-app-'))
  now = T0 + 5 * MIN
  server = createLive({ dataDir: dir, now: () => now })
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })
const clock = () => now
const later = (ms = 1000) => { now += ms }

async function pair() {
  const phone = device(server, { name: 'phone', clock })
  const trainer = device(server, { name: 'trainer', actor: 'TR1', clock })
  phone.update(S => { S.active = startedWorkout() })
  await phone.sync()
  await trainer.sync()          // no workout of its own: it picks the client's up
  return { phone, trainer }
}

describe('live joint training (two app copies, the real channel)', () => {
  it('the trainer joins the running workout and sees it as the client has it', async () => {
    const { phone, trainer } = await pair()
    expect(trainer.events).toContain('adopted')
    expect(trainer.A().id).toBe(phone.A().id)
    expect(view(trainer.A())).toEqual(view(phone.A()))
    expect(trainer.A().entries[0].target).toEqual(phone.A().entries[0].target)
    expect(server._load('CLI').wid).toBe(phone.A().id)
  })

  it('the trainer adds an exercise and sets: on the phone after one round, the phone stays on its exercise', async () => {
    const { phone, trainer } = await pair()
    phone.update(S => { S.active.cur = 1 })
    later()
    trainer.update(S => {
      // "Add exercise" after the current unit, as Workout.jsx addExercise does (splice + cur).
      S.active.entries.splice(1, 0, { id: '0463', target: { id: '0463', mode: 'time', sec: 45, bodyweight: true }, sets: [{ sec: 45, done: false }] })
      S.active.cur = 1
    })
    await trainer.tick()       // ids for the new rows (gym-live ensureIds), then the diff
    later(); trainer.update(S => { S.active.entries[2].sets.push({ w: 60, r: 10, done: false }) })
    await trainer.sync()
    await phone.sync()
    expect(phone.A().entries.map(e => e.id)).toEqual(['0025', '0463', '0027'])
    expect(phone.A().entries[2].sets.length).toBe(3)
    // The phone was on 0027 (index 1): it still is, now index 2.
    expect(phone.A().cur).toBe(2)
    expect(view(phone.A())).toEqual(view(trainer.A()))
  })

  it('the watch ticks a set with heart rate (watch-sync patchSetIn): the trainer sees it', async () => {
    const { phone, trainer } = await pair()
    const sid = phone.A().entries[0].sets[0].sid
    later()
    phone.update(S => { patchSetIn(S, { wid: S.active.id, exId: '0025', entryIdx: 0, setIdx: 0, sid }, { w: 80, r: 8, done: true, at: now, hr: { avg: 128, max: 141 } }) })
    await phone.sync(); await trainer.sync()
    expect(trainer.A().entries[0].sets[0]).toMatchObject({ done: true, at: now, hr: { avg: 128, max: 141 }, sid })
  })

  it('two changes of one set at once: different fields both stay; the same field goes to the later one', async () => {
    const { phone, trainer } = await pair()
    later()
    // At the same moment: the trainer corrects the weight of set 2, the client ticks it on the watch.
    trainer.update(S => { S.active.entries[0].sets[1].w = 82.5 })
    phone.update(S => { Object.assign(S.active.entries[0].sets[1], { done: true, at: now }) })
    await phone.sync(); await trainer.sync(); await phone.sync()
    expect(phone.A().entries[0].sets[1]).toMatchObject({ w: 82.5, done: true })
    expect(trainer.A().entries[0].sets[1]).toMatchObject({ w: 82.5, done: true })
    // The same field: the trainer's 9 reps one second after the client's 7, the client's sent last.
    later(); phone.update(S => { S.active.entries[0].sets[2].r = 7 })
    phone.client.diffNow()
    later(); trainer.update(S => { S.active.entries[0].sets[2].r = 9 })
    await trainer.sync(); await phone.sync(); await trainer.sync()
    expect(phone.A().entries[0].sets[2].r).toBe(9)
    expect(trainer.A().entries[0].sets[2].r).toBe(9)
  })

  it('removals both ways: the trainer removes a set, the client removes an exercise', async () => {
    const { phone, trainer } = await pair()
    later()
    trainer.update(S => { S.active.entries[0].sets.splice(2, 1) })
    phone.update(S => { S.active.entries.splice(1, 1); S.active.cur = 0 })
    await trainer.sync(); await phone.sync(); await trainer.sync()
    expect(view(phone.A())).toEqual(['0025:80x8,80x8'])
    expect(view(trainer.A())).toEqual(['0025:80x8,80x8'])
    // A change after a removal brings the row back (nothing logged later is lost): the watch ticks
    // the set the trainer had removed a moment before the phone heard of it.
    const sid = phone.A().entries[0].sets[1].sid
    later(); trainer.update(S => { S.active.entries[0].sets.splice(1, 1) })
    await trainer.sync()
    later(); phone.update(S => { Object.assign(S.active.entries[0].sets[1], { done: true, at: now }) })
    await phone.sync(); await trainer.sync()
    expect(trainer.A().entries[0].sets.map(s => s.sid)).toContain(sid)
    expect(view(trainer.A())).toEqual(view(phone.A()))
  })

  it('offline and back: what both did meanwhile ends the same on both, nothing lost', async () => {
    const { phone, trainer } = await pair()
    phone.setOnline(false)
    later(); phone.update(S => { Object.assign(S.active.entries[0].sets[0], { done: true, at: now, hr: { avg: 120, max: 130 } }) })
    later(); trainer.update(S => { S.active.entries[1].sets.push({ w: 62.5, r: 8, done: false }); S.active.name = 'Push A + extra' })
    await trainer.sync()
    later(); phone.update(S => { S.active.entries[1].sets[0].r = 12 })
    await phone.sync()                        // fails: kept
    expect(phone.client.state.pending.length).toBeGreaterThan(0)
    phone.setOnline(true)
    await phone.sync(); await trainer.sync()
    expect(view(phone.A())).toEqual(view(trainer.A()))
    expect(phone.A().name).toBe('Push A + extra')
    expect(view(phone.A())).toEqual(['0025:80x8✓♥120,80x8,80x8', '0027:60x12,60x10,62.5x8'])
  })

  it('the app reloads mid-workout: changes made just before go out, the others\' are kept', async () => {
    const { phone, trainer } = await pair()
    later(); trainer.update(S => { S.active.entries[0].sets[0].w = 85 })
    await trainer.sync()
    // The phone changes a set, its shadow is saved, then the app is closed before sending.
    phone.setOnline(false)
    later(); phone.update(S => { S.active.entries[1].sets[1].w = 65 })
    await phone.sync()
    const saved = { storage: phone.storage, A: clone(phone.A()) }
    // A new copy of the app with the same storage and the same running workout.
    const again = device(server, { name: 'phone2', clock, from: saved.storage })
    again.update(S => { S.active = saved.A })
    await again.tick(); await again.sync(); await trainer.sync()
    expect(again.A().entries[0].sets[0].w).toBe(85)
    expect(trainer.A().entries[1].sets[1].w).toBe(65)
    expect(view(again.A())).toEqual(view(trainer.A()))
  })

  it('the client finishes: one workout saved on the phone with everything, the trainer closes without saving', async () => {
    const { phone, trainer } = await pair()
    later(); trainer.update(S => { Object.assign(S.active.entries[1].sets[0], { w: 62.5, done: true, at: now }) })
    await trainer.sync(); await phone.sync()
    later(); phone.finishHere()
    await phone.tick(); await phone.tick()
    await trainer.sync()
    expect(trainer.events).toContain('ended:saved')
    expect(trainer.A()).toBe(null)
    expect(trainer.get().S.workouts).toEqual([])
    expect(phone.get().S.workouts.length).toBe(1)
    expect(phone.get().S.workouts[0].entries.find(e => e.id === '0027').sets[0].w).toBe(62.5)
    expect(server._load('CLI').ended.how).toBe('saved')
    // The trainer's copy does not pick the ended workout up again.
    await trainer.sync()
    expect(trainer.A()).toBe(null)
  })

  it('the trainer\'s Finish while the phone is there: the phone finishes and saves it', async () => {
    const { phone, trainer } = await pair()
    later(); trainer.update(S => { Object.assign(S.active.entries[0].sets[0], { done: true, at: now }) })
    expect(trainer.client.finishGate()).toBe(true)
    expect(trainer.A()).toBe(null)
    await trainer.tick(); await trainer.tick()
    await phone.sync()
    expect(phone.events).toContain('finish')
    expect(phone.A()).toBe(null)
    expect(phone.get().S.workouts[0].entries[0].sets[0].done).toBe(true)
    await phone.tick(); await phone.tick()
    expect(server._load('CLI').ended.how).toBe('saved')
    expect(trainer.get().S.workouts).toEqual([])
  })

  it('the phone away for 90 s: the trainer\'s Finish saves it on the trainer\'s side; a trainer\'s Discard only leaves', async () => {
    const { phone, trainer } = await pair()
    later(120 * 1000)
    await trainer.sync()
    expect(trainer.client.finishGate()).toBe(false)
    // Discard on the trainer's side: the client's workout goes on.
    trainer.update(S => { S.active = null })
    await trainer.tick()
    expect(trainer.events).toContain('toast:left')
    expect(server._load('CLI').ended).toBe(null)
    await phone.sync()
    expect(phone.A()).not.toBe(null)
    // The client's Discard ends it for everyone.
    trainer.client.rejoin(phone.A().id)
    await trainer.sync()
    expect(trainer.A().id).toBe(phone.A().id)
    later(); phone.update(S => { S.active = null })
    await phone.tick(); await phone.tick()
    await trainer.sync()
    expect(trainer.events).toContain('ended:discarded')
    expect(trainer.A()).toBe(null)
  })
})

describe('the merge rules (live-core.js)', () => {
  it('any order of the same ops gives the same workout', () => {
    const A = startedWorkout()
    const base = core.diffFlat({}, core.flatten(A), 1000, 'devA')
    const ops = [...base]
    let t = 2000
    const devs = ['devA', 'devB', 'devC']
    let cur = clone(A)
    for (let i = 0; i < 60; i++) {
      const d = devs[i % 3]
      const next = clone(cur)
      const e = next.entries[i % next.entries.length]
      if (i % 7 === 0) next.entries.push({ lid: 'x' + i, id: '00' + (30 + i), sets: [{ sid: 'q' + i, w: i, r: 5, done: false }] })
      else if (i % 11 === 0 && e.sets.length > 1) e.sets.pop()
      else if (e.sets.length) Object.assign(e.sets[0], { w: i, done: i % 2 === 0 })
      ops.push(...core.diffFlat(core.flatten(cur), core.flatten(next), t += (i % 4 === 0 ? 0 : 10), d))
      cur = next
    }
    const results = new Set()
    for (let k = 0; k < 8; k++) {
      const shuffled = ops.slice().sort(() => Math.random() - 0.5)
      const el = {}
      core.applyOps(el, shuffled)
      results.add(core.stable(core.render(el, A.id)))
    }
    expect(results.size).toBe(1)
    const el = {}; core.applyOps(el, ops)
    expect(core.stable(core.flatten(core.render(el, A.id)))).toBe(core.stable(core.flatten({ ...cur, id: A.id })))
  })

  it('a tie on the time goes to the larger device id, everywhere', () => {
    const el1 = {}, el2 = {}
    const a = { k: 's:x', f: 'w', v: 50, t: 10, d: 'devA' }, b = { k: 's:x', f: 'w', v: 60, t: 10, d: 'devB' }
    core.applyOps(el1, [a, b]); core.applyOps(el2, [b, a])
    expect(el1['s:x'].f.w.v).toBe(60)
    expect(el2['s:x'].f.w.v).toBe(60)
  })

  it('the device-only fields stay on the device', () => {
    const A = startedWorkout()
    const flat = core.flatten({ ...A, cur: 1, workoutView: 'list', collapseCompleted: true })
    expect(flat.h.cur).toBeUndefined()
    expect(flat.h.workoutView).toBeUndefined()
    expect(flat.h.name).toBe('Push A')
  })
})
