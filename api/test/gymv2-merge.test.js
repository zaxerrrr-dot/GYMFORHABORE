/* Joint training (local patch 0004, gymv2/merge.js + gymv2/index.js reconcile): the client's
   finished workout from the phone and the watch, and the trainer's logged at the same time through
   "Lead as client", are joined into one on the server once both are in. Real server.js in a child,
   like gymv2.test.js. The devices' own merge is covered by frontend/src/lib/gymv2-merge.test.js. */
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-merge-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), pw: { h: pwHash, set: new Date().toISOString() }, ...extra });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users: [user('ADM', 'Owner', { admin: true, owner: true }), user('TR1', 'Tomasz'), user('CLI', 'Sylwester')], creds: [], subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', INVITE_ONLY: '1', ADMIN_UIDS: '', GYM_V2: 'on', GYM_MERGE: 'on', ...env }
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
  Object.assign(h, { admin, tr, cli });
  return h;
}

const MIN = 60e3;
const now = Date.now();
const at = m => now - 90 * MIN + m * MIN;
const day = new Date(at(0)).toISOString().slice(0, 10);
// What the iPhone app pushes when the client finishes: the watch's heart rate on the set it ticked,
// the session's from Apple Health, nothing else of the exercises.
const clientW = (over = {}) => ({
  id: 'cw-1', d: day, start: at(0), end: at(62), routineIds: [], routineId: null, name: 'Trening', bw: 82, prs: [], vol: 480,
  entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true, at: at(12), hr: { avg: 121, max: 134 } }], topW: 60, target: { mode: 'reps' } }],
  hr: { avg: 118, max: 152, src: 'ah', n: 744 }, ...over
});
const trainerW = (over = {}) => ({
  id: 'tw-1', d: day, start: at(3), end: at(60), routineIds: ['r1'], routineId: 'r1', name: 'Push A', bw: null, prs: ['0025'], vol: 4910,
  entries: [
    { id: '0025', sets: [{ w: 80, r: 8, done: true, at: at(12) }, { w: 85, r: 6, done: true, at: at(20) }], topW: 85, target: { mode: 'reps' } },
    { id: '0027', sets: [{ w: 60, r: 10, done: true, at: at(30) }], topW: 60, target: { mode: 'reps' } }
  ], ...over
});
const base = { unit: 'kg', routines: [], workouts: [] };

async function pair(h) {
  // The client's phone: an older workout, then today's from the watch.
  let r = await h.req('PUT', '/api/data', { jar: h.cli, body: { state: { ...base, workouts: [{ id: 'old', d: '2026-11-01', start: at(-60 * 24 * 20), end: at(-60 * 24 * 20 + 50), entries: [] }] }, baseRev: 0, stamped: true } });
  assert.equal(r.status, 200);
  const s1 = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  r = await h.req('PUT', '/api/data', { jar: h.cli, body: { state: { ...s1.state, workouts: [...s1.state.workouts, clientW()] }, baseRev: s1.rev, stamped: true } });
  assert.equal(r.status, 200);
  assert.equal(h.gym().merges, undefined, 'no trainer workout yet: nothing joined');
  // The trainer, leading the client, logs the same session and finishes it.
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: 'CLI' } })).status, 200);
  const s2 = (await h.req('GET', '/api/data', { jar: h.tr })).body;
  r = await h.req('PUT', '/api/data', { jar: h.tr, body: { state: { ...s2.state, workouts: [...s2.state.workouts, trainerW()] }, baseRev: s2.rev, stamped: true } });
  assert.equal(r.status, 200);
  return r.body.rev;
}

test('the second of the pair joins them: the client\'s workout with the trainer\'s exercises, the trainer\'s removed', async t => {
  const h = await startServer(t);
  const putRev = await pair(h);
  const got = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.ok(got.rev > putRev, 'the join is a revision of its own, which the devices see on their next check');
  const ws = got.state.workouts;
  assert.deepEqual(ws.map(w => w.id), ['old', 'cw-1']);
  const j = ws[1];
  assert.deepEqual([j.start, j.end, j.bw, j.hr.src, j.hr.n], [at(0), at(62), 82, 'ah', 744]);
  assert.deepEqual(j.entries.map(e => e.id), ['0025', '0027']);
  assert.deepEqual(j.entries[0].sets.map(s => s.w), [80, 85]);
  assert.deepEqual(j.entries[0].sets[0].hr, { avg: 121, max: 134 });
  assert.equal(j.name, 'Push A');
  assert.equal(j.gymMerge.by.name, 'Tomasz');
  assert.ok(j._ts > 0 && j._f.entries === j._ts, 'stamped field by field');
  assert.ok(got.state.deleted.workouts['tw-1'] >= j._ts);
  // The log and the originals for Undo.
  const ev = h.logOf('CLI').filter(e => e.ev === 'merge');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].by.name, 'Tomasz');
  const m = h.gym().merges[0];
  const rec = JSON.parse(fs.readFileSync(path.join(h.dataDir, 'gymv2-merged', m.id + '.json'), 'utf8'));
  assert.equal(rec.client.id, 'cw-1');
  assert.equal(rec.trainer.id, 'tw-1');
  assert.equal(rec.trainer.entries.length, 2);
  // The trainer's list shows it, with Undo (not while leading: own session needed).
  await h.req('POST', '/api/gymv2/act/end', { jar: h.tr, body: {} });
  const list = (await h.req('GET', '/api/gymv2/clients', { jar: h.tr })).body.clients;
  assert.equal(list[0].merges.length, 1);
  assert.equal((await h.req('GET', '/api/gymv2/status', { jar: h.tr })).body.merge, true);

  // More pushes from both sides: the client's phone after its 409 merge (the joined copy plus an
  // unrelated change), and the trainer's phone with a correction of a weight. Nothing is joined
  // again, nothing comes back.
  let s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.equal((await h.req('PUT', '/api/data', { jar: h.cli, body: { state: { ...s.state, restSec: 120, edited: { ...s.state.edited, restSec: Date.now() } }, baseRev: s.rev, stamped: true } })).status, 200);
  await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: 'CLI' } });
  s = (await h.req('GET', '/api/data', { jar: h.tr })).body;
  const fix = JSON.parse(JSON.stringify(s.state));
  const jw = fix.workouts.find(w => w.id === 'cw-1');
  const tt = Date.now() + 5;
  jw.entries[1].sets[0].r = 12; jw._ts = tt; jw._f = { ...jw._f, entries: tt };
  assert.equal((await h.req('PUT', '/api/data', { jar: h.tr, body: { state: fix, baseRev: s.rev, stamped: true } })).status, 200);
  s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.deepEqual(s.state.workouts.map(w => w.id), ['old', 'cw-1']);
  assert.equal(s.state.workouts[1].entries[1].sets[0].r, 12);
  assert.equal(s.state.restSec, 120);
  assert.equal(h.gym().merges.length, 1);
  assert.equal(h.logOf('CLI').filter(e => e.ev.startsWith('merge')).length, 1);
});

test('a device that had not seen the join: its old copy of either workout is joined again', async t => {
  const h = await startServer(t);
  await pair(h);
  // The client's phone, before it pulled the join, wrote the watch's rest heart rate into its own
  // copy of the workout (a later stamp than the join's): its sets came back over the join.
  let s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  const back = JSON.parse(JSON.stringify(s.state));
  const i = back.workouts.findIndex(w => w.id === 'cw-1');
  const tt = Date.now() + 10;
  back.workouts[i] = { ...clientW(), gymMerge: back.workouts[i].gymMerge, _ts: tt, _f: { ...back.workouts[i]._f, entries: tt } };
  back.workouts[i].entries[0].sets[0].restHr = { avg: 112, max: 128 };
  assert.equal((await h.req('PUT', '/api/data', { jar: h.cli, body: { state: back, baseRev: s.rev, stamped: true } })).status, 200);
  s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  let j = s.state.workouts.find(w => w.id === 'cw-1');
  assert.deepEqual(j.entries.map(e => e.id), ['0025', '0027']);
  assert.deepEqual(j.entries[0].sets[0], { w: 80, r: 8, done: true, at: at(12), hr: { avg: 121, max: 134 }, restHr: { avg: 112, max: 128 } });
  assert.ok(j._f.entries > tt);
  // The trainer's phone, before it pulled, edited its workout (later than the removal): it is back
  // in the document, and joined again with the correction, then removed again.
  const t2 = Date.now() + 20;
  const again = { ...s.state, workouts: [...s.state.workouts, trainerW({ _ts: t2, entries: [...trainerW().entries, { id: '0099', sets: [{ w: 20, r: 15, done: true, at: at(50) }] }] })] };
  assert.equal((await h.req('PUT', '/api/data', { jar: h.tr, body: { state: again, baseRev: s.rev, stamped: true } })).status, 200);
  s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.deepEqual(s.state.workouts.map(w => w.id), ['old', 'cw-1']);
  j = s.state.workouts.find(w => w.id === 'cw-1');
  assert.deepEqual(j.entries.map(e => e.id), ['0025', '0027', '0099']);
  assert.ok(s.state.deleted.workouts['tw-1'] > t2);
  assert.deepEqual(h.logOf('CLI').filter(e => e.ev.startsWith('merge')).map(e => e.ev), ['merge', 'merge-again', 'merge-again']);
});

test('Undo: both workouts as they were, and they are not joined again', async t => {
  const h = await startServer(t);
  await pair(h);
  const m = h.gym().merges[0];
  // While leading it is refused; a client cannot undo; the trainer in their own account can.
  assert.equal((await h.req('POST', '/api/gymv2/merge/undo', { jar: h.tr, body: { id: m.id } })).status, 403);
  await h.req('POST', '/api/gymv2/act/end', { jar: h.tr, body: {} });
  assert.equal((await h.req('POST', '/api/gymv2/merge/undo', { jar: h.cli, body: { id: m.id } })).status, 403);
  const u = await h.req('POST', '/api/gymv2/merge/undo', { jar: h.tr, body: { id: m.id } });
  assert.equal(u.status, 200);
  assert.deepEqual(u.body.merges, []);
  let s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.deepEqual(s.state.workouts.map(w => w.id).sort(), ['cw-1', 'old', 'tw-1']);
  const c = s.state.workouts.find(w => w.id === 'cw-1'), tw = s.state.workouts.find(w => w.id === 'tw-1');
  assert.deepEqual(c.entries, clientW().entries);
  assert.equal(c.gymMerge, undefined);
  assert.equal(c.hr.src, 'ah');
  assert.deepEqual(tw.entries, trainerW().entries);
  assert.ok(s.state.deleted.workouts['tw-1'] < 0, 'the trainer\'s workout is on record as added back');
  // A further push of the client does not join them again.
  assert.equal((await h.req('PUT', '/api/data', { jar: h.cli, body: { state: s.state, baseRev: s.rev, stamped: true } })).status, 200);
  s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.equal(s.state.workouts.length, 3);
  assert.equal((await h.req('POST', '/api/gymv2/merge/undo', { jar: h.tr, body: { id: m.id } })).status, 409);
  assert.deepEqual(h.logOf('CLI').filter(e => e.ev.startsWith('merge')).map(e => e.ev), ['merge', 'merge-undo']);
});

test('more than one workout fits: nothing is joined, the log says so once', async t => {
  const h = await startServer(t);
  await h.req('PUT', '/api/data', { jar: h.cli, body: { state: { ...base, workouts: [clientW(), clientW({ id: 'cw-2', start: at(5), end: at(58) })] }, baseRev: 0, stamped: true } });
  await h.req('POST', '/api/gymv2/act', { jar: h.tr, body: { id: 'CLI' } });
  let s = (await h.req('GET', '/api/data', { jar: h.tr })).body;
  assert.equal((await h.req('PUT', '/api/data', { jar: h.tr, body: { state: { ...s.state, workouts: [...s.state.workouts, trainerW()] }, baseRev: s.rev, stamped: true } })).status, 200);
  s = (await h.req('GET', '/api/data', { jar: h.tr })).body;
  assert.equal((await h.req('PUT', '/api/data', { jar: h.tr, body: { state: { ...s.state, restSec: 90 }, baseRev: s.rev, stamped: true } })).status, 200);
  s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.equal(s.state.workouts.length, 3);
  const skips = h.logOf('CLI').filter(e => e.ev === 'merge-skip');
  assert.equal(skips.length, 1);
  assert.deepEqual(skips[0].clients, ['cw-1', 'cw-2']);
  assert.deepEqual(h.gym().merges || [], []);
});

test('GYM_MERGE off: nothing is joined', async t => {
  const h = await startServer(t, { env: { GYM_MERGE: '' } });
  await pair(h);
  const s = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  assert.equal(s.state.workouts.length, 3);
  assert.equal(fs.existsSync(path.join(h.dataDir, 'gymv2-merged')), false);
  assert.equal((await h.req('GET', '/api/gymv2/status', { jar: h.tr })).body.merge, false);
  await h.req('POST', '/api/gymv2/act/end', { jar: h.tr, body: {} });
  assert.equal((await h.req('POST', '/api/gymv2/merge/undo', { jar: h.tr, body: { id: 'x' } })).status, 404);
});
