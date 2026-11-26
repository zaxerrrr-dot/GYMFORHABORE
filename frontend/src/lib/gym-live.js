// Live joint training (local patch 0006, Habcore Gym): the running workout of a gym client is shared
// in real time between the client's phone (and from there the Apple Watch, through the existing
// watch sync) and a trainer leading the client ("Prowadź jako klient", web or app).
//
// How a device takes part (all of it only for a gym client's own account, or a trainer leading one,
// and only when the server has GYM_LIVE on: /api/config gymv2.live):
//   - A workout running here (S.active) is cut into elements (api/gymv2/live-core.js): every change
//     made here, by hand, by the watch or by anything else in the app, goes through useStore.update,
//     and is found by comparing the workout with the last copy this device shared (diffFlat). The
//     changes go to the server as ops (POST /api/live/ops), stamped with the server's clock.
//   - What other devices changed comes back as ops (Server-Sent Events in a browser; a long poll in
//     the phone app, where a request carries the pairing token; a short poll when neither works)
//     and is merged by the same rules everywhere (live-core.js), then written into S.active here.
//   - A device with no workout running picks up the account's live one (a trainer who joins, the
//     client's phone when the trainer started it).
//   - The end: the client's Finish saves it on the client's device (Apple Health is written there,
//     as always) and tells the others, which close their copy without saving a second one. A
//     trainer's Finish asks the client's phone to finish it (when that phone was heard of in the
//     last 90 s), else the trainer's device saves it itself. A trainer's Discard only leaves the
//     workout; the client's Discard ends it for everyone.
// Offline: changes wait here (and in localStorage) and go when the server answers again; the merge
// on the server keeps, per field, the change made last, whoever sends it first.
import * as core from '../../../api/gymv2/live-core.js'

export const CLIENT_AWAY_MS = 90 * 1000
const DIFF_MS = 120
const IDLE_POLL_MS = 8000
const LONG_WAIT_S = 25
const DEV_KEY = 'gym_live_dev'
const STORE_KEY = uid => 'gym_live:' + uid
const ENDED_KEY = 'gym_live_ended'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const rnd = () => Math.random().toString(36).slice(2, 10)
let sidN = 0
const newSid = () => 's' + Math.floor(Math.random() * 2176782336).toString(36).padStart(6, '0') + 'L' + (++sidN).toString(36)

/** Gives every exercise of `A` its live id and every set its id (as lib/watch-sync.js does). */
export function ensureIds(A) {
  if (!A || !Array.isArray(A.entries)) return false
  let changed = core.ensureLids(A)
  const seen = new Set()
  for (const e of A.entries) for (const s of e?.sets || []) {
    if (!s || typeof s !== 'object') continue
    if (typeof s.sid !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(s.sid) || seen.has(s.sid)) { s.sid = newSid(); changed = true }
    seen.add(s.sid)
  }
  return changed
}

/**
 * One device's side of the channel. Everything it needs is passed in, so the tests run two of them
 * against the real server code without a browser:
 *   get()             the store's state ({ S, user, config, ready, tourSandbox })
 *   update(fn, push)  useStore.update
 *   request(method, path, body, opts)  → parsed JSON; throws { status, data } like lib/api.js
 *   storage           localStorage-like (or null)
 *   hooks             { toast(kind, info), adopted(A), ended(e), finish() } (the UI side)
 *   stream(dev, onAnswer, onFail) → close()  optional Server-Sent Events (browser only)
 */
export function createLiveClient({ get, update, request, storage = null, hooks = {}, now = () => Date.now(), stream = null, timers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id) } }) {
  const st = {
    wid: null, el: null, seq: -1, lastFlat: null, pending: [], offset: 0, peers: null,
    attached: false, attaching: null, applying: false, suppressEnd: null, blocked: new Set(), left: new Set(),
    finishSeen: 0, inflight: null, diffTm: null, retryTm: null, backoff: 1000, running: false, sse: null, sseOk: false,
    lastAnswerAt: 0
  }
  const store = {
    get: k => { try { return storage ? storage.getItem(k) : null } catch { return null } },
    set: (k, v) => { try { if (storage) { if (v == null) storage.removeItem(k); else storage.setItem(k, v) } } catch { /* full: the server has it */ } }
  }
  let dev = store.get(DEV_KEY)
  if (!dev || !/^[A-Za-z0-9_-]{4,40}$/.test(dev)) { dev = 'd' + rnd() + rnd(); store.set(DEV_KEY, dev) }
  // Strictly rising on this device: two changes in one millisecond are still two (rule 1 in
  // live-core.js keeps an op only when it is later than the field's last one).
  let lastT = 0
  const serverNow = () => (lastT = Math.max(Math.round(now() + st.offset), lastT + 1))
  const uid = () => get().user?.id || null
  const acting = () => !!get().user?.acting
  const eligible = () => {
    const s = get()
    const g = s.config?.gymv2
    return !!(s.user && s.ready !== false && !s.tourSandbox && g?.on && g.live && (g.acting || g.role === 'member'))
  }
  const liveable = A => !!A && typeof A === 'object' && A.id != null && /^[A-Za-z0-9_-]{1,40}$/.test(String(A.id)) && !A.editingWorkoutId && !A.backfill
  const endedList = () => { try { return JSON.parse(store.get(ENDED_KEY) || '[]') } catch { return [] } }
  const noteEnded = wid => store.set(ENDED_KEY, JSON.stringify([...endedList().filter(x => x !== wid), wid].slice(-30)))
  const isEnded = wid => endedList().includes(wid)

  // The shadow (what this device shared last) survives a reload, so changes made just before it
  // are still told apart from the others' on the way back.
  let saveTm = null
  const persist = () => {
    if (saveTm || !uid()) return
    saveTm = timers.setTimeout(() => {
      saveTm = null
      if (!st.wid || !uid()) return
      store.set(STORE_KEY(uid()), JSON.stringify({ wid: st.wid, el: st.el, seq: st.seq, lastFlat: st.lastFlat, pending: st.pending }))
    }, 300)
  }
  const readShadow = wid => {
    try { const x = JSON.parse(store.get(STORE_KEY(uid())) || 'null'); return x && x.wid === wid && x.el ? x : null } catch { return null }
  }

  function setActive(A) {
    st.applying = true
    try { update(S => { S.active = A }, false) } finally { st.applying = false }
  }

  /* ---------- local changes -> ops ---------- */
  function diffNow() {
    timers.clearTimeout(st.diffTm); st.diffTm = null
    if (!st.attached || !st.wid) return false
    const A = get().S?.active
    if (!A || String(A.id) !== st.wid) return false
    const flat = core.flatten(A)
    const ops = core.diffFlat(st.lastFlat, flat, serverNow(), dev)
    st.lastFlat = flat
    if (!ops.length) return false
    core.applyOps(st.el, ops)
    st.pending.push(...ops)
    persist()
    return true
  }
  function scheduleDiff() {
    if (st.diffTm) return
    st.diffTm = timers.setTimeout(() => { st.diffTm = null; if (diffNow()) flush() }, DIFF_MS)
  }

  /* ---------- talking to the server ---------- */
  function learn(answer, sentAt) {
    if (answer && Number.isFinite(answer.now)) {
      const mid = (sentAt + now()) / 2
      st.offset = answer.now - mid
    }
    st.lastAnswerAt = now()
  }
  async function flush() {
    if (st.inflight) return st.inflight
    if (!st.attached || !st.pending.length) return null
    const wid = st.wid
    const batch = st.pending.slice()
    const sentAt = now()
    st.inflight = (async () => {
      try {
        const r = await request('POST', '/api/live/ops', { wid, ops: batch, dev, since: st.seq })
        learn(r, sentAt)
        if (st.wid === wid) {
          st.pending = st.pending.slice(batch.length)
          st.backoff = 1000
          receive(r)
        }
      } catch (e) {
        const code = e?.data?.code
        if (e?.status === 409 && code === 'ended' && st.wid === wid) { st.pending = []; handleEnded(e.data.live?.ended || { how: 'saved' }) }
        else if (e?.status === 409 && code === 'other-live' && st.wid === wid) block(wid, e.data.live)
        else if (e?.status === 400 || e?.status === 413) { st.pending = st.pending.slice(batch.length); hooks.toast?.('refused', { code }) }
        else retryLater()
      } finally {
        st.inflight = null
        persist()
      }
      if (st.attached && st.pending.length && !st.retryTm) flush()
    })()
    return st.inflight
  }
  function retryLater() {
    if (st.retryTm) return
    const wait = st.backoff
    st.backoff = Math.min(15000, st.backoff * 2)
    st.retryTm = timers.setTimeout(() => { st.retryTm = null; flush() }, wait)
  }
  function block(wid, other) {
    st.blocked.add(wid)
    detach()
    hooks.toast?.('other-live', other || null)
  }

  /* ---------- what comes back ---------- */
  function receive(answer) {
    st.lastAnswerAt = now()
    const l = answer?.live
    if (!l) {
      // The server has no channel (it went stale, or was removed) while this device still runs the
      // workout: it is started again from what this device has.
      if (st.attached && st.el) { st.pending = core.opsOf(st.el); st.seq = -1; flush() }
      else maybeAdopt(null)
      return
    }
    if (!st.attached || l.wid !== st.wid) { maybeAdopt(l); return }
    diffNow()
    if (l.el) {
      const el = JSON.parse(JSON.stringify(l.el))
      core.applyOps(el, st.pending)
      st.el = el
    } else if (Array.isArray(l.ops)) {
      if (l.ops.length && l.ops[0].s > st.seq + 1 && st.seq >= 0) { st.seq = -1; resync(); return }
      core.applyOps(st.el, l.ops)
    }
    if (Number.isInteger(l.seq)) st.seq = l.seq
    if (l.peers) st.peers = l.peers
    render()
    persist()
    if (l.finishReq && l.finishReq.at > st.finishSeen && !acting()) {
      st.finishSeen = l.finishReq.at
      hooks.finish?.(l.finishReq)
      return
    }
    if (l.ended) handleEnded(l.ended)
  }
  async function resync() {
    try { const t0 = now(); const r = await request('GET', `/api/live?wid=${encodeURIComponent(st.wid)}&dev=${dev}`); learn(r, t0); receive(r) } catch { /* the loop tries again */ }
  }
  function render() {
    const A = get().S?.active
    if (!A || String(A.id) !== st.wid) return
    const next = core.render(st.el, A.id, A)
    const flat = core.flatten(next)
    st.lastFlat = flat
    if (core.stable(flat) === core.stable(core.flatten(A))) return
    setActive(next)
    hooks.changed?.()
  }
  function handleEnded(e) {
    const wid = st.wid
    noteEnded(wid)
    const A = get().S?.active
    if (A && String(A.id) === wid) {
      st.suppressEnd = wid
      setActive(null)
      hooks.ended?.(e)
    }
    detach()
  }

  /* ---------- joining a workout ---------- */
  function maybeAdopt(l) {
    if (!l || l.ended || !l.el || st.attached || st.attaching) return
    const s = get()
    if (s.S?.active || st.left.has(l.wid) || st.blocked.has(l.wid) || isEnded(l.wid)) return
    if ((s.S?.workouts || []).some(w => w && String(w.id) === l.wid)) return
    st.wid = l.wid
    st.el = JSON.parse(JSON.stringify(l.el))
    st.seq = l.seq
    st.peers = l.peers || null
    st.pending = []
    const A = core.render(st.el, l.wid, null)
    st.lastFlat = core.flatten(A)
    st.attached = true
    setActive(A)
    persist()
    hooks.adopted?.(A, l)
    kick()
  }

  async function attach(A) {
    const wid = String(A.id)
    st.wid = wid; st.attached = false; st.pending = []; st.seq = -1; st.el = {}; st.lastFlat = {}
    const shadow = readShadow(wid)
    const t0 = now()
    let r
    try { r = await request('GET', `/api/live?wid=${encodeURIComponent(wid)}&dev=${dev}${shadow ? '&since=' + shadow.seq : ''}`) }
    catch { r = undefined }
    if (st.wid !== wid) return
    const cur = get().S?.active
    if (!cur || String(cur.id) !== wid) { st.wid = null; return }
    if (!r) {
      // The server could not be asked: nothing is started over what it may already have. Tried
      // again shortly (and on every change of the workout).
      st.wid = null
      timers.setTimeout(() => { const s = get(); onStore(s, s) }, 3000)
      return
    }
    learn(r, t0)
    const l = r.live
    const flatA = core.flatten(cur)
    if (l && l.wid !== wid && !l.ended) { block(wid, l); return }
    if (l && l.wid === wid && l.ended) { st.attached = true; handleEnded(l.ended); return }
    if (l && l.wid === wid) {
      // The server's store, this device's unsent changes on top, then what changed here since.
      if (shadow) {
        st.el = shadow.el
        if (l.el) { st.el = JSON.parse(JSON.stringify(l.el)); core.applyOps(st.el, shadow.pending || []) } else core.applyOps(st.el, l.ops || [])
        // (stamped with this device's id now, should the id have been lost with the rest of storage)
        st.pending = (shadow.pending || []).map(o => ({ ...o, d: dev }))
        const local = core.diffFlat(shadow.lastFlat || {}, flatA, serverNow(), dev)
        core.applyOps(st.el, local); st.pending.push(...local)
      } else {
        // First time here with this workout (a reload without the shadow): what the server has
        // stands; only rows this device has and the server has never seen are added.
        st.el = JSON.parse(JSON.stringify(l.el || {}))
        const known = new Set(Object.keys(st.el))
        const add = {}
        for (const k of Object.keys(flatA)) if (!known.has(k)) add[k] = flatA[k]
        const local = core.diffFlat({}, add, serverNow(), dev)
        core.applyOps(st.el, local); st.pending.push(...local)
      }
      st.seq = l.seq; st.peers = l.peers || null
      st.attached = true
      render()
    } else {
      // No channel yet: this device starts it.
      st.el = {}
      const ops = core.diffFlat({}, flatA, serverNow(), dev)
      core.applyOps(st.el, ops)
      st.pending = ops
      st.lastFlat = flatA
      st.attached = true
    }
    persist()
    flush()
    kick()
  }

  function detach() {
    st.attached = false
    timers.clearTimeout(st.diffTm); st.diffTm = null
    timers.clearTimeout(st.retryTm); st.retryTm = null
    if (uid()) store.set(STORE_KEY(uid()), null)
    st.wid = null; st.el = null; st.seq = -1; st.lastFlat = null; st.pending = []; st.peers = null
  }

  // The workout ended on this device: the last changes go, then the end.
  async function closeOut(wid, how) {
    const pending = st.pending.slice(), seq = st.seq
    if (st.inflight) { try { await st.inflight } catch { /* sent below */ } }
    // What was in flight is sent again with the rest: the merge takes an op twice as once.
    const left = pending
    for (let i = 0; i < 5; i++) {
      try {
        if (left.length) await request('POST', '/api/live/ops', { wid, ops: left, dev, since: seq })
        await request('POST', '/api/live/end', { wid, how, dev })
        return true
      } catch (e) {
        if (e?.status === 409) return false
        await sleep(1500 * (i + 1))
      }
    }
    return false
  }

  /* ---------- the store's changes ---------- */
  function onStore(s, prev) {
    if (!eligible()) { if (st.attached || st.wid) detach(); return }
    const A = s.S?.active
    const P = prev?.S?.active
    if (A && liveable(A)) {
      const wid = String(A.id)
      if (core.needsIds(A)) {
        if (!st.applying) { try { update(x => { ensureIds(x.active) }, false) } catch { /* next change */ } }
        return
      }
      if (st.wid !== wid) {
        if (st.wid && st.attached && P && String(P.id) === st.wid) endHere(st.wid, s)
        if (st.blocked.has(wid) || isEnded(wid) || st.attaching === wid) return
        st.left.delete(wid)
        st.attaching = wid
        attach(A).finally(() => { if (st.attaching === wid) st.attaching = null })
        return
      }
      if (st.attached && !st.applying && A !== P) scheduleDiff()
      return
    }
    if (st.wid && (!A || !liveable(A))) endHere(st.wid, s, P)
  }
  function endHere(wid, s, last = null) {
    if (st.suppressEnd === wid) { st.suppressEnd = null; detach(); return }
    if (!st.attached) { detach(); return }
    // The workout as it was the moment before it went (a set ticked just before Finish).
    if (last && String(last.id) === wid) {
      const ops = core.diffFlat(st.lastFlat, core.flatten(last), serverNow(), dev)
      if (ops.length) { core.applyOps(st.el, ops); st.pending.push(...ops) }
    }
    const saved = (s.S?.workouts || []).some(w => w && String(w.id) === wid)
    // A trainer closing their copy without saving only leaves; the client's own workout goes on.
    if (!saved && acting()) { st.left.add(wid); detach(); hooks.toast?.('left'); return }
    noteEnded(wid)
    const how = saved ? 'saved' : 'discarded'
    closeOut(wid, how)
    detach()
  }
  /** A trainer's Finish (sheets.jsx doFinishWorkout asks first): true when the client's phone finishes it. */
  function finishGate() {
    if (!st.attached || !acting() || !st.wid) return false
    const A = get().S?.active
    if (!A || String(A.id) !== st.wid) return false
    const clientAt = st.peers?.clientAt || 0
    const fresh = clientAt && (now() + st.offset - clientAt) < CLIENT_AWAY_MS && (now() - st.lastAnswerAt) < CLIENT_AWAY_MS
    if (!fresh) return false
    diffNow()
    const wid = st.wid
    noteEnded(wid)
    st.suppressEnd = wid
    closeOut(wid, 'finish-request')
    setActive(null)
    detach()
    hooks.toast?.('finish-sent')
    return true
  }

  /* ---------- the loop that listens ---------- */
  let wake = null
  function kick() { if (wake) { const w = wake; wake = null; w() } }
  const nap = ms => new Promise(r => { const tm = timers.setTimeout(() => { wake = null; r() }, ms); wake = () => { timers.clearTimeout(tm); r() } })
  async function loop() {
    if (st.running) return
    st.running = true
    let fails = 0
    while (st.running) {
      if (!eligible() || (typeof document !== 'undefined' && document.hidden && !st.attached)) { await nap(5000); continue }
      if (stream && !st.sse && fails < 3) {
        st.sse = stream(dev, a => { st.sseOk = true; learn(a, now()); receive(a) }, () => { st.sse = null; st.sseOk = false; fails++; kick() })
      }
      if (st.sse) { await nap(st.sseOk ? 30000 : 8000); if (!st.sseOk && st.sse) { st.sse.close?.(); st.sse = null; fails = 3 } continue }
      try {
        const t0 = now()
        if (st.attached && st.wid) {
          const r = await request('GET', `/api/live?wid=${encodeURIComponent(st.wid)}&since=${st.seq}&wait=${LONG_WAIT_S}&dev=${dev}`, null, { timeout: (LONG_WAIT_S + 10) * 1000 })
          learn(r, t0); receive(r)
        } else {
          const r = await request('GET', `/api/live?dev=${dev}`)
          learn(r, t0); receive(r)
          await nap(IDLE_POLL_MS)
        }
        st.backoff = 1000
      } catch {
        await nap(Math.min(15000, st.backoff)); st.backoff = Math.min(15000, st.backoff * 2)
      }
    }
  }
  function stop() { st.running = false; kick(); if (st.sse) { st.sse.close?.(); st.sse = null } }

  /** "Dołącz": the trainer wants the client's running workout back (after leaving it). */
  function rejoin(wid) { if (wid) { st.left.delete(wid); st.blocked.delete(wid) } kick() }

  return {
    onStore, loop, stop, flush, finishGate, rejoin, diffNow, receive, kick,
    get state() { return st }, get dev() { return dev },
    clientPresent: () => !!(st.peers?.clientAt && now() + st.offset - st.peers.clientAt < CLIENT_AWAY_MS)
  }
}
