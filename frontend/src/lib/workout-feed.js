// Habcore Gym (kl14, local patch 0016): the workout feed ("Treningi"): cards newest first, grouped by
// week or month with each period's totals, filters (period, exercise, plan) and a search. Pure, so
// the client's app and the trainer's gym panel (a client's workouts from the server) share it.
import { sessionVolume, setsDone, workoutDay, workoutDuration } from './history.js'
import { isWarmupRow } from './workout-model.js'
import { weekKey, weekStartOf, todayISO, isoOf } from './format.js'
import { notesOf, notesText } from './workout-notes.js'

const list = v => (Array.isArray(v) ? v : [])
export const FEED_PAGE = 30
export const PERIODS = ['all', '7', '30', '90', '365']

/** Newest first: by day, then start. Workouts with no readable day are left out. */
export function feedSorted(workouts) {
  return list(workouts).filter(w => w && typeof w === 'object' && workoutDay(w))
    .map(w => [w, workoutDay(w)])
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : (Number(b[0].start) || 0) - (Number(a[0].start) || 0)))
    .map(x => x[0])
}

/** The filter as the feed's controls hold it: { period, ex, plan, q }. `nameOf(id)` names an exercise. */
export function feedFilter(workouts, { period = 'all', ex = '', plan = '', q = '' } = {}, { nameOf = id => id, today = todayISO() } = {}) {
  const days = Number(period)
  const from = days > 0 ? isoOf(new Date(new Date(today + 'T12:00:00').getTime() - (days - 1) * 86400000)) : ''
  const needle = String(q || '').trim().toLowerCase()
  return feedSorted(workouts).filter(w => {
    const d = workoutDay(w)
    if (from && d < from) return false
    if (ex && !list(w.entries).some(e => e?.id === ex)) return false
    if (plan && !(list(w.routineIds).includes(plan) || w.routineId === plan)) return false
    if (needle) {
      const hay = [w.name, ...list(w.entries).map(e => nameOf(e?.id) || ''), notesText(w)].join(' \n ').toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
}

/** Reps of the work sets done (both sides of a per-side set). */
export function repsDone(w) {
  let n = 0
  for (const e of list(w?.entries)) for (const s of list(e?.sets)) {
    if (isWarmupRow(s)) continue
    if (s?.sides && typeof s.sides === 'object') { for (const k of ['L', 'R']) if (s.sides[k]?.done) n += Number(s.sides[k].r) || 0 }
    else if (s?.done) n += Number(s.r) || 0
  }
  return n
}

/** Who led it: { kind: 'trainer' | 'group' | 'live' | 'joint', name } or null for one's own. */
export function ledOf(w) {
  const l = w?.led
  if (l && typeof l === 'object' && ['trainer', 'group', 'live', 'joint'].includes(l.kind)) return { kind: l.kind, name: String(l.name || '') }
  // From before kl14: a group workout carries its fixed name, a joined one its merge record.
  if (w?.name === 'Trening z trenerem' || w?.name === 'Workout with trainer') return { kind: 'group', name: '' }
  if (w?.gymMerge && typeof w.gymMerge === 'object') return { kind: 'joint', name: String(w.gymMerge.by?.name || '') }
  return null
}

/** What a card shows, in numbers. */
export function cardFacts(w, S) {
  const entries = list(w?.entries)
  const hr = w?.hr && typeof w.hr === 'object' ? Math.round(Number(w.hr.avg) || 0) : 0
  const kcal = Math.round(Number(w?.kcal ?? w?.calories) || 0)
  return {
    day: workoutDay(w),
    ms: workoutDuration(w),
    vol: sessionVolume(w, S),
    sets: Array.isArray(w?.entries) ? setsDone(w) : 0,
    reps: repsDone(w),
    exercises: entries.length,
    hr: hr > 0 ? hr : null,
    kcal: kcal > 0 ? kcal : null,
    prs: list(w?.prs).length,
    notes: notesOf(w).length,
    led: ledOf(w),
  }
}

/** The groups the feed shows: [{ key, from, to, items, n, ms, vol, sets }] by 'week' or 'month'. */
export function feedGroups(workouts, S, by = 'week') {
  const ws = weekStartOf(S)
  const out = []
  let cur = null
  for (const w of workouts) {
    const d = workoutDay(w)
    const key = by === 'month' ? d.slice(0, 7) : weekKey(d, ws)
    if (!cur || cur.key !== key) {
      const from = by === 'month' ? key + '-01' : key
      const to = by === 'month' ? isoOf(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)) : isoOf(new Date(new Date(key + 'T12:00:00').getTime() + 6 * 86400000))
      cur = { key, from, to, items: [], n: 0, ms: 0, vol: 0, sets: 0 }
      out.push(cur)
    }
    const f = cardFacts(w, S)
    cur.items.push(w); cur.n++; cur.ms += f.ms; cur.vol += f.vol; cur.sets += f.sets
  }
  return out
}

/** The same workout last time: the one before it with the same plan, else with the same name. */
export function previousSame(workouts, w) {
  const all = feedSorted(workouts)
  const i = all.findIndex(x => x === w || (x.id != null && x.id === w.id))
  const older = i >= 0 ? all.slice(i + 1) : all.filter(x => workoutDay(x) < workoutDay(w))
  const rid = list(w.routineIds)[0] ?? w.routineId ?? null
  if (rid) { const p = older.find(x => (list(x.routineIds)[0] ?? x.routineId ?? null) === rid); if (p) return p }
  const name = String(w.name || '').trim()
  return name ? older.find(x => String(x.name || '').trim() === name) || null : null
}

/** This workout against `prev`: totals' changes and, per exercise both did, the heaviest set. */
export function compareWorkouts(w, prev, S) {
  if (!prev) return null
  const a = cardFacts(w, S), b = cardFacts(prev, S)
  const top = e => Math.max(0, ...list(e?.sets).filter(s => s?.done && !isWarmupRow(s)).map(s => Number(s.w) || 0))
  const before = new Map(list(prev.entries).map(e => [e.id, top(e)]))
  const ex = list(w.entries).filter(e => before.has(e.id)).map(e => ({ id: e.id, now: top(e), was: before.get(e.id) }))
    .filter(x => x.now > 0 || x.was > 0)
  return {
    prev, day: b.day,
    vol: a.vol - b.vol, sets: a.sets - b.sets, reps: a.reps - b.reps, ms: a.ms - b.ms,
    up: ex.filter(x => x.now > x.was).length, down: ex.filter(x => x.now < x.was).length, ex,
  }
}

/** The exercises a card names: the first `n`, and how many more. */
export function topExercises(w, n = 3) {
  const ids = list(w?.entries).map(e => e?.id).filter(Boolean)
  return { ids: ids.slice(0, n), more: Math.max(0, ids.length - n) }
}

/** The exercises and plans a filter can pick from: what the workouts have, most used first. */
export function filterChoices(workouts) {
  const ex = new Map(), plan = new Map()
  for (const w of list(workouts)) {
    for (const e of list(w?.entries)) if (e?.id) ex.set(e.id, (ex.get(e.id) || 0) + 1)
    for (const r of new Set([...list(w?.routineIds), ...(w?.routineId ? [w.routineId] : [])])) plan.set(r, (plan.get(r) || 0) + 1)
  }
  const order = m => [...m].sort((a, b) => b[1] - a[1]).map(x => x[0])
  return { ex: order(ex), plan: order(plan) }
}
