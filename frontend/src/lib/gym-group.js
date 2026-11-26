// Group training (local patch 0006, Habcore Gym): one trainer runs the workouts of 2-5 gym clients
// at the same time, from their own account. Each client's workout is that client's running workout
// on the server's live channel (api/gymv2/live.js): the trainer's device names the client on every
// request (`as`), and the server checks for that client each time that the trainer may lead them.
// So nothing of one client's workout can land in another's account, and a client with the app sees
// their own workout live (gym-live.js picks it up on their phone).
//
// The trainer's device keeps, per client: the client's document (routines, history: for building an
// exercise the way the client's app would, with their last weights), the workout's element store
// (live-core.js) and the changes not sent yet. One long poll (GET /api/gymv2/group/poll) brings what
// the clients' phones (and their watches) change.
//
// The end, per client: their phone there (heard of in the last 90 s) -> it finishes and saves the
// workout (Apple Health there); no phone -> the trainer's device builds the finished workout as the
// app does and the server saves it into the client's account (POST /api/gymv2/group/save, in the
// client's change log under the trainer's name).
import * as core from '../../../api/gymv2/live-core.js'
import { ensureIds } from './gym-live.js'

export const GROUP_KEY = 'gymv2_group'
export const GROUP_MAX = 5
const CLIENT_AWAY_MS = 90 * 1000
const clone = v => JSON.parse(JSON.stringify(v))
const rnd = () => Math.random().toString(36).slice(2, 10)
const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * deps: request(method, path, body, opts) -> JSON (throws { status, data });
 *       storage (localStorage-like); now(); build: { entry(doc, exId), finished(A, end) -> workout,
 *       header(doc, name) -> workout header fields }
 */
export function createGroup({ request, storage = null, now = () => Date.now(), build }) {
  const subs = new Set()
  let dev = null
  try { dev = storage?.getItem('gym_live_dev') } catch { dev = null }
  if (!dev || !/^[A-Za-z0-9_-]{4,40}$/.test(dev)) { dev = 'd' + rnd() + rnd(); try { storage?.setItem('gym_live_dev', dev) } catch { /* in memory */ } }
  const g = { members: [], offset: 0, running: false, polling: null, lastAnswerAt: 0 }
  const emit = () => { for (const f of subs) { try { f() } catch { /* a view */ } } }
  let lastT = 0
  const serverNow = () => (lastT = Math.max(Math.round(now() + g.offset), lastT + 1))
  const learn = (a, t0) => { if (a && Number.isFinite(a.now)) g.offset = a.now - (t0 + now()) / 2; g.lastAnswerAt = now() }
  const save = () => { try { storage?.setItem(GROUP_KEY, JSON.stringify({ at: now(), members: g.members.filter(m => !m.ended).map(m => ({ id: m.id, name: m.name, wid: m.wid })) })) } catch { /* resumable only */ } }
  const byId = id => g.members.find(m => m.id === id) || null

  /** The workout of member `m` as the app's workout object. */
  const workoutOf = m => (m.el ? core.render(m.el, m.wid, m.local) : null)

  function take(m, l) {
    if (!l || l.wid !== m.wid) return
    if (l.el) { const el = clone(l.el); core.applyOps(el, m.pending); m.el = el }
    else if (Array.isArray(l.ops)) core.applyOps(m.el, l.ops)
    if (Number.isInteger(l.seq)) m.seq = l.seq
    if (l.peers) m.peers = l.peers
    if (l.finishReq) m.finishReq = l.finishReq
    if (l.ended) { m.ended = l.ended; save() }
  }

  async function flush(m) {
    if (m.inflight || !m.pending.length || m.ended) return m.inflight
    const batch = m.pending.slice()
    const t0 = now()
    m.inflight = (async () => {
      try {
        const r = await request('POST', '/api/live/ops', { as: m.id, wid: m.wid, ops: batch, dev, since: m.seq })
        learn(r, t0)
        m.pending = m.pending.slice(batch.length)
        m.error = null
        take(m, r.live)
      } catch (e) {
        if (e?.status === 409 && e?.data?.code === 'ended') { m.pending = []; m.ended = e.data.live?.ended || { how: 'saved' } }
        else if (e?.status === 403) { m.error = 'forbidden'; m.pending = [] }
        else { m.error = 'offline'; setTimeout(() => flush(m), 2000) }
      } finally { m.inflight = null; emit() }
      if (m.pending.length && !m.error) flush(m)
    })()
    return m.inflight
  }

  /** Changes member `id`'s workout: `fn(A, doc)` on a copy; the difference goes out as ops. */
  function change(id, fn) {
    const m = byId(id)
    if (!m || !m.el || m.ended) return false
    const A = workoutOf(m)
    const next = clone(A)
    fn(next, m.doc)
    ensureIds(next)
    m.local = { cur: next.cur }
    const ops = core.diffFlat(core.flatten(A), core.flatten(next), serverNow(), dev)
    if (!ops.length) { emit(); return false }
    core.applyOps(m.el, ops)
    m.pending.push(...ops)
    emit()
    flush(m)
    return true
  }

  /** Starts (or joins) a workout for each client: [{ id, name }]. */
  async function start(clients) {
    const list = clients.slice(0, GROUP_MAX)
    for (const c of list) {
      if (byId(c.id)) continue
      const m = { id: c.id, name: c.name, doc: {}, wid: null, el: null, seq: -1, pending: [], peers: null, ended: null, local: { cur: 0 }, rest: null, inflight: null, error: null }
      g.members.push(m)
      const t0 = now()
      const r = await request('GET', '/api/gymv2/group/client?id=' + encodeURIComponent(c.id))
      learn(r, t0)
      m.doc = r.state || {}
      const cur = await request('GET', `/api/live?as=${encodeURIComponent(c.id)}&dev=${dev}`)
      const l = cur.live
      if (l && !l.ended && l.el) {
        // The client already trains (started on their phone, or a previous group): that workout.
        m.wid = l.wid; m.el = clone(l.el); m.seq = l.seq; m.peers = l.peers || null
      } else {
        const A = { id: 'g' + now().toString(36) + rnd().slice(0, 4), ...build.header(m.doc), entries: [], cur: 0 }
        ensureIds(A)
        m.wid = A.id; m.el = {}
        const ops = core.diffFlat({}, core.flatten(A), serverNow(), dev)
        core.applyOps(m.el, ops)
        m.pending = ops
        await flush(m)
      }
    }
    save(); emit(); loop()
    return g.members
  }

  /** The same exercise for several members, each built from their own history (their weights). */
  function addExercise(exId, ids) {
    for (const id of ids) {
      change(id, (A, doc) => {
        const e = build.entry(doc, exId)
        A.entries.push(e)
        A.cur = A.entries.length - 1
      })
    }
  }

  /** The weight a member did last time on exercise `exId` ({ w, r, d } or null): a hint. */
  function lastOf(id, exId) {
    const m = byId(id)
    const ws = Array.isArray(m?.doc?.workouts) ? m.doc.workouts : []
    for (let i = ws.length - 1; i >= 0; i--) {
      const e = (ws[i]?.entries || []).find(x => x && x.id === exId)
      const done = (e?.sets || []).filter(s => s && s.done && s.w != null)
      if (done.length) { const top = done.reduce((a, b) => (Number(b.w) > Number(a.w) ? b : a)); return { w: top.w, r: top.r, d: ws[i].d } }
    }
    return null
  }

  const clientHere = m => !!(m?.peers?.clientAt && now() + g.offset - m.peers.clientAt < CLIENT_AWAY_MS && now() - g.lastAnswerAt < CLIENT_AWAY_MS)

  /** Ends member `id`'s workout: their phone saves it when it is there, else the server does. */
  async function finish(id) {
    const m = byId(id)
    if (!m || m.ended) return null
    if (m.inflight) { try { await m.inflight } catch { /* sent again below */ } }
    if (m.pending.length) await flush(m)
    if (clientHere(m)) {
      await request('POST', '/api/live/end', { as: m.id, wid: m.wid, how: 'finish-request', dev })
      m.finishing = true
      emit()
      return 'phone'
    }
    const A = workoutOf(m)
    // Nothing done at all: nothing to save (the app's own Discard), the channel ends.
    if (!A.entries.some(e => (e.sets || []).some(x => x && x.done))) {
      await request('POST', '/api/live/end', { as: m.id, wid: m.wid, how: 'discarded', dev }).catch(() => {})
      m.ended = { how: 'discarded', at: now(), by: 'trainer' }
      save(); emit()
      return 'discarded'
    }
    const w = build.finished(A, now())
    await request('POST', '/api/gymv2/group/save', { id: m.id, workout: w })
    await request('POST', '/api/live/end', { as: m.id, wid: m.wid, how: 'saved', dev }).catch(() => {})
    m.ended = { how: 'saved', at: now(), by: 'trainer' }
    save(); emit()
    return 'server'
  }
  async function finishAll() { const out = {}; for (const m of g.members) if (!m.ended) out[m.id] = await finish(m.id); return out }
  /** Leaves member `id` out of the group on this device (their workout goes on). */
  function drop(id) { g.members = g.members.filter(m => m.id !== id); save(); emit() }

  /* the one long poll for everyone */
  async function loop() {
    if (g.running) return
    g.running = true
    let wait = 1000
    while (g.running) {
      const live = g.members.filter(m => !m.ended && m.wid)
      if (!live.length) { g.running = false; break }
      const c = live.map(m => `${m.id}:${m.wid}:${m.seq}`).join(',')
      try {
        const t0 = now()
        const r = await request('GET', `/api/gymv2/group/poll?c=${encodeURIComponent(c)}&wait=25&dev=${dev}`, null, { timeout: 40000 })
        learn(r, t0)
        for (const m of live) take(m, r.answers?.[m.id]?.live)
        wait = 1000
        emit()
      } catch (e) {
        if (e?.status === 403) { g.running = false; emit(); break }
        await sleep(wait); wait = Math.min(15000, wait * 2)
      }
    }
  }
  function stop() { g.running = false }

  /** Rest for a member: until when (ms), shown on their tab. */
  function rest(id, sec) { const m = byId(id); if (m) { m.rest = sec > 0 ? { until: now() + sec * 1000, sec } : null; emit() } }

  return {
    start, change, addExercise, lastOf, finish, finishAll, drop, rest, stop, loop, workoutOf, clientHere,
    subscribe: f => { subs.add(f); return () => subs.delete(f) },
    get members() { return g.members }, get dev() { return dev },
  }
}

/** A group this device was running (to come back to it), or null. */
export function savedGroup(storage) {
  try {
    const v = JSON.parse(storage?.getItem(GROUP_KEY) || 'null')
    if (!v || !Array.isArray(v.members) || !v.members.length || Date.now() - v.at > 6 * 3600e3) return null
    return v
  } catch { return null }
}
