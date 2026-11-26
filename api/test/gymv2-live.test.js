/* Live joint training (local patch 0006, gymv2/live.js + live-core.js): the channel a gym client's
   running workout is shared on. Real server.js in a child, like gymv2-merge.test.js: who may use
   it, the long poll and the stream waking up on a change, the end, and how it meets patch 0004's
   join after the workout. The devices' side (two app copies merging) is in
   frontend/src/lib/gym-live.test.js. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../password.js';
import { boundPort } from './helpers.mjs';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';
let pwHash;
before(async () => { pwHash = await hashPassword('correct horse battery staple'); });
const mint = (uid, sv = 0) => {
  const payload = `${uid}:${Date.now() + 86400000}:${sv}:c`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function startServer(t, { env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-live-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), pw: { h: pwHash, set: new Date().toISOString() }, ...extra });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users: [user('ADM', 'Owner', { admin: true, owner: true }), user('TR1', 'Tomasz'), user('CLI', 'Sylwester'), user('OUT', 'Obcy'), user('CL2', 'Anna')], creds: [], subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', INVITE_ONLY: '1', ADMIN_UIDS: '', GYM_V2: 'on', GYM_MERGE: 'on', GYM_LIVE: 'on', ...env }
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.req = async (method, p, { body, jar = {}, headers = {} } = {}) => {
    const cookie = [jar.sid ? 'gymsid=' + jar.sid : null, jar.act ? 'gymact=' + jar.act : null].filter(Boolean).join('; ');
    const r = await fetch(`${h.api}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (k === 'gymsid') jar.sid = v || undefined;
      if (k === 'gymact') jar.act = v || undefined;
    }
    let b = null; try { b = await r.json(); } catch { /* none */ }
    return { status: r.status, body: b };
  };
  h.gym = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'gymv2.json'), 'utf8'));
  h.logOf = uid => { try { return fs.readFileSync(path.join(dataDir, 'gymv2-log', uid + '.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)); } catch { return []; } };
  // The gym: Tomasz a trainer, Sylwester a client (joined with the code, as on the live server).
  const admin = { sid: mint('ADM') }, tr = { sid: mint('TR1') }, cli = { sid: mint('CLI') };
  await h.req('POST', '/api/gymv2/trainer', { jar: admin, body: { id: 'TR1', trainer: true } });
  const code = (await h.req('POST', '/api/gymv2/code', { jar: tr, body: {} })).body.code.code;
  const st = (await h.req('GET', '/api/gymv2/status', { jar: cli })).body;
  assert.equal((await h.req('POST', '/api/gymv2/join', { jar: cli, body: { code, consent: { v: st.consent.v, hash: st.consent.hash } } })).status, 200);
  const cl2 = { sid: mint('CL2') }, out = { sid: mint('OUT') };
  assert.equal((await h.req('POST', '/api/gymv2/join', { jar: cl2, body: { code, consent: { v: st.consent.v, hash: st.consent.hash } } })).status, 200);
  Object.assign(h, { admin, tr, cli, cl2, out });
  return h;
}


const MIN = 60e3;
const T0 = Date.now();
// A running workout as the phone app has it (sheets.jsx beginWorkout + watch-sync ids), cut into ops.
import { flatten, diffFlat, render, applyOps } from '../gymv2/live-core.js';
const active = () => ({
  id: 'w-live-1', d: new Date(T0).toISOString().slice(0, 10), start: T0 - 5 * MIN, routineIds: ['r1'], name: 'Push A', bw: 82, cur: 0, workoutView: 'cards',
  entries: [
    { lid: 'eA', id: '0025', rid: 'r1', target: { id: '0025', mode: 'reps', sets: 3, reps: 8, w: 80 }, plan: null, topW: null,
      sets: [{ sid: 's1', w: 80, r: 8, done: true, at: T0 - 3 * MIN, hr: { avg: 121, max: 134 } }, { sid: 's2', w: 80, r: 8, done: false }] }
  ]
});
const opsFor = (prev, next, dev, t = Date.now()) => diffFlat(prev ? flatten(prev) : {}, flatten(next), t, dev);

test('who may use the channel: the client and a trainer leading them; nobody else', async t => {
  const h = await startServer(t);
  const A = active();
  let r = await h.req('POST', '/api/live/ops', { jar: h.cli, body: { wid: A.id, dev: 'phone1', ops: opsFor(null, A, 'phone1'), since: -1 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.live.wid, A.id);
  // The trainer in their own account (not leading): staff never have a live workout of their own.
  assert.equal((await h.req('GET', '/api/live', { jar: h.tr })).status, 403);
  // Another client of the gym sees only their own (nothing), never Sylwester's.
  r = await h.req('GET', '/api/live', { jar: h.cl2 });
  assert.equal(r.status, 200);
  assert.equal(r.body.live, null);
  // Not in the gym at all, the admin: refused.
  assert.equal((await h.req('GET', '/api/live', { jar: h.out })).status, 403);
  assert.equal((await h.req('GET', '/api/live', { jar: h.admin })).status, 403);
  // Not signed in.
  assert.equal((await h.req('GET', '/api/live', {})).status, 401);
  // The trainer leading Sylwester gets it, and the gym list says he trains now.
  const list = (await h.req('GET', '/api/gymv2/clients', { jar: h.tr })).body.clients;
  const syl = list.find(c => c.id === 'CLI');
  assert.equal(syl.live.wid, A.id);
  assert.equal(syl.live.setsDone, 1);
  assert.equal(syl.live.setsTotal, 2);
  assert.equal(list.find(c => c.id === 'CL2').live, null);
  assert.deepEqual((await h.req('GET', '/api/gymv2/live-now', { jar: h.tr })).body.live.map(x => x.name), ['Sylwester']);
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: 'CLI' } })).status, 200);
  r = await h.req('GET', '/api/live', { jar: h.tr });
  assert.equal(r.status, 200);
  assert.equal(r.body.live.wid, A.id);
  assert.deepEqual(render(r.body.live.el, A.id).entries[0].sets.map(s => s.sid), ['s1', 's2']);
  // A bad op is refused whole (another device's id, a field that is not a field).
  assert.equal((await h.req('POST', '/api/live/ops', { jar: h.tr, body: { wid: A.id, dev: 'web1', ops: [{ k: 's:s1', f: 'w', v: 1, t: 1, d: 'phone1' }] } })).status, 400);
  assert.equal((await h.req('POST', '/api/live/ops', { jar: h.tr, body: { wid: A.id, dev: 'web1', ops: [{ k: 's:s1', f: '__proto__', v: 1, t: 1, d: 'web1' }] } })).status, 400);
  // The App Store app's own sync is untouched: its document write works as before, `active` never stored.
  r = await h.req('PUT', '/api/data', { jar: h.cli, body: { state: { unit: 'kg', routines: [], workouts: [], active: A }, baseRev: 0, stamped: true } });
  assert.equal(r.status, 200);
  assert.equal((await h.req('GET', '/api/data', { jar: h.cli })).body.state.active, undefined);
});

test('a change wakes the other device at once (long poll and stream); edits and removals both ways', async t => {
  const h = await startServer(t);
  const A = active();
  let r = await h.req('POST', '/api/live/ops', { jar: h.cli, body: { wid: A.id, dev: 'phone1', ops: opsFor(null, A, 'phone1'), since: -1 } });
  const seq0 = r.body.live.seq;
  await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: 'CLI' } });
  // The trainer's device waits for news...
  const t0 = Date.now();
  const waiting = h.req('GET', `/api/live?wid=${A.id}&since=${seq0}&wait=20&dev=web1`, { jar: h.tr });
  await new Promise(res => setTimeout(res, 300));
  // ... and the client ticks set 2 on the watch (the phone sends it).
  const B = JSON.parse(JSON.stringify(A)); B.entries[0].sets[1] = { ...B.entries[0].sets[1], done: true, at: Date.now(), hr: { avg: 140, max: 151 } };
  await h.req('POST', '/api/live/ops', { jar: h.cli, body: { wid: A.id, dev: 'phone1', ops: opsFor(A, B, 'phone1'), since: seq0 } });
  r = await waiting;
  const lag = Date.now() - t0 - 300;
  assert.equal(r.status, 200);
  assert.ok(lag < 1000, 'answered as soon as the change came, not at the end of the wait: ' + lag + ' ms');
  assert.ok(r.body.live.ops.some(o => o.k === 's:s2' && o.f === 'done' && o.v === true));
  // The trainer adds an exercise with two sets, and removes the client's first set.
  const el = (await h.req('GET', '/api/live', { jar: h.tr })).body.live.el;
  const Tr = render(el, A.id);
  const C = JSON.parse(JSON.stringify(Tr));
  C.entries.push({ lid: 'eT', id: '0027', target: { id: '0027', mode: 'reps' }, sets: [{ sid: 't1', w: 60, r: 10, done: false }, { sid: 't2', w: 60, r: 10, done: false }] });
  C.entries[0].sets.shift();
  r = await h.req('POST', '/api/live/ops', { jar: h.tr, body: { wid: A.id, dev: 'web1', ops: opsFor(Tr, C, 'web1'), since: 0 } });
  assert.equal(r.status, 200);
  // The client's phone reads it (only what is new).
  r = await h.req('GET', `/api/live?wid=${A.id}&since=${seq0}&dev=phone1`, { jar: h.cli });
  const mine = JSON.parse(JSON.stringify(el));
  applyOps(mine, r.body.live.ops);
  const got = render(mine, A.id);
  assert.deepEqual(got.entries.map(e => e.id), ['0025', '0027']);
  assert.deepEqual(got.entries[0].sets.map(s => s.sid), ['s2']);
  assert.deepEqual(got.entries[0].sets[0].hr, { avg: 140, max: 151 });
  assert.deepEqual(got.entries[1].sets.map(s => [s.w, s.r]), [[60, 10], [60, 10]]);
  // Who is there: the client's phone and the trainer.
  assert.ok(r.body.live.peers.clientAt > 0);
  assert.equal(r.body.live.peers.trainer.name, 'Tomasz');

  // The stream (a browser): hello with the whole store, then the change.
  const ctl = new AbortController();
  const res = await fetch(`${h.api}/api/live/stream?dev=web2`, { headers: { Cookie: `gymsid=${h.tr.sid}; gymact=${h.tr.act}`, 'Sec-Fetch-Site': 'same-origin' }, signal: ctl.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  const reader = res.body.getReader();
  let text = '';
  const until = async re => { const end = Date.now() + 3000; while (!re.test(text) && Date.now() < end) { const { value, done } = await reader.read(); if (done) break; text += Buffer.from(value).toString(); } return re.test(text); };
  assert.ok(await until(/event: hello\ndata: \{"live":\{"wid":"w-live-1"/));
  const D = JSON.parse(JSON.stringify(got)); D.entries[1].sets[0].done = true; D.entries[1].sets[0].at = Date.now();
  const t1 = Date.now();
  await h.req('POST', '/api/live/ops', { jar: h.cli, body: { wid: A.id, dev: 'phone1', ops: opsFor(got, D, 'phone1') } });
  assert.ok(await until(/event: live\ndata: .*"k":"s:t1","f":"done","v":true/), 'the stream carried the tick');
  assert.ok(Date.now() - t1 < 1000);
  ctl.abort();
});

test('the end: the client saves, the channel says so, and 0004 never joins a live-shared workout twice', async t => {
  const h = await startServer(t);
  const A = active();
  await h.req('POST', '/api/live/ops', { jar: h.cli, body: { wid: A.id, dev: 'phone1', ops: opsFor(null, A, 'phone1') } });
  await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: 'CLI' } });
  const Tr = render((await h.req('GET', '/api/live?dev=web1', { jar: h.tr })).body.live.el, A.id);
  const C = JSON.parse(JSON.stringify(Tr)); C.entries[0].sets[1].w = 82.5;
  await h.req('POST', '/api/live/ops', { jar: h.tr, body: { wid: A.id, dev: 'web1', ops: opsFor(Tr, C, 'web1') } });
  // The trainer's Finish while the client's phone is there: a finish request, not an end.
  let r = await h.req('POST', '/api/live/end', { jar: h.tr, body: { wid: A.id, how: 'finish-request', dev: 'web1' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.ended, null);
  assert.equal(r.body.finishReq.by.name, 'Tomasz');
  // The client's phone finishes it: the workout (same id) goes into the document...
  const done = { ...render((await h.req('GET', '/api/live?dev=phone1', { jar: h.cli })).body.live.el, A.id), end: Date.now(), vol: 1300 };
  delete done.cur; delete done.workoutView;
  r = await h.req('PUT', '/api/data', { jar: h.cli, body: { state: { unit: 'kg', routines: [], workouts: [done] }, baseRev: 0, stamped: true } });
  assert.equal(r.status, 200);
  // ... and the channel ends with it, even before the phone's own end call.
  r = await h.req('GET', `/api/live?wid=${A.id}&since=0&dev=web1`, { jar: h.tr });
  assert.equal(r.body.live.ended.how, 'saved');
  assert.equal((await h.req('POST', '/api/live/end', { jar: h.cli, body: { wid: A.id, how: 'saved', dev: 'phone1' } })).status, 200);
  // A late op from a device that has not heard: refused, with the end.
  r = await h.req('POST', '/api/live/ops', { jar: h.tr, body: { wid: A.id, dev: 'web1', ops: opsFor(C, { ...C, name: 'X' }, 'web1') } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ended');
  // The trainer's device, in the old way, also pushes a copy of the session (same times) as a
  // workout of its own: 0004 would join it with the client's, but this one was shared live, so
  // the only pairing candidate is skipped. The trainer's copy under the SAME id is one workout.
  let s = (await h.req('GET', '/api/data', { jar: h.tr })).body;
  const trCopy = { ...done, entries: done.entries.slice(0, 1) };
  r = await h.req('PUT', '/api/data', { jar: h.tr, body: { state: { ...s.state, workouts: [trCopy] }, baseRev: s.rev, stamped: true } });
  assert.equal(r.status, 200);
  s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.equal(s.state.workouts.length, 1);
  assert.equal(h.gym().merges, undefined, 'nothing joined');
  const idx = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'gymv2-live', 'index.json'), 'utf8'));
  assert.equal(idx[A.id].shared, true);
  // A new workout on the same account starts a new channel.
  r = await h.req('POST', '/api/live/ops', { jar: h.cli, body: { wid: 'w-live-2', dev: 'phone1', ops: opsFor(null, { ...A, id: 'w-live-2' }, 'phone1') } });
  assert.equal(r.status, 200);
  // And a second one while that runs is refused (one per account), naming the running one.
  r = await h.req('POST', '/api/live/ops', { jar: h.tr, body: { wid: 'w-live-3', dev: 'web1', ops: opsFor(null, { ...A, id: 'w-live-3' }, 'web1') } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'other-live');
  assert.equal(r.body.live.wid, 'w-live-2');
});

test('a trainer-only live workout (the client on the App Store app) is still joined by 0004', async t => {
  const h = await startServer(t);
  const at = m => T0 - 90 * MIN + m * MIN;
  const day = new Date(at(0)).toISOString().slice(0, 10);
  // The client's App Store app: its own finished workout from the watch, no live channel.
  let r = await h.req('PUT', '/api/data', { jar: h.cli, body: { state: { unit: 'kg', routines: [], workouts: [
    { id: 'cw-1', d: day, start: at(0), end: at(62), name: 'Trening', entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true, at: at(12), hr: { avg: 121, max: 134 } }] }], hr: { avg: 118, max: 152, src: 'ah', n: 744 } }
  ] }, baseRev: 0, stamped: true } });
  assert.equal(r.status, 200);
  // The trainer, leading, runs the workout in our web app: it goes live (nobody else on it)...
  await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: 'CLI' } });
  const tw = { id: 'tw-1', d: day, start: at(3), routineIds: [], name: 'Push A', cur: 0, entries: [{ lid: 'e1', id: '0025', sets: [{ sid: 'a', w: 80, r: 8, done: true, at: at(12) }] }] };
  assert.equal((await h.req('POST', '/api/live/ops', { jar: h.tr, body: { wid: 'tw-1', dev: 'web1', ops: opsFor(null, tw, 'web1') } })).status, 200);
  // ... and saves it: 0004 joins it with the client's watch workout as before.
  const s = (await h.req('GET', '/api/data', { jar: h.tr })).body;
  const saved = { ...tw, end: at(60) }; delete saved.cur;
  r = await h.req('PUT', '/api/data', { jar: h.tr, body: { state: { ...s.state, workouts: [...s.state.workouts, saved] }, baseRev: s.rev, stamped: true } });
  assert.equal(r.status, 200);
  const got = (await h.req('GET', '/api/data', { jar: h.cli })).body.state.workouts;
  assert.deepEqual(got.map(w => w.id), ['cw-1']);
  assert.equal(got[0].gymMerge.from, 'tw-1');
  assert.deepEqual(got[0].entries[0].sets[0].hr, { avg: 121, max: 134 });
});

test('GYM_LIVE off: no routes, no flag', async t => {
  const h = await startServer(t, { env: { GYM_LIVE: '' } });
  assert.equal((await h.req('GET', '/api/live', { jar: h.cli })).status, 404);
  assert.equal((await h.req('GET', '/api/gymv2/status', { jar: h.cli })).body.live, false);
});

test('group training: one trainer, several clients, each checked per request, nothing crosses over', async t => {
  const h = await startServer(t);
  const A = active();
  const B = { ...active(), id: 'w-grp-anna', name: 'Nogi', entries: [{ lid: 'eN', id: '0043', target: { id: '0043', mode: 'reps' }, sets: [{ sid: 'n1', w: 40, r: 12, done: false }] }] };
  // The trainer (own account) starts a workout for Sylwester and one for Anna.
  let r = await h.req('POST', '/api/live/ops', { jar: h.tr, body: { as: 'CLI', wid: A.id, dev: 'tab1', ops: opsFor(null, A, 'tab1') } });
  assert.equal(r.status, 200);
  r = await h.req('POST', '/api/live/ops', { jar: h.tr, body: { as: 'CL2', wid: B.id, dev: 'tab1', ops: opsFor(null, B, 'tab1') } });
  assert.equal(r.status, 200);
  // Not for anyone outside the gym, nor the admin, nor without naming a client.
  assert.equal((await h.req('POST', '/api/live/ops', { jar: h.tr, body: { as: 'OUT', wid: 'x1', dev: 'tab1', ops: [] } })).status, 403);
  assert.equal((await h.req('GET', '/api/live?as=ADM', { jar: h.tr })).status, 403);
  assert.equal((await h.req('GET', '/api/live?as=CLI', { jar: h.cl2 })).status, 403, 'a client naming someone else: refused');
  // Each client sees only their own workout.
  assert.equal((await h.req('GET', '/api/live', { jar: h.cli })).body.live.wid, A.id);
  assert.equal((await h.req('GET', '/api/live', { jar: h.cl2 })).body.live.wid, B.id);
  assert.deepEqual(render((await h.req('GET', '/api/live', { jar: h.cl2 })).body.live.el, B.id).entries.map(e => e.id), ['0043']);
  // One long poll for the group wakes on a change of either.
  const seqA = (await h.req('GET', '/api/live?as=CLI', { jar: h.tr })).body.live.seq;
  const seqB = (await h.req('GET', '/api/live?as=CL2', { jar: h.tr })).body.live.seq;
  const t0 = Date.now();
  const polling = h.req('GET', `/api/gymv2/group/poll?c=CLI:${A.id}:${seqA},CL2:${B.id}:${seqB}&wait=20&dev=tab1`, { jar: h.tr });
  await new Promise(res => setTimeout(res, 200));
  const B2 = JSON.parse(JSON.stringify(B)); B2.entries[0].sets[0].done = true;
  await h.req('POST', '/api/live/ops', { jar: h.cl2, body: { wid: B.id, dev: 'annaphone', ops: opsFor(B, B2, 'annaphone') } });
  r = await polling;
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(r.body.answers.CL2.live.ops.length, 1);
  assert.equal(r.body.answers.CLI.live.ops.length, 0);
  assert.equal((await h.req('GET', `/api/gymv2/group/poll?c=CLI:${A.id}:0,OUT::`, { jar: h.tr })).status, 403);
  // The client's document for the trainer (routines, last weights) — only for whom they may lead.
  assert.equal((await h.req('GET', '/api/gymv2/group/client?id=CL2', { jar: h.tr })).status, 200);
  assert.equal((await h.req('GET', '/api/gymv2/group/client?id=OUT', { jar: h.tr })).status, 403);
  assert.equal((await h.req('GET', '/api/gymv2/group/client?id=CL2', { jar: h.cli })).status, 403);
  // Anna has no phone and no document yet: the trainer's save starts one, logged with the trainer.
  const done = { ...render((await h.req('GET', '/api/live?as=CL2', { jar: h.tr })).body.live.el, B.id), end: Date.now() };
  r = await h.req('POST', '/api/gymv2/group/save', { jar: h.tr, body: { id: 'CL2', workout: done } });
  assert.equal(r.status, 200);
  assert.equal(r.body.saved, true);
  assert.equal((await h.req('POST', '/api/gymv2/group/save', { jar: h.tr, body: { id: 'CL2', workout: done } })).body.saved, false, 'the same workout twice is one');
  const annaDoc = (await h.req('GET', '/api/data', { jar: h.cl2 })).body.state;
  assert.deepEqual(annaDoc.workouts.map(w => w.id), [B.id]);
  assert.equal(annaDoc.workouts[0].entries[0].sets[0].done, true);
  assert.equal((await h.req('GET', '/api/live?as=CL2', { jar: h.tr })).body.live.ended.how, 'saved');
  const lg = h.logOf('CL2').filter(e => e.ev === 'write');
  assert.equal(lg.length, 1);
  assert.equal(lg[0].by.name, 'Tomasz');
  // Sylwester's document got nothing of Anna's.
  const syl = (await h.req('GET', '/api/data', { jar: h.cli })).body.state;
  assert.ok(!(syl?.workouts || []).some(w => w.id === B.id));
  assert.equal((await h.req('POST', '/api/gymv2/group/save', { jar: h.tr, body: { id: 'OUT', workout: done } })).status, 403);
});

test('patch 0006.1: a client account a trainer makes speaks the trainer\'s language', async t => {
  const h = await startServer(t, { env: { DEFAULT_LANG: 'pl' } });
  const r = await h.req('POST', '/api/gymv2/clients', { jar: h.tr, body: { name: 'Nowa Klientka' } });
  assert.equal(r.status, 200);
  await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: r.body.client.id } });
  const S = (await h.req('GET', '/api/data', { jar: h.tr })).body.state;
  assert.equal(S.lang, 'pl');
  assert.equal(S.langAuto, false);
  assert.ok(S.edited.lang > 0);
  // Once at start-up: done and marked, never again.
  assert.ok(h.gym().migrations.clientLang.at);
});
