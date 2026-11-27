/* Habcore Gym (patch 0014, kl12): the phone app signs in with the site's name and password, no
   pairing. /api/app/* answer a Bearer token in the body and set no cookie, from the app's own
   WebView origin; signing out revokes that token; a recovery code sets a new password; pairing is
   off unless PAIRING=1. Real server.js in a child, the harness of server-password.test.js. */
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
const ORIGIN = 'https://gym.example';
const APP = 'capacitor://localhost';
const GOOD = 'correct horse battery staple';
let pwHash;
before(async () => { pwHash = await hashPassword(GOOD); });

async function startServer(t, { env = {}, users = [], invites = [], deviceLinks = [] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-app-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites, deviceLinks }));
  const e = { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'gym.example', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', ...env };
  delete e.PAIRING;
  Object.assign(e, env);
  const child = spawn(process.execPath, ['server.js'], { cwd: API, stdio: ['ignore', 'pipe', 'pipe'], env: e });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.port = await boundPort(child, () => h.log);
  h.api = `http://127.0.0.1:${h.port}`;
  let n = 0;
  const ip = `10.9.${Math.floor(Math.random() * 200)}.${1 + Math.floor(Math.random() * 200)}`;
  h.post = (p, body, headers = {}) => fetch(h.api + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: APP, 'X-Forwarded-For': ip, ...headers }, body: JSON.stringify(body || {}) });
  h.get = (p, headers = {}) => fetch(h.api + p, { headers: { Origin: APP, 'X-Forwarded-For': ip, ...headers } });
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  return h;
}
const ada = () => ({ id: 'u_ada', name: 'Ada', created: new Date().toISOString(), pw: { h: pwHash, set: new Date().toISOString() } });

test('app login from the WebView origin answers a bearer and no cookie; the bearer works; wrong password 401', async t => {
  const h = await startServer(t, { users: [ada()] });
  const bad = await h.post('/api/app/login', { identifier: 'Ada', password: 'wrong password here' });
  assert.equal(bad.status, 401);
  const r = await h.post('/api/app/login', { identifier: 'ada', password: GOOD });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('set-cookie'), null);
  const { token, user } = await r.json();
  assert.equal(user.id, 'u_ada');
  assert.ok(token);
  const me = await h.get('/api/me', { Authorization: 'Bearer ' + token });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.id, 'u_ada');
  // A write with the bearer from the app's origin goes through (no CSRF refusal).
  const put = await fetch(h.api + '/api/logout', { method: 'POST', headers: { Origin: APP, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(put.status, 200);
  // Signed out: that token is revoked for good, and stays revoked after a restart (db.revoked).
  assert.equal((await h.get('/api/me', { Authorization: 'Bearer ' + token })).status, 401);
  assert.equal(h.db().revoked.length, 1);
  // A new sign-in gets a new, working token.
  const again = await (await h.post('/api/app/login', { identifier: 'Ada', password: GOOD })).json();
  assert.equal((await h.get('/api/me', { Authorization: 'Bearer ' + again.token })).status, 200);
});

test('the cookie route still refuses a cross-origin post (login CSRF stays closed)', async t => {
  const h = await startServer(t, { users: [ada()] });
  const r = await h.post('/api/login/password', { identifier: 'Ada', password: GOOD }, { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(r.status, 403);
});

test('app login counts wrong passwords against the account like the site does', async t => {
  const h = await startServer(t, { users: [ada()] });
  let last;
  for (let i = 0; i < 7; i++) last = await h.post('/api/app/login', { identifier: 'Ada', password: 'nope nope nope ' + i });
  assert.equal(last.status, 429);
});

test('app registration takes the invite code and the Terms, and answers a bearer', async t => {
  const h = await startServer(t, { env: { INVITE_ONLY: '1', LEGAL: 'on' }, invites: [{ code: 'ABCD2345', created: new Date().toISOString() }] });
  const noLegal = await h.post('/api/app/register', { name: 'Bob', password: GOOD, code: 'ABCD2345' });
  assert.equal(noLegal.status, 400);
  const noCode = await h.post('/api/app/register', { name: 'Bob', password: GOOD, code: 'WRONG', legal: { v: '2026-11-28', terms: true, health: true } });
  assert.equal(noCode.status, 403);
  const cfg = await (await h.get('/api/config')).json();
  const legal = { v: cfg.legal?.v || '2026-11-28', terms: true, health: true };
  const r = await h.post('/api/app/register', { name: 'Bob', password: GOOD, code: 'abcd2345', legal });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(r.headers.get('set-cookie'), null);
  const { token, user } = await r.json();
  assert.equal(user.name, 'Bob');
  assert.equal((await h.get('/api/me', { Authorization: 'Bearer ' + token })).status, 200);
  assert.ok(h.db().invites[0].usedBy);
});

test('a recovery code sets a new password from the app and signs it in; the code works once', async t => {
  const { createDeviceLink } = await import('../device-link.js');
  const db = { deviceLinks: [] };
  const made = createDeviceLink(db, 'u_ada', Date.now(), 3600000, { kind: 'recovery', by: 'u_admin' });
  const h = await startServer(t, { users: [ada()], deviceLinks: db.deviceLinks });
  assert.equal((await h.post('/api/app/recover', { code: 'WRONG-CODE', next: 'a brand new password' })).status, 400);
  assert.equal((await h.post('/api/app/recover', { code: made.code, next: 'short' })).status, 400);
  const r = await h.post('/api/app/recover', { code: made.code, next: 'a brand new password' });
  assert.equal(r.status, 200, await r.clone().text());
  const { token } = await r.json();
  assert.equal((await h.get('/api/me', { Authorization: 'Bearer ' + token })).status, 200);
  assert.equal((await h.post('/api/app/recover', { code: made.code, next: 'another new password' })).status, 400);
  assert.equal((await h.post('/api/app/login', { identifier: 'Ada', password: 'a brand new password' })).status, 200);
  assert.equal((await h.post('/api/app/login', { identifier: 'Ada', password: GOOD })).status, 401);
});

test('pairing answers 410 unless PAIRING=1; the app routes are absent without PASSWORD_LOGIN', async t => {
  const h = await startServer(t, { users: [ada()] });
  const r = await h.post('/api/pair/redeem', { code: 'ABCDEFGH' });
  assert.equal(r.status, 410);
  assert.equal((await r.json()).code, 'pairing-off');
  const off = await startServer(t, { users: [ada()], env: { PASSWORD_LOGIN: '0' } });
  assert.equal((await off.post('/api/app/login', { identifier: 'Ada', password: GOOD })).status, 404);
});
