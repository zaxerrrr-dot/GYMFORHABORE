/* Workout notes as a thread (Habcore Gym kl14, gymv2/notes.js): the trainer's feed of a client in the
   gym panel and the trainer's notes written there, who may read and write, and the helpers that pick
   the new notes of a write and whom a push goes to. Real server.js in a child, like gymv2-live.test.js. */
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-notes-'));
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


import { addedNotes, trainersOf, applyNote, notePush } from '../gymv2/notes.js';

const W = (id, d, extra = {}) => ({ id, d, start: Date.parse(d + 'T10:00:00Z'), end: Date.parse(d + 'T11:00:00Z'), name: 'Push ' + id, routineIds: [], entries: [{ id: '0025', sets: [{ w: 80, r: 8, done: true }] }], ...extra });

test('notes helpers: new notes of a write, the trainers of a thread, edit rules, the push', () => {
  const cur = { workouts: [W('a', '2026-11-20', { notes: [{ id: 'n1', text: 'hi', at: 1, by: { id: 'TR1', name: 'Tomasz', role: 'trainer' } }] })] };
  const next = JSON.parse(JSON.stringify(cur));
  next.workouts[0].notes.push({ id: 'n2', text: 'thanks', at: 2, by: { id: 'CLI', name: 'S', role: 'self' } });
  next.workouts.push(W('b', '2026-11-21', { note: 'old style', notes: [{ id: 'n0', text: 'old style', at: 1 }] }));
  const got = addedNotes(cur, next);
  assert.deepEqual(got.map(x => x.n.id), ['n2'], 'only the new note; a legacy n0 is never news');
  assert.deepEqual(trainersOf(next.workouts[0]), ['TR1']);
  assert.deepEqual(trainersOf(W('c', '2026-11-22', { led: { kind: 'trainer', id: 'TR9', name: 'X' } })), ['TR9']);
  const w = W('d', '2026-11-23', { note: 'first' });
  const by = { id: 'TR1', name: 'Tomasz', role: 'trainer' };
  const r = applyNote(w, by, { text: 'Good job' });
  assert.ok(r.added && w.notes.length === 2 && w.notes[0].id === 'n0' && w.note === 'first');
  assert.equal(applyNote(w, by, { nid: 'n0', text: 'edit' }), 'not-yours', 'the client\'s own note stays theirs');
  assert.equal(applyNote(w, by, { nid: r.added.id, text: 'Great job' }), 'edited');
  assert.equal(applyNote(w, by, { nid: r.added.id, del: true }), 'deleted');
  assert.ok(w.notes.find(n => n.id === r.added.id).del, 'a deleted note stays as a tombstone');
  assert.equal(applyNote(w, by, { text: '   ' }), 'empty');
  const p = notePush('pl', 'toClient', 'Tomasz', w, 'Brawo');
  assert.match(p.title, /Tomasz dodał\(a\) notatkę/);
  assert.equal(p.url, '#/treningi?w=d');
});

test('gym panel: a trainer reads a client\'s feed and writes notes; others cannot', async t => {
  const h = await startServer(t);
  // The client's own device syncs two workouts.
  const state = { workouts: [W('w1', '2026-11-20', { note: 'Felt strong' }), W('w2', '2026-11-25')], routines: [], unit: 'kg' };
  assert.equal((await h.req('PUT', '/api/data', { jar: h.cli, body: { state } })).status, 200);
  let r = await h.req('GET', '/api/gymv2/client/workouts?id=CLI&n=1', { jar: h.tr });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 2);
  assert.deepEqual(r.body.workouts.map(w => w.id), ['w2'], 'newest first, one page');
  assert.deepEqual(r.body.days.sort(), ['2026-11-20', '2026-11-25']);
  r = await h.req('GET', '/api/gymv2/client/workouts?id=CLI&off=1&n=5', { jar: h.tr });
  assert.deepEqual(r.body.workouts.map(w => w.id), ['w1']);
  assert.equal((await h.req('GET', '/api/gymv2/client/workouts?id=CLI', { jar: h.out })).status, 403, 'not a trainer');
  assert.equal((await h.req('GET', '/api/gymv2/client/workouts?id=CLI', { jar: h.cl2 })).status, 403, 'another client');
  assert.equal((await h.req('GET', '/api/gymv2/client/workouts?id=TR1', { jar: h.admin })).status, 403, 'a trainer is not a client');
  // A note from the panel: into the client's document, the old note kept as the first one.
  r = await h.req('POST', '/api/gymv2/client/note', { jar: h.tr, body: { id: 'CLI', wid: 'w1', text: 'Nice depth today' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.workout.notes.map(n => n.text), ['Felt strong', 'Nice depth today']);
  assert.deepEqual(r.body.workout.notes[1].by, { id: 'TR1', name: 'Tomasz', role: 'trainer' });
  const doc = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  const w1 = (doc.state || doc).workouts.find(w => w.id === 'w1');
  assert.equal(w1.note, 'Felt strong', 'the old field stays the first note');
  assert.equal(w1.notes.length, 2);
  const nid = w1.notes[1].id;
  assert.equal((await h.req('POST', '/api/gymv2/client/note', { jar: h.admin, body: { id: 'CLI', wid: 'w1', nid, text: 'mine now' } })).status, 403, 'only the author edits');
  assert.equal((await h.req('POST', '/api/gymv2/client/note', { jar: h.tr, body: { id: 'CLI', wid: 'w1', nid, text: 'Nice depth!' } })).status, 200);
  assert.equal((await h.req('POST', '/api/gymv2/client/note', { jar: h.tr, body: { id: 'CLI', wid: 'nope', text: 'x' } })).status, 404);
  assert.equal((await h.req('POST', '/api/gymv2/client/note', { jar: h.out, body: { id: 'CLI', wid: 'w1', text: 'x' } })).status, 403);
  assert.ok(h.logOf('CLI').some(e => e.ev === 'note' && e.by.id === 'TR1'), 'logged with the trainer');
  // The client answers from their own device: a normal sync write, nothing refused.
  const mine = (await h.req('GET', '/api/data', { jar: h.cli })).body;
  const st2 = mine.state || mine;
  st2.workouts.find(w => w.id === 'w1').notes.push({ id: 'nc1', text: 'Thanks!', at: Date.now(), by: { id: 'CLI', name: 'Sylwester', role: 'self' } });
  assert.equal((await h.req('PUT', '/api/data', { jar: h.cli, body: { state: st2 } })).status, 200);
  r = await h.req('GET', '/api/gymv2/client/workouts?id=CLI', { jar: h.tr });
  assert.deepEqual(r.body.workouts.find(w => w.id === 'w1').notes.filter(n => !n.del).map(n => n.text), ['Felt strong', 'Nice depth!', 'Thanks!']);
  assert.doesNotMatch(h.log, /notes push/, 'the push step never failed');
});
