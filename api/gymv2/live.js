// Live joint training (local patch 0006, Habcore Gym): the server keeps the workout a gym client
// is doing right now, and every device on that account (the client's phone, and a trainer leading
// the client from the web or the app) exchanges its changes through it within a second or two.
//
// Upstream keeps a running workout on its device only (server.js commitState `delete state.active`)
// and that stays so for the profile document: this is a channel of its own, next to it. The App
// Store app does not know it and works as before; patch 0004's join after the workout is still
// there for it (and is told to leave alone a workout that was shared live, liveShared()).
//
// One running workout per client account: DATA_DIR/gymv2-live/<uid>.json
//   { v, wid, uid, seq, startedAt, updatedAt, by, el, ops: [...last OPS_KEEP, each with its seq `s`],
//     ended: null | { at, how, by, dev }, finishReq: null | { at, by }, devs: { dev: { at, actor } } }
// and DATA_DIR/gymv2-live/index.json: { wid: { uid, at, shared } } for the last INDEX_DAYS days.
//
// Routes (all as the session's account: the client, or a trainer leading the client):
//   GET  /api/live?wid=&since=&wait=&dev=   the running workout: the whole store, or the ops after
//                                           `since` (long poll: held up to `wait` s, max 25, until
//                                           something happens)
//   GET  /api/live/stream?dev=              the same as Server-Sent Events (hello, then ops/end)
//   POST /api/live/ops { wid, ops, dev, since }  changes from a device; starts the workout's
//                                           channel when there is none. Answers with what it missed.
//   POST /api/live/end { wid, how, dev }    saved | discarded (the workout ended on that device),
//                                           finish-request (a trainer's Finish: the client's phone
//                                           finishes it, so Apple Health gets it from there)
// Merge rules: live-core.js (field-level last-writer-wins on the server's clock, deterministic).
import fs from 'node:fs';
import path from 'node:path';
import { applyOps, opOk, summaryOf, LIVE_V } from './live-core.js';

export const OPS_KEEP = 1500;
export const MAX_OPS_PER_PUSH = 3000;
export const MAX_ELEMENTS = 4000;
export const MAX_OP_BYTES = 32 * 1024;
export const STALE_MS = 4 * 3600 * 1000;       // a channel with no change for this long is over
export const ENDED_KEEP_MS = 15 * 60 * 1000;    // an ended channel still answers "ended" this long
export const WAIT_MAX_S = 25;
export const INDEX_DAYS = 14;
export const CLIENT_GONE_MS = 90 * 1000;
export const FUTURE_MS = 5000;        // a client phone not heard of for this long is away

const str = v => (typeof v === 'string' ? v : '');
const DEV_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function createLive({ dataDir, now = () => Date.now() }) {
  const dir = path.join(dataDir, 'gymv2-live');
  const file = uid => path.join(dir, String(uid).replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
  const indexFile = path.join(dir, 'index.json');
  const cache = new Map();          // uid -> doc | null
  const waiters = new Map();        // uid -> Set<fn>

  const write = (f, obj) => {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
    fs.renameSync(tmp, f);
  };
  function load(uid) {
    if (cache.has(uid)) return cache.get(uid);
    let d = null;
    try { d = JSON.parse(fs.readFileSync(file(uid), 'utf8')); } catch { d = null; }
    if (d && (typeof d !== 'object' || !d.el || typeof d.el !== 'object')) d = null;
    cache.set(uid, d);
    return d;
  }
  const save = d => { cache.set(d.uid, d); write(file(d.uid), d); };

  let index = null;
  function readIndex() {
    if (index) return index;
    try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')) || {}; } catch { index = {}; }
    return index;
  }
  function noteIndex(d) {
    const ix = readIndex();
    const cut = now() - INDEX_DAYS * 86400000;
    for (const k of Object.keys(ix)) if (!(ix[k]?.at > cut)) delete ix[k];
    const shared = sharedOf(d);
    const was = ix[d.wid];
    if (was && was.shared === shared && was.uid === d.uid && now() - was.at < 3600000) return;
    ix[d.wid] = { uid: d.uid, at: now(), shared };
    try { write(indexFile, ix); } catch (e) { console.error('gymv2-live index', e.message); }
  }
  // Shared live = a device of the client AND a trainer leading the client both took part. Only
  // then is the workout one the client and a trainer did together, which the join after the
  // workout (patch 0004) must leave alone. A workout only a trainer's device ever had (the client
  // trains with the App Store app) is joined after the workout as before.
  const sharedOf = d => {
    const v = Object.values(d.devs || {});
    return v.some(x => x && !x.actor) && v.some(x => x && x.actor);
  };

  const active = d => !!d && !d.ended && now() - (d.updatedAt || 0) < STALE_MS;
  const visible = d => !!d && (active(d) || (d.ended && now() - d.ended.at < ENDED_KEEP_MS));

  function notify(uid) {
    const set = waiters.get(uid);
    if (!set) return;
    for (const fn of [...set]) { try { fn(); } catch { /* the next one */ } }
  }
  function wait(uid, fn) {
    if (!waiters.has(uid)) waiters.set(uid, new Set());
    waiters.get(uid).add(fn);
    return () => { const s = waiters.get(uid); if (s) { s.delete(fn); if (!s.size) waiters.delete(uid); } };
  }

  function touch(d, dev, actor) {
    if (!DEV_RE.test(dev || '')) return;
    d.devs = d.devs || {};
    const prev = d.devs[dev];
    d.devs[dev] = { at: now(), actor: actor ? { id: actor.id, name: String(actor.name || '').slice(0, 40) } : null };
    // A device that moved from being nobody's to someone's (or the other way) is a new device.
    if (!prev || !!prev.actor !== !!actor) noteIndex(d);
  }
  // Who is on the workout: when a client's own device and a trainer's were last heard of.
  function peers(d) {
    let client = 0, trainer = null;
    for (const v of Object.values(d.devs || {})) {
      if (!v) continue;
      if (!v.actor) client = Math.max(client, v.at || 0);
      else if (!trainer || v.at > trainer.at) trainer = { at: v.at, name: v.actor.name };
    }
    return { clientAt: client || null, trainer, now: now() };
  }
  function full(d) {
    return { wid: d.wid, seq: d.seq, el: d.el, startedAt: d.startedAt, updatedAt: d.updatedAt, by: d.by || null, ended: d.ended || null, finishReq: d.finishReq || null, peers: peers(d), v: LIVE_V };
  }
  function since(d, s) {
    const ops = d.ops || [];
    const first = ops.length ? ops[0].s : d.seq + 1;
    if (!(s >= first - 1) || s > d.seq) return null;   // too old (or from another channel): send the whole store
    return { wid: d.wid, seq: d.seq, ops: ops.filter(o => o.s > s), ended: d.ended || null, finishReq: d.finishReq || null, peers: peers(d), v: LIVE_V };
  }
  /** What GET /api/live answers right now. */
  function answer(uid, wid, s) {
    const d = load(uid);
    if (!visible(d)) return { live: null, now: now() };
    if (wid && wid === d.wid && Number.isInteger(s)) { const inc = since(d, s); if (inc) return { live: inc, now: now() }; }
    return { live: full(d), now: now() };
  }

  /** Changes from a device (POST /api/live/ops). Throws { status, code } on a refusal. */
  function push(uid, { wid, ops, dev, actor, since: s }) {
    if (!DEV_RE.test(wid || '')) throw Object.assign(new Error('wid required'), { status: 400, code: 'bad-wid' });
    if (!DEV_RE.test(dev || '')) throw Object.assign(new Error('dev required'), { status: 400, code: 'bad-dev' });
    if (!Array.isArray(ops) || ops.length > MAX_OPS_PER_PUSH) throw Object.assign(new Error('ops'), { status: 400, code: 'bad-ops' });
    for (const op of ops) {
      if (!opOk(op) || op.d !== dev) throw Object.assign(new Error('bad op'), { status: 400, code: 'bad-op' });
      if (op.v !== undefined && JSON.stringify(op.v).length > MAX_OP_BYTES) throw Object.assign(new Error('op too large'), { status: 413, code: 'op-too-large' });
    }
    let d = load(uid);
    const t = now();
    if (!d || d.wid !== wid) {
      if (active(d)) {
        const e = Object.assign(new Error('another workout is live'), { status: 409, code: 'other-live' });
        e.extra = { live: { wid: d.wid, ...summaryOf(d.el, d.wid), updatedAt: d.updatedAt } };
        throw e;
      }
      d = { v: LIVE_V, wid, uid, seq: 0, startedAt: t, updatedAt: t, by: actor ? { id: actor.id, name: String(actor.name || '').slice(0, 40) } : null, el: {}, ops: [], ended: null, finishReq: null, devs: {} };
    } else if (d.ended) {
      const e = Object.assign(new Error('this workout has ended'), { status: 409, code: 'ended' });
      e.extra = { live: full(d) };
      throw e;
    }
    // The server's clock is the one every stamp is on: one further in the future than a device's
    // own strictly rising stamps can run ahead (several changes in one millisecond) is brought back.
    const fixed = ops.map(op => (op.t > t + FUTURE_MS ? { ...op, t } : op));
    const keysAfter = new Set(Object.keys(d.el));
    for (const op of fixed) keysAfter.add(op.k);
    if (keysAfter.size > MAX_ELEMENTS) throw Object.assign(new Error('too many rows'), { status: 413, code: 'too-large' });
    applyOps(d.el, fixed);
    for (const op of fixed) { d.seq++; d.ops.push({ ...op, s: d.seq }); }
    if (d.ops.length > OPS_KEEP) d.ops = d.ops.slice(-OPS_KEEP);
    d.updatedAt = t;
    touch(d, dev, actor);
    save(d);
    noteIndex(d);
    if (fixed.length) notify(uid);
    const back = Number.isInteger(s) ? since(d, s) : null;
    return back ? { live: back, now: t } : { live: full(d), now: t };
  }

  function end(uid, { wid, how, dev, actor }) {
    const d = load(uid);
    if (!d || d.wid !== wid) return { ok: false, code: 'not-live' };
    if (d.ended) return { ok: true, ended: d.ended };
    const by = actor ? { id: actor.id, name: String(actor.name || '').slice(0, 40) } : null;
    if (how === 'finish-request') {
      d.finishReq = { at: now(), by };
    } else if (how === 'saved' || how === 'discarded') {
      d.ended = { at: now(), how, by, dev: DEV_RE.test(dev || '') ? dev : null };
    } else return { ok: false, code: 'bad-how' };
    d.updatedAt = now();
    touch(d, dev, actor);
    save(d);
    noteIndex(d);
    notify(uid);
    return { ok: true, ended: d.ended, finishReq: d.finishReq };
  }

  /** A device was heard of (a poll, the stream): who is on the workout. */
  function seen(uid, dev, actor) {
    const d = load(uid);
    if (!active(d) || !DEV_RE.test(dev || '')) return;
    const prev = d.devs?.[dev];
    touch(d, dev, actor);
    // Written at most every 20 s per device: a poll every few seconds is not worth a disk write.
    if (!prev || now() - prev.at > 20000 || !!prev.actor !== !!actor) { save(d); notify(uid); }
    else cache.set(uid, d);
  }

  /** The client's document now holds the workout (saved by some device): the channel is over. */
  function savedInState(uid, S) {
    const d = load(uid);
    if (!d || d.ended || !Array.isArray(S?.workouts)) return;
    if (!S.workouts.some(w => w && String(w.id) === d.wid)) return;
    d.ended = { at: now(), how: 'saved', by: null, dev: null, via: 'sync' };
    d.updatedAt = now();
    save(d);
    noteIndex(d);
    notify(uid);
  }

  /** For a trainer's list: the running workout of `uid`, or null. */
  function liveOf(uid) {
    const d = load(uid);
    if (!active(d)) return null;
    const p = peers(d);
    return { wid: d.wid, startedAt: d.startedAt, updatedAt: d.updatedAt, by: d.by || null, ...summaryOf(d.el, d.wid), clientAt: p.clientAt, trainer: p.trainer };
  }
  const liveShared = wid => !!readIndex()[String(wid)]?.shared;
  function drop(uid) { cache.delete(uid); try { fs.rmSync(file(uid), { force: true }); } catch { /* gone */ } notify(uid); }

  return { answer, push, end, seen, wait, notify, savedInState, liveOf, liveShared, drop, active: uid => active(load(uid)), _load: load };
}

/**
 * The routes. `resolve(sess, as)` says whose channel a request is about and who acts, or null:
 *   - a gym client's own session: their own (`as` ignored);
 *   - a trainer leading a client (act token): that client, the trainer as actor;
 *   - a trainer in their own account with `as` = a client id (group training, patch 0006): that
 *     client, checked on every request (the trainer may lead that client right now).
 * → { uid, actor } or null.
 */
export function liveRoutes({ live, json, readBody, sessionOf, resolve, log }) {
  const who = u => ({ id: u.id, name: String(u.name || '').slice(0, 40) });
  function gate(req, res, as) {
    const s = sessionOf(req);
    if (!s) { json(res, 401, { error: 'not signed in' }); return null; }
    const r = resolve(s, as);
    if (!r) { json(res, 403, { error: 'live training is for gym clients', code: 'live-not-allowed' }); return null; }
    return r;
  }
  const q = req => new URL(req.url, 'http://x').searchParams;
  return {
    'GET /api/live': async (req, res) => {
      const p = q(req);
      const s = gate(req, res, str(p.get('as'))); if (!s) return;
      const uid = s.uid, wid = str(p.get('wid')), dev = str(p.get('dev'));
      const since = p.has('since') ? Number(p.get('since')) : null;
      const waitS = Math.max(0, Math.min(WAIT_MAX_S, Number(p.get('wait')) || 0));
      live.seen(uid, dev, s.actor || null);
      const first = live.answer(uid, wid, Number.isInteger(since) ? since : null);
      // Held only while nothing new is there: an end or a finish request wakes it (notify), and a
      // device that already knows the workout ended does not poll it with a wait.
      const nothing = a => a.live && a.live.ops && !a.live.ops.length;
      if (!waitS || !nothing(first)) return json(res, 200, first);
      let done = false, off = null, timer = null;
      const finish = () => {
        if (done) return; done = true;
        if (off) off(); clearTimeout(timer);
        if (!res.writableEnded && !res.destroyed) json(res, 200, live.answer(uid, wid, since));
      };
      off = live.wait(uid, finish);
      timer = setTimeout(finish, waitS * 1000);
      req.on('close', () => { if (!done) { done = true; if (off) off(); clearTimeout(timer); } });
    },

    'GET /api/live/stream': async (req, res) => {
      const p = q(req);
      const s = gate(req, res, str(p.get('as'))); if (!s) return;
      const uid = s.uid, dev = str(p.get('dev'));
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform',
        'X-Accel-Buffering': 'no', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff'
      });
      if (typeof res.flushHeaders === 'function') res.flushHeaders();
      let wid = null, seq = -1, marks = '';
      const markOf = l => JSON.stringify([l.ended?.at || 0, l.finishReq?.at || 0, l.peers?.clientAt ? Math.floor(l.peers.clientAt / 30000) : 0, l.peers?.trainer?.name || ''])
      const send = () => {
        const a = live.answer(uid, wid, seq >= 0 ? seq : null);
        if (!a.live) { if (wid) { wid = null; seq = -1; res.write(`event: none\ndata: ${JSON.stringify({ now: a.now })}\n\n`); } return; }
        const m = markOf(a.live);
        if (a.live.wid === wid && a.live.ops && !a.live.ops.length && m === marks) return;
        wid = a.live.wid; seq = a.live.seq; marks = m;
        res.write(`event: live\ndata: ${JSON.stringify(a)}\n\n`);
      };
      live.seen(uid, dev, s.actor || null);
      const cur = live.answer(uid, null, null);
      res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify(cur)}\n\n`);
      if (cur.live) { wid = cur.live.wid; seq = cur.live.seq; marks = markOf(cur.live); }
      const off = live.wait(uid, send);
      // A comment every 15 s keeps every proxy on the way from closing an idle stream, and tells
      // the server the device is still there.
      const ping = setInterval(() => { live.seen(uid, dev, s.actor || null); res.write(`: ping ${Date.now()}\n\n`); }, 15000);
      const stop = () => { off(); clearInterval(ping); };
      req.on('close', stop);
      res.on('error', stop);
    },

    'POST /api/live/ops': async (req, res) => {
      const body = await readBody(req);
      const s = gate(req, res, str(body.as)); if (!s) return;
      try {
        const out = live.push(s.uid, { wid: str(body.wid), ops: body.ops, dev: str(body.dev), actor: s.actor || null, since: Number.isInteger(body.since) ? body.since : null });
        json(res, 200, out);
      } catch (e) {
        if (!e.status) throw e;
        json(res, e.status, { error: e.message, code: e.code, ...(e.extra || {}) });
      }
    },

    'POST /api/live/end': async (req, res) => {
      const body = await readBody(req);
      const s = gate(req, res, str(body.as)); if (!s) return;
      const how = str(body.how);
      const r = live.end(s.uid, { wid: str(body.wid), how, dev: str(body.dev), actor: s.actor || null });
      if (r.ok && log) log(s.uid, { ev: 'live-' + how, by: who(s.actor || s.self), wid: str(body.wid) });
      json(res, r.ok ? 200 : 409, r.ok ? { ok: true, ended: r.ended || null, finishReq: r.finishReq || null } : { error: 'not live', code: r.code });
    }
  };
}
