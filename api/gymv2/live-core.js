// Live joint training (local patch 0006, Habcore Gym): the merge core, shared by the server
// (api/gymv2/live.js) and the app (frontend/src/lib/gym-live.js). Pure: no I/O, no clock.
//
// A running workout (the app's `S.active`) is cut into elements, each with fields:
//   'h'          the header: name, start, d, routineIds, bw, gym, circuits ... (every field of the
//                workout except `entries`, its id and the device-only ones in LOCAL_FIELDS);
//   'e:<lid>'    one exercise of the workout (an entry): every field of it except `sets`, plus
//                `_p` (its place in the workout). `lid` is the entry's live id (ensureLids);
//   's:<sid>'    one set (a row of an entry): every field of it, plus `_e` (the lid of its entry)
//                and `_p` (its place in that entry). `sid` is the set id the watch sync already
//                gives every row (lib/watch-sync.js ensureSetIds).
//
// Every device keeps the same element store `el`: { key: { f: { field: stamp }, x: stamp|null } },
// where a field's stamp is { v, t, d } (value, time, device) or { u: 1, t, d } (field removed),
// and `x` is the element's removal stamp. A change is an op: { k, f, v | u, t, d } for a field,
// { k, x: 1, t, d } for a removal. The same ops, applied in ANY order, give the same store:
//
//   1. Per field, the op with the later stamp wins: a later time `t`, and on the same time the
//      larger device id `d` (string order). An op that loses changes nothing, so an op arriving
//      twice, late, or out of order is harmless.
//   2. An element is there unless it was removed after its newest field stamp: a removal beats
//      every change made before it; a change made after a removal brings the element back (with
//      all its fields), so nothing a person logged after someone else removed the row is lost.
//   3. Order: exercises by (`_p`, key), sets by (`_p`, key) inside their exercise. Two devices
//      inserting at the same place at once both keep their row; the key decides which comes first.
//   4. A set whose exercise is gone (or not there yet) is not shown; it comes back with it.
//
// Times `t` are the server's clock: every device adds the offset it learnt from the server's
// answers (gym-live.js), and the server clamps a stamp from the future to its own now.
export const LIVE_V = 1
export const LOCAL_FIELDS = new Set(['cur', 'workoutView', 'collapseCompleted', 'editingWorkoutId', 'backfill', 'reopenedAt'])
const KEY_RE = /^(h|e:[A-Za-z0-9_-]{1,40}|s:[A-Za-z0-9_-]{1,40})$/
const FIELD_RE = /^[A-Za-z_$][A-Za-z0-9_$-]{0,39}$/
const BAD_FIELDS = new Set(['__proto__', 'constructor', 'prototype'])
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/

export const keyOk = k => typeof k === 'string' && KEY_RE.test(k)
export const fieldOk = f => typeof f === 'string' && FIELD_RE.test(f) && !BAD_FIELDS.has(f)
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

/** JSON with the keys of every object sorted: two equal values give the same text. */
export function stable(v) {
  if (v === undefined) return 'undefined'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : stable(x))).join(',') + ']'
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
}
const copy = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))

/** Whether stamp `a` beats stamp `b` (rule 1). */
export function newer(a, b) {
  if (!b) return true
  if (!a) return false
  if (a.t !== b.t) return a.t > b.t
  return String(a.d || '') > String(b.d || '')
}

let lidN = 0
const newLid = () => 'e' + Math.floor(Math.random() * 2176782336).toString(36).padStart(6, '0') + (++lidN).toString(36)
/** Gives every entry of the running workout `A` (a draft) a live id; a copied one a new one. */
export function ensureLids(A) {
  if (!A || !Array.isArray(A.entries)) return false
  const seen = new Set()
  let changed = false
  for (const e of A.entries) {
    if (!isMap(e)) continue
    if (typeof e.lid !== 'string' || !ID_RE.test(e.lid) || seen.has(e.lid)) { e.lid = newLid(); changed = true }
    seen.add(e.lid)
  }
  return changed
}
/** Whether some entry or set of `A` still needs its id (lid / sid). */
export function needsIds(A) {
  if (!A || !Array.isArray(A.entries)) return false
  const le = new Set(), ls = new Set()
  for (const e of A.entries) {
    if (!isMap(e)) continue
    if (typeof e.lid !== 'string' || !ID_RE.test(e.lid) || le.has(e.lid)) return true
    le.add(e.lid)
    for (const s of Array.isArray(e.sets) ? e.sets : []) {
      if (!isMap(s)) continue
      if (typeof s.sid !== 'string' || !ID_RE.test(s.sid) || ls.has(s.sid)) return true
      ls.add(s.sid)
    }
  }
  return false
}

/**
 * The elements of running workout `A`: { key: { field: value } }. Entries or sets without a usable
 * id are left out (the app gives them one first). Values are deep copies.
 */
export function flatten(A) {
  const out = {}
  if (!isMap(A)) return out
  const h = {}
  for (const k of Object.keys(A)) {
    if (k === 'entries' || k === 'id' || LOCAL_FIELDS.has(k) || !fieldOk(k) || A[k] === undefined) continue
    h[k] = copy(A[k])
  }
  out.h = h
  const entries = Array.isArray(A.entries) ? A.entries : []
  let ep = 0
  for (const e of entries) {
    if (!isMap(e) || typeof e.lid !== 'string' || !ID_RE.test(e.lid) || out['e:' + e.lid]) continue
    const f = { _p: ep++ }
    for (const k of Object.keys(e)) if (k !== 'sets' && k !== 'lid' && fieldOk(k) && e[k] !== undefined) f[k] = copy(e[k])
    out['e:' + e.lid] = f
    let sp = 0
    for (const s of Array.isArray(e.sets) ? e.sets : []) {
      if (!isMap(s) || typeof s.sid !== 'string' || !ID_RE.test(s.sid) || out['s:' + s.sid]) continue
      const g = { _e: e.lid, _p: sp++ }
      for (const k of Object.keys(s)) if (k !== 'sid' && fieldOk(k) && s[k] !== undefined) g[k] = copy(s[k])
      out['s:' + s.sid] = g
    }
  }
  return out
}

/** The ops that turn elements `prev` into `next` (both from flatten), stamped { t, d }. */
export function diffFlat(prev, next, t, d) {
  const ops = []
  prev = prev || {}; next = next || {}
  for (const k of Object.keys(next)) {
    const a = own(prev, k) ? prev[k] : null, b = next[k]
    for (const f of Object.keys(b)) {
      if (a && own(a, f) && stable(a[f]) === stable(b[f])) continue
      ops.push({ k, f, v: copy(b[f]), t, d })
    }
    if (a) for (const f of Object.keys(a)) if (!own(b, f)) ops.push({ k, f, u: 1, t, d })
  }
  for (const k of Object.keys(prev)) if (!own(next, k)) ops.push({ k, x: 1, t, d })
  return ops
}

/** Whether `op` is well formed (the server refuses a request with any op that is not). */
export function opOk(op) {
  if (!isMap(op) || !keyOk(op.k) || !Number.isFinite(op.t) || op.t < 0) return false
  if (typeof op.d !== 'string' || !ID_RE.test(op.d)) return false
  if (op.x === 1) return op.f === undefined
  if (!fieldOk(op.f)) return false
  if (op.u === 1) return !own(op, 'v') || op.v === undefined
  return own(op, 'v')
}

/** Applies `ops` to element store `el` in place (rules 1, 2). Returns the keys that changed. */
export function applyOps(el, ops) {
  const changed = new Set()
  for (const op of ops || []) {
    if (!opOk(op)) continue
    const st = { t: op.t, d: op.d }
    let e = own(el, op.k) ? el[op.k] : null
    if (!e) { e = { f: {}, x: null }; el[op.k] = e }
    if (op.x === 1) {
      if (newer(st, e.x)) { e.x = st; changed.add(op.k) }
      continue
    }
    const cur = own(e.f, op.f) ? e.f[op.f] : null
    if (!newer(st, cur)) continue
    e.f[op.f] = op.u === 1 ? { u: 1, t: op.t, d: op.d } : { v: copy(op.v), t: op.t, d: op.d }
    changed.add(op.k)
  }
  return [...changed]
}

/** The newest field stamp of element `e`, or null. */
function topStamp(e) {
  let top = null
  for (const f of Object.keys(e.f || {})) if (newer(e.f[f], top)) top = e.f[f]
  return top
}
/** Whether element `e` is there (rule 2). */
export function alive(e) {
  if (!e) return false
  const top = topStamp(e)
  if (!top) return false
  return !e.x || newer(top, e.x)
}
const valuesOf = e => {
  const o = {}
  for (const f of Object.keys(e.f || {})) { const s = e.f[f]; if (s && !s.u && s.v !== undefined) o[f] = copy(s.v) }
  return o
}
const byPlace = (a, b) => {
  const pa = Number.isFinite(a[1]._p) ? a[1]._p : 1e9, pb = Number.isFinite(b[1]._p) ? b[1]._p : 1e9
  return pa !== pb ? pa - pb : (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
}

/**
 * The running workout `el` stands for (rules 2-4), with id `wid`. `local` (this device's copy, or
 * null) gives the device-only fields (LOCAL_FIELDS); its current exercise (`cur`) follows that
 * exercise by its lid wherever it moved.
 */
export function render(el, wid, local = null) {
  const A = {}
  const h = el.h && alive(el.h) ? valuesOf(el.h) : {}
  for (const k of Object.keys(h)) if (fieldOk(k) && !LOCAL_FIELDS.has(k)) A[k] = h[k]
  A.id = wid
  const ents = [], sets = new Map()
  for (const k of Object.keys(el)) {
    if (!alive(el[k])) continue
    if (k.startsWith('e:')) ents.push([k, valuesOf(el[k])])
    else if (k.startsWith('s:')) {
      const v = valuesOf(el[k])
      if (typeof v._e !== 'string') continue
      if (!sets.has(v._e)) sets.set(v._e, [])
      sets.get(v._e).push([k, v])
    }
  }
  ents.sort(byPlace)
  A.entries = ents.map(([k, v]) => {
    const lid = k.slice(2)
    const { _p, ...rest } = v
    const rows = (sets.get(lid) || []).sort(byPlace).map(([sk, sv]) => { const { _e, _p: _q, ...r } = sv; return { ...r, sid: sk.slice(2) } })
    return { ...rest, lid, sets: rows }
  })
  if (local && isMap(local)) {
    for (const k of LOCAL_FIELDS) if (local[k] !== undefined) A[k] = copy(local[k])
    if (Number.isInteger(local.cur)) {
      const lid = Array.isArray(local.entries) ? local.entries[local.cur]?.lid : null
      const at = lid ? A.entries.findIndex(e => e.lid === lid) : -1
      A.cur = at >= 0 ? at : Math.max(0, Math.min(local.cur, A.entries.length - 1))
    }
  }
  if (!Number.isInteger(A.cur)) A.cur = 0
  return A
}

/** The elements as values, as flatten() would give them for render(el). */
export const flatOf = (el, wid) => flatten(render(el, wid))

/** Ops that bring every element and field of `el` across: a whole store as ops (a first upload). */
export function opsOf(el) {
  const ops = []
  for (const k of Object.keys(el)) {
    const e = el[k]
    for (const f of Object.keys(e.f || {})) {
      const s = e.f[f]
      ops.push(s.u ? { k, f, u: 1, t: s.t, d: s.d } : { k, f, v: copy(s.v), t: s.t, d: s.d })
    }
    if (e.x) ops.push({ k, x: 1, t: e.x.t, d: e.x.d })
  }
  return ops
}

/** What a trainer's list shows about a running workout: name, exercises, sets done of all. */
export function summaryOf(el, wid) {
  const A = render(el, wid)
  let done = 0, total = 0
  for (const e of A.entries) for (const s of e.sets || []) { total++; if (s && s.done) done++ }
  return { name: String(A.name || '').slice(0, 60), start: Number(A.start) || null, exercises: A.entries.length, setsDone: done, setsTotal: total }
}
