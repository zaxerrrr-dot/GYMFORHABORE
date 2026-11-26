/* Joint training (local patch 0004, api/gymv2/merge.js): the client's workout from the phone and
   the watch, and the trainer's logged through "Lead as client", joined into one on the server. Built
   with the app's own code (finish-workout, health-read, sync-merge), then the joined document is met
   by both devices' older copies: nothing of the watch's is lost, the trainer's sets win, the
   trainer's workout never comes back, and the devices end up with the same document. */
import { describe, expect, it } from 'vitest'
import { buildCompletedWorkout } from './finish-workout.js'
import { mergeHeartRate } from './health-read.js'
import { healthRecords, goneIds } from './health-connect.js'
import { mergeStates, stampChange, highestStamp } from './sync-merge.js'
import { findPairs, joinWorkouts, placeJoin, overlapping, entriesCore, START_GAP_MS } from '../../../api/gymv2/merge.js'
import { stampPut } from '../../../api/sync-stamps.js'

const clone = v => JSON.parse(JSON.stringify(v))
const MIN = 60e3
const T0 = Date.UTC(2026, 10, 26, 17, 0, 0)
const at = m => T0 + m * MIN
const dense = (from, to, bpm) => { const out = []; for (let x = from; x <= to; x += 5000) out.push([x, bpm + (x / 5000) % 7]); return out }
const done = (x, m, hr) => ({ ...x, done: true, at: at(m), ...(hr ? { hr } : {}) })

// The client: started at 17:00 on the iPhone, Apple Watch running it, nothing ticked on the phone
// except one bench set (with the watch's heart rate on it) and a plank only they did; finished
// 18:02. The session's heart rate then comes from Apple Health (health-read mergeHeartRate).
function clientWorkout({ sets = true } = {}) {
  const active = {
    id: 'cw-1764176400000', d: '2026-11-26', start: at(0), name: 'Trening', routineIds: [], bw: 82,
    entries: sets ? [
      { id: '0025', target: { mode: 'reps', reps: 8, weight: 60 }, sets: [done({ w: 60, r: 8 }, 12, { avg: 121, max: 134 }), { w: 60, r: 8 }] },
      { id: '0463', target: { mode: 'time', sec: 45, bodyweight: true }, sets: [done({ sec: 45 }, 55, { avg: 140, max: 151 })] },
    ] : [],
  }
  const w = buildCompletedWorkout(active, { end: at(62) })
  w.vol = 480
  return w
}
// The trainer: the same session logged on their phone while leading the client, 17:03 to 18:00.
function trainerWorkout() {
  const active = {
    id: 'tw-1764176580000', d: '2026-11-26', start: at(3), name: 'Push A', routineIds: ['r-push'], bw: null,
    entries: [
      { id: '0025', target: { mode: 'reps', reps: 8, weight: 80 }, sets: [done({ w: 60, r: 10, phase: 'warmup' }, 8), done({ w: 80, r: 8 }, 12), done({ w: 82.5, r: 8 }, 16), done({ w: 85, r: 6 }, 20)] },
      { id: '0027', target: { mode: 'reps', reps: 10, weight: 60 }, sets: [done({ w: 60, r: 10 }, 30), done({ w: 60, r: 10 }, 34), done({ w: 60, r: 9 }, 38)] },
    ],
    note: 'Dobra technika na ławce',
  }
  const w = buildCompletedWorkout(active, { end: at(60), prs: ['0025'] })
  w.vol = 4910
  return w
}
// A device's change, stamped the way useStore stamps one.
function change(S, fn, now) {
  const prev = clone(S)
  fn(S)
  const t = stampChange(prev, S, now)
  S._ts = t
  return S
}
// The server's join, as gymv2/index.js reconcile does it inside writeStateAs.
function serverJoin(stored, now) {
  const next = clone(stored)
  const t = Math.max(now, highestStamp(stored) + 1)
  const trainerIds = new Set(['tw-1764176580000'])
  const { pairs, ambiguous } = findPairs(next.workouts, trainerIds, { now })
  expect(ambiguous).toEqual([])
  expect(pairs.length).toBe(1)
  const { trainer, client } = pairs[0]
  const joined = joinWorkouts(client, trainer, { id: 'M1', by: { id: 'TR1', name: 'Tomasz' }, at: t })
  expect(placeJoin(next, t, client.id, joined, trainer)).toBe(true)
  stampPut(stored, next, { stamped: true, now: t })
  next._ts = t
  return { next, trainer, client, t }
}

function setup({ sets = true } = {}) {
  // The client's phone: the finished workout, then Apple Health's heart rate for it.
  let phone = { unit: 'kg', workouts: [], routines: [], _ts: at(-600) }
  phone = change(phone, s => { s.workouts.push(clientWorkout({ sets })) }, at(62) + 1000)
  phone = change(phone, s => { mergeHeartRate(s, 'cw-1764176400000', dense(at(0), at(62), 118), 'ah', at(64)) }, at(64))
  // The trainer's phone, leading the client: its copy of the client's account with its workout.
  let coach = clone({ unit: 'kg', workouts: [], routines: [], _ts: at(-600) })
  coach = change(coach, s => { s.workouts.push(trainerWorkout()) }, at(60) + 2000)
  // Both pushed (the second after a 409 and the app's merge).
  const stored = mergeStates(phone, coach)
  return { phone, coach, stored }
}

describe('pairing', () => {
  it('half the shorter one overlapping, or starts at most 20 minutes apart', () => {
    const w = (s, e) => ({ id: 'x', start: at(s), end: at(e) })
    expect(overlapping(w(0, 60), w(3, 58))).toBe(true)
    expect(overlapping(w(0, 60), w(30, 120))).toBe(true)           // 30 of the shorter 60 overlap
    expect(overlapping(w(0, 60), w(40, 120))).toBe(false)          // 20 of 60, and started 40 min apart
    expect(overlapping(w(0, 60), w(45, 120))).toBe(false)          // 15 min overlap of 60, starts 45 apart
    expect(overlapping(w(0, 10), w(15, 70))).toBe(true)            // no overlap, started 15 min apart
    expect(overlapping(w(0, 10), w(0 + START_GAP_MS / MIN + 1, 70))).toBe(false)
    expect(overlapping({ id: 'a', start: at(0) }, w(0, 60))).toBe(false)   // no end: not a finished workout
  })

  it('finds the pair; leaves out what is old, already joined, or ambiguous', () => {
    const t = { id: 't1', start: at(3), end: at(60) }
    const c = { id: 'c1', start: at(0), end: at(62) }
    const T = new Set(['t1'])
    expect(findPairs([t, c], T, { now: at(70) }).pairs.map(p => [p.trainer.id, p.client.id])).toEqual([['t1', 'c1']])
    expect(findPairs([t, c], T, { now: at(70) + 49 * 3600e3 }).pairs).toEqual([])
    expect(findPairs([t, c], T, { now: at(70), skip: id => id === 'c1' }).pairs).toEqual([])
    expect(findPairs([t, { ...c, gymMerge: { id: 'M0' } }], T, { now: at(70) }).pairs).toEqual([])
    const two = findPairs([t, c, { id: 'c2', start: at(5), end: at(50) }], T, { now: at(70) })
    expect(two.pairs).toEqual([])
    expect(two.ambiguous).toEqual([{ trainer: 't1', clients: ['c1', 'c2'], trainers: ['t1'] }])
    // Two trainer workouts on one client workout: not joined either.
    const back = findPairs([t, c, { id: 't2', start: at(1), end: at(61) }], new Set(['t1', 't2']), { now: at(70) })
    expect(back.pairs).toEqual([])
    expect(back.ambiguous.length).toBe(2)
  })
})

describe('the joined workout', () => {
  it('is the client\'s workout with the trainer\'s exercises; nothing of the watch is lost', () => {
    const { stored } = setup()
    const before = stored.workouts.find(w => w.id === 'cw-1764176400000')
    expect(before.hr).toMatchObject({ src: 'ah' })
    const { next } = serverJoin(stored, at(65))
    expect(next.workouts.map(w => w.id)).toEqual(['cw-1764176400000'])
    const j = next.workouts[0]
    // From the client's: id (Apple Health's opengym-w-<id>), times, session heart rate, body weight.
    expect([j.id, j.d, j.start, j.end, j.bw]).toEqual([before.id, before.d, before.start, before.end, 82])
    expect(j.hr).toEqual(before.hr)
    // From the trainer's: exercises and sets, PRs, routine (and its name: the client's had none).
    expect(j.entries.map(e => e.id)).toEqual(['0025', '0027', '0463'])
    expect(j.entries[0].sets.map(s => s.w)).toEqual([60, 80, 82.5, 85])
    expect(j.routineIds).toEqual(['r-push'])
    expect(j.name).toBe('Push A')
    expect(j.prs).toEqual(['0025'])
    // The watch's reading on the client's bench set lands on the trainer's set ticked at that time
    // (17:12, the first working set; not the warm-up).
    expect(j.entries[0].sets[1].hr).toEqual({ avg: 121, max: 134 })
    expect(j.entries[0].sets[0].hr).toBeUndefined()
    // The plank only the client logged is kept, with its heart rate, and counts in the volume.
    expect(j.entries[2].sets[0]).toMatchObject({ sec: 45, hr: { avg: 140, max: 151 } })
    expect(j.vol).toBe(4910)
    expect(j.note).toBe('Dobra technika na ławce')
    expect(j.gymMerge).toMatchObject({ id: 'M1', by: { name: 'Tomasz' }, from: 'tw-1764176580000' })
    // The trainer's workout is on record as removed after its last edit.
    expect(next.deleted.workouts['tw-1764176580000']).toBeGreaterThan(at(60))
    // Apple Health: the client's record keeps its id; the trainer's id is only ever "gone".
    const rec = healthRecords(next, { nameOf: e => e.id, speedUnit: 'kmh' }).sessions
    expect(rec.map(r => r.id)).toEqual(['opengym-w-cw-1764176400000'])
    expect(goneIds(next).has('opengym-w-tw-1764176580000')).toBe(true)
  })

  it('an empty watch workout (nothing ticked on the phone) gets the trainer\'s sets', () => {
    const { stored } = setup({ sets: false })
    const j = serverJoin(stored, at(65)).next.workouts[0]
    expect(j.entries.map(e => e.id)).toEqual(['0025', '0027'])
    expect(j.hr).toMatchObject({ src: 'ah' })
  })
})

describe('after the join, both devices sync again', () => {
  it('the phone and the trainer\'s copy both take the join, and stay the same through more pushes', () => {
    const { phone, coach, stored } = setup()
    const { next: server } = serverJoin(stored, at(65))
    // Each device had not pulled yet: its push is a 409, the app merges and pushes the result.
    const phone2 = mergeStates(phone, server)
    const coach2 = mergeStates(coach, server)
    for (const S of [phone2, coach2]) {
      expect(S.workouts.map(w => w.id)).toEqual(['cw-1764176400000'])
      expect(S.workouts[0].entries.map(e => e.id)).toEqual(['0025', '0027', '0463'])
      expect(S.workouts[0].hr).toMatchObject({ src: 'ah' })
    }
    // Pushed back through the server's stamping (as the app does: stamped), then pulled by the other.
    let srv = clone(server)
    for (const dev of [phone2, coach2]) {
      const n = clone(dev)
      stampPut(srv, n, { stamped: true, now: at(66) })
      srv = mergeStates(n, srv)
    }
    const a = mergeStates(phone2, srv), b = mergeStates(coach2, srv)
    const view = S => JSON.stringify(S.workouts)
    expect(view(a)).toBe(view(b))
    expect(view(a)).toBe(view(srv))
    expect(a.workouts.length).toBe(1)
    // The trainer correcting a weight on the joined workout later, on their phone: it is kept.
    const c3 = change(clone(b), s => { s.workouts[0].entries[1].sets[2].r = 10 }, at(90))
    const p3 = mergeStates(a, c3)
    expect(p3.workouts[0].entries[1].sets[2].r).toBe(10)
    expect(p3.workouts[0].hr).toMatchObject({ src: 'ah' })
  })

  it('the client\'s phone filling heart rate into its old copy before it pulled: the server joins again and wins', () => {
    const { phone, stored } = setup()
    const { next: server, trainer } = serverJoin(stored, at(65))
    // Before its next pull, the watch's rest heart rate after the bench set arrives (watch-sync
    // setHr, after the workout was saved) into the phone's own copy.
    const late = change(clone(phone), s => {
      const w = s.workouts[0]
      w.entries[0].sets[0] = { ...w.entries[0].sets[0], restHr: { avg: 112, max: 128 } }
      w._ts = at(70)   // patchSetIn stamps the workout (App.jsx patchSet -> stampWorkout)
    }, at(70))
    const merged = mergeStates(late, server)
    const base = merged.workouts.find(w => w.id === 'cw-1764176400000')
    // Field by field its later edit of the sets wins: the client's own sets came back over the join...
    expect(entriesCore(base.entries)).toBe(entriesCore(clientWorkout().entries))
    // ...which the server recognises (reconcile's "client-back") and joins again, later than it.
    const next = clone(merged)
    const t = Math.max(at(71), highestStamp(merged) + 1)
    expect(placeJoin(next, t, base.id, joinWorkouts(base, trainer, { id: 'M1', by: { id: 'TR1', name: 'Tomasz' }, at: t }), trainer)).toBe(true)
    const final = mergeStates(late, next)
    expect(final.workouts.map(w => w.id)).toEqual(['cw-1764176400000'])
    expect(final.workouts[0].entries.map(e => e.id)).toEqual(['0025', '0027', '0463'])
    expect(final.workouts[0].entries[0].sets[1]).toMatchObject({ w: 80, hr: { avg: 121, max: 134 }, restHr: { avg: 112, max: 128 } })   // the new reading kept
  })
})
