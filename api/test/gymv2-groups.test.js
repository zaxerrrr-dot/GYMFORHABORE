/* Saved groups (local patch 0006.2, gymv2/index.js): a trainer saves a group of clients for the
   whole gym; only the gym's clients can be in one; someone who leaves the gym (or is taken out,
   becomes a trainer, is deleted) is taken out of every group; every change is in the people's
   change logs. Real server.js in a child, like gymv2.test.js. */
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
const GOOD = 'correct horse battery staple';
let pwHash;
before(async () => { pwHash = await hashPassword(GOOD); });

const mint = (uid, sv = 0) => {
  const payload = `${uid}:${Date.now() + 86400000}:${sv}:c`;
  return payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function startServer(t, { env = {}, users = [], org = null } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-v2-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }));
  if (org) fs.writeFileSync(path.join(dataDir, 'org.json'), JSON.stringify(org));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', INVITE_ONLY: '1', ADMIN_UIDS: '', GYM_V2: 'on', GYM_LIVE: 'on', ...env }
  });
  const h = { log: '', dataDir };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  h.api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  // `jar`: { sid, act } cookies of one browser.
  h.req = async (method, p, { body, jar = {}, ip = '198.51.100.1', headers = {} } = {}) => {
    const cookie = [jar.sid ? 'gymsid=' + jar.sid : null, jar.act ? 'gymact=' + jar.act : null].filter(Boolean).join('; ');
    const r = await fetch(`${h.api}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Forwarded-For': ip, ...(cookie ? { Cookie: cookie } : {}), ...headers },
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
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  h.gym = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'gymv2.json'), 'utf8'));
  h.logOf = uid => { try { return fs.readFileSync(path.join(dataDir, 'gymv2-log', uid + '.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)); } catch { return []; } };
  return h;
}
const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), pw: { h: pwHash, set: new Date().toISOString() }, ...extra });
const people = () => [user('ADM', 'Owner', { admin: true, owner: true }), user('TR1', 'Trener1'), user('TR2', 'Trener2'), user('MEM', 'Ola'), user('OUT', 'Obcy')];

async function gym(t) {
  const h = await startServer(t, { users: people() });
  const admin = { sid: mint('ADM') }, tr1 = { sid: mint('TR1') }, tr2 = { sid: mint('TR2') }, ola = { sid: mint('MEM') }, out = { sid: mint('OUT') };
  for (const id of ['TR1', 'TR2']) assert.equal((await h.req('POST', '/api/gymv2/trainer', { jar: admin, body: { id, trainer: true } })).status, 200);
  const code = (await h.req('POST', '/api/gymv2/code', { jar: tr1, body: {} })).body.code.code;
  const st = (await h.req('GET', '/api/gymv2/status', { jar: ola })).body;
  assert.equal((await h.req('POST', '/api/gymv2/join', { jar: ola, body: { code, consent: { v: st.consent.v, hash: st.consent.hash } } })).status, 200);
  const ids = {};
  for (const n of ['Bartek', 'Sylwek', 'Ania', 'Kuba', 'Ewa', 'Marek', 'Zosia']) ids[n] = (await h.req('POST', '/api/gymv2/clients', { jar: tr1, body: { name: n } })).body.client.id;
  ids.Ola = 'MEM';
  return { h, admin, tr1, tr2, ola, out, ids };
}

test('a trainer saves a group; every trainer sees, edits and deletes it; the change logs say so', async t => {
  const { h, tr1, tr2, ids } = await gym(t);
  assert.equal((await h.req('GET', '/api/gymv2/clients', { jar: tr2 })).body.clients.length, 8, 'the full list: all 8 clients');
  const made = await h.req('POST', '/api/gymv2/groups', { jar: tr1, body: { name: '  Bartek  +  Sylwek ', members: [ids.Bartek, ids.Sylwek, ids.Bartek] } });
  assert.equal(made.status, 200);
  const gid = made.body.group.id;
  assert.equal(made.body.group.name, 'Bartek + Sylwek');
  assert.deepEqual(made.body.group.members.map(m => m.name), ['Bartek', 'Sylwek']);
  // The second trainer sees it at once.
  const l2 = await h.req('GET', '/api/gymv2/groups', { jar: tr2 });
  assert.deepEqual(l2.body.groups.map(g => [g.id, g.name, g.by.name]), [[gid, 'Bartek + Sylwek', 'Trener1']]);
  for (const n of ['Bartek', 'Sylwek']) assert.deepEqual(h.logOf(ids[n]).filter(e => e.ev.startsWith('group')).map(e => [e.ev, e.group.name, e.by.id]), [['group-create', 'Bartek + Sylwek', 'TR1']]);
  // The second trainer renames it and changes the people: Sylwek out, Ania and Ola in.
  const up = await h.req('POST', '/api/gymv2/groups/update', { jar: tr2, body: { id: gid, name: 'Poniedziałek 18:00', members: [ids.Bartek, ids.Ania, 'MEM'] } });
  assert.equal(up.status, 200);
  assert.equal(up.body.changed, true);
  assert.deepEqual(up.body.group.members.map(m => m.name).sort(), ['Ania', 'Bartek', 'Ola']);
  assert.equal(up.body.group.updatedBy.name, 'Trener2');
  const last = uid => h.logOf(uid).filter(e => e.ev.startsWith('group')).pop();
  assert.deepEqual([last(ids.Bartek).ev, last(ids.Bartek).from, last(ids.Bartek).added, last(ids.Bartek).removed, last(ids.Bartek).by.id], ['group-edit', 'Bartek + Sylwek', 2, 1, 'TR2']);
  assert.equal(last(ids.Sylwek).ev, 'group-remove');
  assert.equal(last(ids.Ania).ev, 'group-add');
  assert.equal(last('MEM').ev, 'group-add');
  // The same again: nothing changes, nothing logged.
  const n0 = h.logOf(ids.Bartek).length;
  assert.equal((await h.req('POST', '/api/gymv2/groups/update', { jar: tr1, body: { id: gid, name: 'Poniedziałek 18:00' } })).body.changed, false);
  assert.equal(h.logOf(ids.Bartek).length, n0);
  // Delete (the first trainer).
  assert.equal((await h.req('POST', '/api/gymv2/groups/delete', { jar: tr1, body: { id: gid } })).status, 200);
  assert.deepEqual((await h.req('GET', '/api/gymv2/groups', { jar: tr2 })).body.groups, []);
  assert.equal(last(ids.Ania).ev, 'group-delete');
  assert.equal((await h.req('POST', '/api/gymv2/groups/delete', { jar: tr1, body: { id: gid } })).status, 404);
  assert.deepEqual(h.gym().groups, []);
});

test('only the gym\'s clients, 2-5 people, a name; only trainers; never while leading', async t => {
  const { h, admin, tr1, ola, out, ids } = await gym(t);
  const mk = (jar, body) => h.req('POST', '/api/gymv2/groups', { jar, body });
  assert.equal((await mk(tr1, { name: 'X', members: [ids.Bartek] })).body.code, 'group-size');
  assert.equal((await mk(tr1, { name: 'X', members: Object.values(ids).slice(0, 6) })).body.code, 'group-size');
  assert.equal((await mk(tr1, { name: '   ', members: [ids.Bartek, ids.Sylwek] })).body.code, 'group-name');
  for (const bad of ['OUT', 'TR2', 'ADM', 'nope']) {
    const r = await mk(tr1, { name: 'X', members: [ids.Bartek, bad] });
    assert.equal(r.status, 403, bad); assert.equal(r.body.code, 'group-not-client');
  }
  // A client and someone outside the gym: nothing.
  for (const jar of [ola, out]) {
    assert.equal((await h.req('GET', '/api/gymv2/groups', { jar })).status, 403);
    assert.equal((await mk(jar, { name: 'X', members: [ids.Bartek, ids.Sylwek] })).status, 403);
  }
  assert.equal((await h.req('GET', '/api/gymv2/groups')).status, 401);
  // An admin is staff: may.
  const gid = (await mk(admin, { name: 'Admina', members: [ids.Bartek, ids.Sylwek] })).body.group.id;
  // While leading one client: no groups at all.
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: ids.Bartek } })).status, 200);
  assert.equal((await h.req('GET', '/api/gymv2/groups', { jar: tr1 })).status, 403);
  assert.equal((await h.req('POST', '/api/gymv2/groups/delete', { jar: tr1, body: { id: gid } })).status, 403);
  await h.req('POST', '/api/gymv2/act/end', { jar: tr1, body: {} });
  // Editing in a non-client is refused, and the group stays as it was.
  assert.equal((await h.req('POST', '/api/gymv2/groups/update', { jar: tr1, body: { id: gid, members: [ids.Bartek, 'OUT'] } })).status, 403);
  assert.deepEqual(h.gym().groups[0].members, [ids.Bartek, ids.Sylwek]);
});

test('someone who leaves the gym, is taken out or is deleted leaves every group', async t => {
  const { h, admin, tr1, tr2, ola, ids } = await gym(t);
  const mk = (name, members) => h.req('POST', '/api/gymv2/groups', { jar: tr1, body: { name, members } }).then(r => r.body.group.id);
  const g1 = await mk('A', ['MEM', ids.Bartek, ids.Sylwek]);
  const g2 = await mk('B', ['MEM', ids.Ania, ids.Kuba, ids.Ewa]);
  const names = async () => Object.fromEntries((await h.req('GET', '/api/gymv2/groups', { jar: tr2 })).body.groups.map(g => [g.id, g.members.map(m => m.name).sort()]));
  // Ola leaves the gym herself.
  assert.equal((await h.req('POST', '/api/gymv2/leave', { jar: ola, body: {} })).status, 200);
  assert.deepEqual(await names(), { [g1]: ['Bartek', 'Sylwek'], [g2]: ['Ania', 'Ewa', 'Kuba'] });
  assert.equal(h.gym().groups.some(g => g.members.includes('MEM')), false);
  assert.equal(h.logOf(ids.Bartek).filter(e => e.ev === 'group-edit').pop().why, 'member-left');
  // An admin takes Kuba out of the gym; Ania's account is deleted.
  assert.equal((await h.req('POST', '/api/gymv2/members/remove', { jar: admin, body: { id: ids.Kuba } })).status, 200);
  assert.equal((await h.req('POST', '/api/admin/user/delete', { jar: admin, body: { id: ids.Ania } })).status, 200);
  assert.deepEqual((await names())[g2], ['Ewa']);
  // A group of one cannot be started, but it stays to be edited.
  assert.equal((await h.req('POST', '/api/gymv2/groups/update', { jar: tr2, body: { id: g2, members: [ids.Ewa, ids.Marek] } })).status, 200);
  assert.deepEqual((await names())[g2], ['Ewa', 'Marek']);
});

test('a client reading their own change log does not see the group\'s name (other people\'s names)', async t => {
  const { h, tr1, ola, ids } = await gym(t);
  await h.req('POST', '/api/gymv2/groups', { jar: tr1, body: { name: 'Ola + Bartek', members: ['MEM', ids.Bartek] } });
  const own = (await h.req('GET', '/api/gymv2/log', { jar: ola })).body.log.find(e => e.ev === 'group-create');
  assert.ok(own);
  assert.equal(own.group.name, undefined);
  assert.equal(JSON.stringify(own).includes('Bartek'), false);
  // The trainer sees it.
  assert.equal((await h.req('GET', '/api/gymv2/log?id=MEM', { jar: tr1 })).body.log.find(e => e.ev === 'group-create').group.name, 'Ola + Bartek');
  // kl6.3: the same log at the ad-block-safe address (EasyPrivacy blocks "/log?id=").
  assert.equal((await h.req('GET', '/api/gymv2/changes?u=MEM', { jar: tr1 })).body.log.find(e => e.ev === 'group-create').group.name, 'Ola + Bartek');
  assert.equal((await h.req('GET', '/api/gymv2/changes', { jar: ola })).body.log.find(e => e.ev === 'group-create').group.name, undefined);
  assert.equal((await h.req('GET', '/api/gymv2/changes?u=' + ids.Bartek, { jar: ola })).status, 404);
  // The client cannot read Bartek's log.
  assert.equal((await h.req('GET', '/api/gymv2/log?id=' + ids.Bartek, { jar: ola })).status, 404);
});

test('groups off with GYM_LIVE off: 404', async t => {
  const h = await startServer(t, { users: people(), env: { GYM_LIVE: '' } });
  assert.equal((await h.req('GET', '/api/gymv2/groups', { jar: { sid: mint('ADM') } })).status, 404);
});
