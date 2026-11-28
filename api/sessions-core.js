// Habcore Gym (kl16, local patch 0018): sessions a trainer plans for a client at a time of day.
//
// HAND-COPIED, byte for byte, to api/sessions-core.js (the api image has no frontend/): the store,
// the sync merge, the gym panel's routes, the reminder tick and the calendar feed all read the same
// rules. api/test/sessions-core.test.js checks the two files are the same.
//
// S.sessions = [{
//   id,                 one occurrence (the calendar's UID is made from it)
//   sid,                the series it belongs to (repeat), absent for a one-off
//   d: 'YYYY-MM-DD', t: 'HH:MM', dur: minutes, tz: 'Europe/Warsaw'   the wall clock where the gym is
//   rid, rname,         a plan (routine) of the client, and its name when it was planned
//   note,               the trainer's note for the client
//   tr: { id, name },   the trainer who leads it
//   by: { id, name, role }, at, mod, seq,   who planned it, when, last change, change count
//   cx,                 cancelled at (ms): kept as a tombstone so every copy learns of it
//   rep: { days, weeks | until }   how the series was made (shown, never re-expanded)
// }]
// Copies merge per occurrence: the one changed last (`mod`, then `seq`) wins. Nothing is ever
// removed by hand, only cancelled; old entries fall out by date (pruneSessions), the same on every
// copy, so they converge.

export const SESS_TZ = 'Europe/Warsaw'
export const SESS_LOCATION = 'Habcore, ul. Mickiewicza 25J, 42-360 Poraj'
export const SESS_DUR = 60
export const SESS_MAX = 600
export const SESS_KEEP_DAYS = 120       // past occurrences kept (history, the trainer's look back)
export const SESS_CANCEL_KEEP_DAYS = 30 // a cancelled one, after its cancellation
export const SERIES_MAX = 120           // occurrences one repeat may make
export const SERIES_MAX_WEEKS = 52
export const REMIND_DEFAULT = 60        // minutes before (Settings → Reminders)
export const REMIND_CHOICES = [0, 15, 30, 60, 120, 180, 1440]

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '')
const ISO = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export const validDay = d => typeof d === 'string' && ISO.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'))
export const validTime = t => typeof t === 'string' && HHMM.test(t)

/** Minutes the zone is ahead of UTC at instant `ms`. */
export function tzOffsetMin(ms, tz = SESS_TZ) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))
    const g = k => Number(p.find(x => x.type === k)?.value)
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
  } catch { return 0 }
}
/** The instant of wall time `d` `t` in `tz`. A time the clock skips (spring forward) is read after the jump. */
export function wallToUtc(d, t, tz = SESS_TZ) {
  if (!validDay(d) || !validTime(t)) return NaN
  const [y, m, day] = d.split('-').map(Number)
  const [hh, mm] = t.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, day, hh, mm)
  let ms = naive - tzOffsetMin(naive, tz) * 60000
  // The offset at the first guess; in the hour the clock skips this lands after the jump
  // (02:30 on the last Sunday of March reads 03:30), in the hour it repeats on the later one.
  return naive - tzOffsetMin(ms, tz) * 60000
}
/** { d, t } of instant `ms` on the wall clock of `tz`. */
export function utcToWall(ms, tz = SESS_TZ) {
  const w = new Date(ms + tzOffsetMin(ms, tz) * 60000)
  return { d: w.toISOString().slice(0, 10), t: w.toISOString().slice(11, 16) }
}
export const sessionStart = s => wallToUtc(s?.d, s?.t, s?.tz || SESS_TZ)
export const sessionEnd = s => sessionStart(s) + (Number(s?.dur) || SESS_DUR) * 60000
export const isLive = s => !!s && !s.cx
export const addDays = (iso, n) => { const x = new Date(iso + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const weekdayOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay()
export const hhmmPlus = (t, min) => { const [h, m] = t.split(':').map(Number); const x = ((h * 60 + m + min) % 1440 + 1440) % 1440; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0') }

const who = v => (isMap(v) && typeof v.id === 'string' && v.id ? { id: v.id.slice(0, 80), name: str(v.name, 60), ...(v.role ? { role: str(v.role, 20) } : {}) } : null)
/** A stored or sent occurrence made safe, or null. */
export function cleanSession(x) {
  if (!isMap(x) || typeof x.id !== 'string' || !x.id || x.id.length > 80) return null
  if (!validDay(x.d) || !validTime(x.t)) return null
  const dur = Math.round(Number(x.dur))
  const out = { id: x.id, d: x.d, t: x.t, dur: dur >= 5 && dur <= 720 ? dur : SESS_DUR, tz: typeof x.tz === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(x.tz) ? x.tz.slice(0, 60) : SESS_TZ }
  if (typeof x.sid === 'string' && x.sid) out.sid = x.sid.slice(0, 80)
  if (typeof x.rid === 'string' && x.rid) out.rid = x.rid.slice(0, 80)
  if (str(x.rname, 80)) out.rname = str(x.rname, 80)
  if (str(x.note, 1000).trim()) out.note = str(x.note, 1000)
  const tr = who(x.tr); if (tr) out.tr = { id: tr.id, name: tr.name }
  const by = who(x.by); if (by) out.by = by
  out.at = Number(x.at) || 0
  out.mod = Number(x.mod) || out.at
  out.seq = Math.max(0, Math.floor(Number(x.seq) || 0))
  if (Number(x.cx) > 0) out.cx = Number(x.cx)
  if (isMap(x.rep)) {
    const days = Array.isArray(x.rep.days) ? [...new Set(x.rep.days.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : []
    out.rep = { days, ...(Number(x.rep.weeks) > 0 ? { weeks: Math.min(SERIES_MAX_WEEKS, Math.floor(Number(x.rep.weeks))) } : {}), ...(validDay(x.rep.until) ? { until: x.rep.until } : {}) }
  }
  return out
}
export const sessionsOf = S => (Array.isArray(S?.sessions) ? S.sessions : []).map(cleanSession).filter(Boolean)

const newer = (a, b) => ((Number(a.mod) || 0) - (Number(b.mod) || 0)) || ((Number(a.seq) || 0) - (Number(b.seq) || 0))
/** Both copies' occurrences, each the version changed last. Ordered by start. */
export function mergeSessions(a, b) {
  const by = new Map()
  for (const x of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const s = cleanSession(x); if (!s) continue
    const had = by.get(s.id)
    if (!had || newer(s, had) > 0) by.set(s.id, s)
  }
  return sortSessions([...by.values()])
}
export const sortSessions = list => list.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.t < y.t ? -1 : x.t > y.t ? 1 : String(x.id) < String(y.id) ? -1 : 1))
/** Drops what is old enough to forget, the same way on every copy. `today` is a date. */
export function pruneSessions(list, today, now = Date.now()) {
  const keep = addDays(today, -SESS_KEEP_DAYS)
  const out = (Array.isArray(list) ? list : []).filter(s => s && s.d >= keep && !(s.cx && s.cx < now - SESS_CANCEL_KEEP_DAYS * 86400000))
  return out.length > SESS_MAX ? out.slice(out.length - SESS_MAX) : out
}

/** The dates a repeat makes: from `d` on, the weekdays `days` (0 = Sunday), for `weeks` weeks or until `until`. */
export function seriesDates({ d, days, weeks, until }) {
  if (!validDay(d)) return []
  const set = new Set((Array.isArray(days) && days.length ? days : [weekdayOf(d)]).map(Number))
  const last = validDay(until) ? until : addDays(d, Math.max(1, Math.min(SERIES_MAX_WEEKS, Math.floor(Number(weeks) || 1))) * 7 - 1)
  const out = []
  for (let iso = d; iso <= last && out.length < SERIES_MAX; iso = addDays(iso, 1)) if (set.has(weekdayOf(iso))) out.push(iso)
  return out
}

let seqNo = 0
export const newSessionId = (now = Date.now()) => 's' + now.toString(36) + (++seqNo % 1296).toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 7)
const FIELDS = ['t', 'dur', 'rid', 'rname', 'note', 'tr']
function patchOf(f) {
  const p = {}
  if (validTime(f.t)) p.t = f.t
  if (Number(f.dur) >= 5 && Number(f.dur) <= 720) p.dur = Math.round(Number(f.dur))
  if ('rid' in f) p.rid = typeof f.rid === 'string' ? f.rid.slice(0, 80) : ''
  if ('rname' in f) p.rname = str(f.rname, 80)
  if ('note' in f) p.note = str(f.note, 1000)
  if ('tr' in f) p.tr = who(f.tr)
  return p
}
function put(s, p) {
  for (const k of FIELDS) {
    if (!(k in p)) continue
    if (p[k] === '' || p[k] == null) delete s[k]; else s[k] = p[k]
  }
}
/**
 * One change to a client's list, by `by` ({ id, name, role }). `op`:
 *   { op: 'add', d, t, dur, rid, rname, note, tr, rep?: { days, weeks | until } }
 *   { op: 'edit', id, scope: 'one' | 'series', d? (one only), t, dur, rid, rname, note, tr }
 *   { op: 'cancel', id, scope: 'one' | 'series' }
 * 'series' means this occurrence and the ones after it. Returns { list, changed: [occurrences] }
 * or { error }.
 */
export function applySessionOp(list0, op, by, now = Date.now()) {
  const list = (Array.isArray(list0) ? list0 : []).map(cleanSession).filter(Boolean)
  const kind = op?.op
  if (kind === 'add') {
    if (!validDay(op.d)) return { error: 'bad-day' }
    if (!validTime(op.t)) return { error: 'bad-time' }
    const rep = isMap(op.rep) ? op.rep : null
    const dates = rep ? seriesDates({ d: op.d, days: rep.days, weeks: rep.weeks, until: rep.until }) : [op.d]
    if (!dates.length) return { error: 'no-dates' }
    const sid = dates.length > 1 ? 'r' + newSessionId(now) : ''
    const base = { t: op.t, dur: SESS_DUR, tz: SESS_TZ, ...patchOf(op) }
    const changed = []
    for (const d of dates) {
      const s = cleanSession({ ...base, id: newSessionId(now), d, by, at: now, mod: now, seq: 0, ...(sid ? { sid, rep: { days: rep.days, ...(rep.until ? { until: rep.until } : { weeks: rep.weeks }) } } : {}) })
      if (s) { put(s, patchOf(op)); list.push(s); changed.push(s) }
    }
    return { list: sortSessions(list), changed }
  }
  const one = list.find(s => s.id === op?.id)
  if (!one) return { error: 'no-session' }
  const targets = op.scope === 'series' && one.sid
    ? list.filter(s => s.sid === one.sid && !s.cx && (s.d > one.d || (s.d === one.d && s.t >= one.t) || s.id === one.id))
    : [one]
  if (kind === 'cancel') {
    for (const s of targets) { if (!s.cx) { s.cx = now; s.mod = now; s.seq++ } }
    return { list: sortSessions(list), changed: targets }
  }
  if (kind === 'edit') {
    if (one.cx) return { error: 'cancelled' }
    if ('t' in op && !validTime(op.t)) return { error: 'bad-time' }
    const p = patchOf(op)
    const moveDay = op.scope !== 'series' && validDay(op.d) && op.d !== one.d ? op.d : null
    const changed = []
    for (const s of targets) {
      const before = JSON.stringify(s)
      put(s, p)
      if (moveDay && s === one) { s.d = moveDay; delete s.sid; delete s.rep }
      if (JSON.stringify(s) !== before) { s.mod = now; s.seq++; changed.push(s) }
    }
    return { list: sortSessions(list), changed }
  }
  return { error: 'bad-op' }
}

/** The occurrences that overlap `s` in time (cancelled ones and `s` itself aside). */
export function overlapping(list, s) {
  const a = sessionStart(s), b = sessionEnd(s)
  if (!Number.isFinite(a)) return []
  return (Array.isArray(list) ? list : []).filter(x => x && x.id !== s.id && isLive(x) && sessionStart(x) < b && sessionEnd(x) > a)
}
export const liveOn = (list, iso) => (Array.isArray(list) ? list : []).filter(s => isLive(s) && s.d === iso)
/** The next occurrences not yet over, soonest first. */
export function upcoming(list, now = Date.now(), n = 10) {
  return (Array.isArray(list) ? list : []).filter(s => isLive(s) && sessionEnd(s) > now).sort((x, y) => sessionStart(x) - sessionStart(y)).slice(0, n)
}
/** What changed between two copies of a client's list: [{ s, kind: 'added' | 'changed' | 'cancelled' }]. */
export function sessionChanges(cur, next) {
  const old = new Map((Array.isArray(cur) ? cur : []).filter(s => s && s.id).map(s => [s.id, s]))
  const out = []
  for (const s of Array.isArray(next) ? next : []) {
    if (!s || !s.id) continue
    const o = old.get(s.id)
    if (!o) { if (!s.cx) out.push({ s, kind: 'added' }); continue }
    if ((Number(s.seq) || 0) <= (Number(o.seq) || 0) && (Number(s.mod) || 0) <= (Number(o.mod) || 0)) continue
    if (s.cx && !o.cx) out.push({ s, kind: 'cancelled' })
    else if (!s.cx && JSON.stringify([s.d, s.t, s.dur, s.rid || '', s.note || '', s.tr?.id || '']) !== JSON.stringify([o.d, o.t, o.dur, o.rid || '', o.note || '', o.tr?.id || ''])) out.push({ s, kind: 'changed' })
  }
  return out
}
/** Minutes before a session the reminder goes out (0: off). */
export function remindBefore(S) {
  const v = S?.reminder?.sessBefore
  return v === 0 || v === '0' ? 0 : REMIND_CHOICES.includes(Number(v)) ? Number(v) : REMIND_DEFAULT
}
/** The first word of a name: the trainer's feed names a client by it. */
export const firstName = n => String(n || '').trim().split(/\s+/)[0].slice(0, 30) || '?'

/** Habcore Gym (kl17): the days with a session a trainer planned (not cancelled), for the calendars'
    hollow dot: a planned workout, not a day off. Map iso -> [sessions]. */
export const plannedSessionDays = S => {
  const m = new Map()
  for (const s of sessionsOf(S)) { if (s.cx) continue; if (!m.has(s.d)) m.set(s.d, []); m.get(s.d).push(s) }
  return m
}
