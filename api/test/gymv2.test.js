/* Gym mode v2 (local patch 0003, gymv2/index.js): one gym, trainers given by an admin, clients
   made by a trainer or joining with the gym's code, and "lead as client" through an act token
   that is checked on every request. Real server.js in a child, like server-first-user-admin. */
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
import { diffStates } from '../gymv2/index.js';

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
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', INVITE_ONLY: '1', ADMIN_UIDS: '', GYM_V2: 'on', ...env }
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
const people = () => [user('ADM', 'Owner', { admin: true, owner: true }), user('TR1', 'Trener1'), user('TR2', 'Trener2'), user('MEM', 'Ola')];

test('admin gives the trainer role; a trainer makes a client, leads it, and every trainer sees it', async t => {
  const h = await startServer(t, { users: people() });
  const admin = { sid: mint('ADM') }, tr1 = { sid: mint('TR1') }, tr2 = { sid: mint('TR2') }, ola = { sid: mint('MEM') };
  // Not a trainer yet.
  assert.equal((await h.req('GET', '/api/gymv2/clients', { jar: tr1 })).status, 403);
  assert.equal((await h.req('POST', '/api/gymv2/trainer', { jar: tr1, body: { id: 'TR2', trainer: true } })).status, 403);
  for (const id of ['TR1', 'TR2']) assert.equal((await h.req('POST', '/api/gymv2/trainer', { jar: admin, body: { id, trainer: true } })).status, 200);
  assert.equal((await h.req('GET', '/api/gymv2/status', { jar: tr1 })).body.role, 'trainer');

  const made = await h.req('POST', '/api/gymv2/clients', { jar: tr1, body: { name: 'Klient Jan' } });
  assert.equal(made.status, 200);
  const cid = made.body.client.id;
  assert.equal(h.db().users.find(u => u.id === cid).gymVirtual, true);
  assert.equal((await h.req('POST', '/api/gymv2/clients', { jar: tr2, body: { name: 'klient jan' } })).status, 409);
  // The second trainer sees the client at once.
  const list2 = await h.req('GET', '/api/gymv2/clients', { jar: tr2 });
  assert.deepEqual(list2.body.clients.map(c => c.id), [cid]);
  assert.equal(list2.body.clients[0].canLead, true);
  // A plain member sees nothing.
  assert.equal((await h.req('GET', '/api/gymv2/clients', { jar: ola })).status, 403);

  // Lead as client.
  const act = await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: cid } });
  assert.equal(act.status, 200);
  assert.ok(tr1.act);
  const me = await h.req('GET', '/api/me', { jar: tr1 });
  assert.equal(me.body.user.id, cid);
  assert.equal(me.body.user.acting.by.id, 'TR1');
  assert.equal((await h.req('GET', '/api/data', { jar: tr1 })).body.rev, 1, 'starts with the trainer language (patch 0006.1)');
  const S = { unit: 'kg', workouts: [{ id: 'w1', d: '2026-11-26', name: 'Trening A', entries: [{ id: '0001', sets: [{ w: 20, r: 10, done: true }] }] }], routines: [] };
  const put = await h.req('PUT', '/api/data', { jar: tr1, body: { state: S, baseRev: 1 } });
  assert.equal(put.status, 200);
  const S2 = { ...S, workouts: [{ ...S.workouts[0], entries: [{ id: '0001', sets: [{ w: 25, r: 8, done: true }] }] }] };
  assert.equal((await h.req('PUT', '/api/data', { jar: tr1, body: { state: S2, baseRev: (await h.req('GET', '/api/data/rev', { jar: tr1 })).body.rev } })).status, 200);
  const writes = h.logOf(cid).filter(e => e.ev === 'write');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].by.id, 'TR1');
  assert.equal(writes[0].changes.workouts.added[0].id, 'w1');
  assert.equal(writes[1].changes.workouts.changed[0].id, 'w1');

  // Never the client's password, e-mail, passkeys, pairing or deletion.
  for (const [m, p, body] of [
    ['POST', '/api/account/password', { next: 'another good long password' }], ['POST', '/api/account/email', { email: 'x@example.com' }],
    ['POST', '/api/account/delete', {}], ['POST', '/api/pair/create', {}], ['POST', '/api/logout/all', {}],
    ['POST', '/api/account/passkeys/options', {}], ['POST', '/api/gymv2/leave', {}], ['POST', '/api/push/subscribe', {}], ['GET', '/api/tokens', undefined]
  ]) {
    const r = await h.req(m, p, { jar: tr1, body });
    assert.equal(r.status, 403, `${m} ${p} -> ${r.status}`);
    assert.equal(r.body.code, 'acting-forbidden');
  }
  // A paired phone: its bearer plus the act token in a header. Never renewed into a client token.
  const tok = (() => { const p = `TR1:${Date.now() + 3600000}:0:b`; return p + '.' + crypto.createHmac('sha256', SECRET).update(p).digest('base64url'); })();
  const phone = await h.req('GET', '/api/me', { headers: { Authorization: 'Bearer ' + tok, 'X-OpenGym-Act': act.body.token } });
  assert.equal(phone.body.user.id, cid);
  assert.equal(phone.body.token, undefined);
  assert.equal((await h.req('GET', '/api/me', { headers: { Authorization: 'Bearer ' + tok } })).body.user.id, 'TR1');
  // The act token alone is nothing; with another trainer's session it is nothing either.
  assert.equal((await h.req('GET', '/api/me', { jar: { act: tr1.act } })).status, 401);
  assert.equal((await h.req('GET', '/api/me', { jar: { sid: tr2.sid, act: tr1.act } })).body.user.id, 'TR2');
  // The app's account guard: a document asked for under another account is refused.
  assert.equal((await h.req('GET', '/api/data', { jar: tr1, headers: { 'X-OpenGym-As': 'TR1' } })).status, 412);

  // The second trainer leads the same client too.
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: tr2, body: { id: cid } })).status, 200);
  assert.equal((await h.req('GET', '/api/data', { jar: tr2 })).body.state.workouts[0].entries[0].sets[0].w, 25);

  // Back to their own account.
  const end = await h.req('POST', '/api/gymv2/act/end', { jar: tr1, body: {} });
  assert.equal(end.status, 200);
  assert.equal(tr1.act, undefined);
  assert.equal((await h.req('GET', '/api/me', { jar: tr1 })).body.user.id, 'TR1');

  // Taking the trainer role away ends their act token at once.
  assert.equal((await h.req('POST', '/api/gymv2/trainer', { jar: admin, body: { id: 'TR2', trainer: false } })).status, 200);
  assert.equal((await h.req('GET', '/api/me', { jar: tr2 })).body.user.id, 'TR2');
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: tr2, body: { id: cid } })).status, 403);
});

test('invite link: the client sets a password, signs in and has the history; the link is single use', async t => {
  const h = await startServer(t, { users: people() });
  const admin = { sid: mint('ADM') }, tr1 = { sid: mint('TR1') };
  await h.req('POST', '/api/gymv2/trainer', { jar: admin, body: { id: 'TR1', trainer: true } });
  const cid = (await h.req('POST', '/api/gymv2/clients', { jar: tr1, body: { name: 'Kasia' } })).body.client.id;
  await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: cid } });
  await h.req('PUT', '/api/data', { jar: tr1, body: { state: { unit: 'kg', workouts: [{ id: 'w9', d: '2026-11-20', name: 'Nogi', entries: [] }] }, baseRev: 1 } });
  await h.req('POST', '/api/gymv2/act/end', { jar: tr1, body: {} });

  // Nobody can sign in to it before.
  assert.equal((await h.req('POST', '/api/login/password', { body: { name: 'Kasia', password: GOOD } })).status, 401);
  const inv = await h.req('POST', '/api/gymv2/invite', { jar: tr1, body: { id: cid } });
  assert.equal(inv.status, 200);
  const look = await h.req('GET', '/api/gymv2/invite?c=' + inv.body.token);
  assert.equal(look.body.name, 'Kasia');
  assert.equal((await h.req('GET', '/api/gymv2/invite?c=nope')).status, 404);
  const consent = { v: look.body.consent.v, hash: look.body.consent.hash };
  assert.equal((await h.req('POST', '/api/gymv2/invite/claim', { body: { c: inv.body.token, password: 'short', consent } })).body.code, 'too-short');
  // A client's own password needs 8 characters (Habcore Gym; upstream 10): 7 refused, 8 taken.
  assert.equal((await h.req('POST', '/api/gymv2/invite/claim', { body: { c: inv.body.token, password: 'Kot.Las', consent } })).body.code, 'too-short');
  const jar = {};
  const claim = await h.req('POST', '/api/gymv2/invite/claim', { jar, body: { c: inv.body.token, password: 'Kot.Las7', email: 'kasia@example.com', consent } });
  assert.equal(claim.status, 200);
  assert.equal(claim.body.user.id, cid);
  assert.ok(jar.sid);
  assert.equal((await h.req('GET', '/api/data', { jar })).body.state.workouts[0].id, 'w9');
  assert.equal((await h.req('POST', '/api/gymv2/invite/claim', { body: { c: inv.body.token, password: GOOD, consent } })).status, 410);
  assert.equal((await h.req('POST', '/api/login/password', { body: { name: 'Kasia', password: 'Kot.Las7' } })).status, 200);
  assert.equal(h.db().users.find(u => u.id === cid).gymVirtual, undefined);
  // Still in the gym: the trainers keep leading it.
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: cid } })).status, 200);
  assert.equal((await h.req('GET', '/api/me', { jar: tr1 })).body.user.id, cid);
  // An expired link answers 410.
  const d = h.gym(); assert.equal(d.invites[0].usedAt > 0, true);
});

test('own account joins with the gym code: trainers lead it at once; leaving ends it', async t => {
  const h = await startServer(t, { users: people() });
  const admin = { sid: mint('ADM') }, tr1 = { sid: mint('TR1') }, ola = { sid: mint('MEM') };
  await h.req('POST', '/api/gymv2/trainer', { jar: admin, body: { id: 'TR1', trainer: true } });
  const code = (await h.req('POST', '/api/gymv2/code', { jar: tr1, body: {} })).body.code.code;
  assert.match(code, /^SIL-[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal((await h.req('GET', '/api/gymv2/code', { jar: admin })).body.code.code, code);
  const st = (await h.req('GET', '/api/gymv2/status', { jar: ola })).body;
  assert.equal(st.role, 'none');
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: 'MEM' } })).status, 404);
  assert.equal((await h.req('POST', '/api/gymv2/join', { jar: ola, body: { code: 'SIL-AAAAA-AAAAA', consent: { v: st.consent.v, hash: st.consent.hash } } })).status, 404);
  assert.equal((await h.req('POST', '/api/gymv2/join', { jar: ola, body: { code } })).body.code, 'consent-outdated');
  assert.equal((await h.req('POST', '/api/gymv2/join', { jar: ola, body: { code: code.toLowerCase(), consent: { v: st.consent.v, hash: st.consent.hash } } })).status, 200);
  assert.equal(h.gym().members[0].consent.v, 1);
  // Admins and trainers cannot join (nobody may lead their accounts).
  assert.equal((await h.req('POST', '/api/gymv2/join', { jar: admin, body: { code, consent: { v: st.consent.v, hash: st.consent.hash } } })).body.code, 'staff');
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: 'MEM' } })).status, 200);
  assert.equal((await h.req('GET', '/api/me', { jar: tr1 })).body.user.id, 'MEM');
  // Trainers never lead an admin or another trainer.
  assert.equal((await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: 'ADM' } })).status, 404);
  // Leaving the gym ends the access, also of a token already handed out.
  assert.equal((await h.req('POST', '/api/gymv2/leave', { jar: ola, body: {} })).status, 200);
  assert.equal((await h.req('GET', '/api/me', { jar: tr1 })).body.user.id, 'TR1');
  assert.equal((await h.req('GET', '/api/gymv2/clients', { jar: tr1 })).body.clients.length, 0);
});

test('first start seeds the trainers from the upstream gyms, admins excepted', async t => {
  const org = { v: 1, gyms: [{ id: 'g1', name: 'Habcore' }, { id: 'g2', name: 'Other' }], staff: [
    { gymId: 'g1', userId: 'TR1', role: 'trainer' }, { gymId: 'g1', userId: 'TR2', role: 'lead' }, { gymId: 'g2', userId: 'ADM', role: 'trainer' }, { gymId: 'g1', userId: 'MEM', role: 'trainer', until: '2026-01-01' }
  ] };
  const h = await startServer(t, { users: people(), org });
  assert.equal((await h.req('GET', '/api/health')).status, 200);
  const d = h.gym();
  assert.deepEqual(d.trainers.map(x => x.userId).sort(), ['TR1', 'TR2']);
  assert.equal(d.name, 'Habcore');
});

test('gym mode off: every route is 404 and nothing is written', async t => {
  const h = await startServer(t, { users: people(), env: { GYM_V2: '' } });
  assert.equal((await h.req('GET', '/api/gymv2/status', { jar: { sid: mint('ADM') } })).status, 404);
  assert.equal(fs.existsSync(path.join(h.dataDir, 'gymv2.json')), false);
});

test('diffStates names what a write changed', () => {
  const a = { workouts: [{ id: 'w1', d: '2026-01-01', name: 'A', entries: [] }, { id: 'w2', d: '2026-01-02', name: 'B' }], bodyweight: [{ d: '2026-01-01', w: 80 }], unit: 'kg', _rev: 1 };
  const b = { workouts: [{ id: 'w1', d: '2026-01-01', name: 'A2', entries: [] }, { id: 'w3', d: '2026-01-03', name: 'C' }], bodyweight: [{ d: '2026-01-01', w: 80 }], unit: 'lb', _rev: 2 };
  const d = diffStates(a, b);
  assert.deepEqual(d.workouts.added.map(x => x.id), ['w3']);
  assert.deepEqual(d.workouts.removed.map(x => x.id), ['w2']);
  assert.deepEqual(d.workouts.changed.map(x => x.id), ['w1']);
  assert.equal(d.bodyweight, undefined);
  assert.deepEqual(d.other, ['unit']);
  assert.equal(diffStates(a, a), null);
});

// Habcore Gym (patch 0013, api/legal.js): with LEGAL=on a new profile needs the Terms, the Privacy
// policy and the health-data consent; an older profile accepts once; a trainer cannot for a client.
test('LEGAL=on: sign-up needs the acceptance, an older profile accepts once, a trainer cannot for a client', async t => {
  const { LEGAL_VERSION } = await import('../legal.js');
  const ok = { v: LEGAL_VERSION, terms: true, health: true };
  const h = await startServer(t, { users: people(), env: { LEGAL: 'on', INVITE_ONLY: '' } });
  assert.deepEqual((await h.req('GET', '/api/config')).body.legal, { v: LEGAL_VERSION });
  // Password sign-up.
  const reg = body => h.req('POST', '/api/register/password', { body: { name: 'Zosia', password: 'Kot.Las7', ...body } });
  assert.equal((await reg({})).body.code, 'legal-required');
  assert.equal((await reg({ legal: { ...ok, health: false } })).body.code, 'legal-required', 'the health consent is its own box');
  assert.equal((await reg({ legal: { ...ok, v: '2000-01-01' } })).body.code, 'legal-required', 'an old version');
  const r = await reg({ legal: ok });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.legal_ok, true);
  const zosia = h.db().users.find(u => u.name === 'Zosia');
  assert.equal(zosia.legal.v, LEGAL_VERSION); assert.equal(zosia.legal.via, 'register'); assert.ok(Date.parse(zosia.legal.at));
  // Passkey sign-up asks before the options.
  assert.equal((await h.req('POST', '/api/register/options', { body: { name: 'Ula' } })).body.code, 'legal-required');
  assert.equal((await h.req('POST', '/api/register/options', { body: { name: 'Ula', legal: ok } })).status, 200);
  // A profile from before: legal_ok false until it accepts.
  const ola = { sid: mint('MEM') };
  assert.equal((await h.req('GET', '/api/me', { jar: ola })).body.user.legal_ok, false);
  assert.equal((await h.req('POST', '/api/account/legal', { jar: ola, body: {} })).body.code, 'legal-required');
  const acc = await h.req('POST', '/api/account/legal', { jar: ola, body: { legal: ok } });
  assert.equal(acc.status, 200); assert.equal(acc.body.user.legal_ok, true);
  assert.equal(h.db().users.find(u => u.id === 'MEM').legal.via, 'prompt');
  assert.equal((await h.req('GET', '/api/me', { jar: ola })).body.user.legal_ok, true);
  // A trainer leading a client never accepts for them; the client does at take-over.
  const admin = { sid: mint('ADM') }, tr1 = { sid: mint('TR1') };
  await h.req('POST', '/api/gymv2/trainer', { jar: admin, body: { id: 'TR1', trainer: true } });
  const cid = (await h.req('POST', '/api/gymv2/clients', { jar: tr1, body: { name: 'Kasia' } })).body.client.id;
  await h.req('POST', '/api/gymv2/act', { jar: tr1, body: { id: cid } });
  assert.equal((await h.req('GET', '/api/me', { jar: tr1 })).body.user.legal_ok, false);
  assert.equal((await h.req('POST', '/api/account/legal', { jar: tr1, body: { legal: ok } })).status, 403);
  assert.equal(h.db().users.find(u => u.id === cid).legal, undefined);
  await h.req('POST', '/api/gymv2/act/end', { jar: tr1, body: {} });
  const inv = await h.req('POST', '/api/gymv2/invite', { jar: tr1, body: { id: cid } });
  const look = await h.req('GET', '/api/gymv2/invite?c=' + inv.body.token);
  const consent = { v: look.body.consent.v, hash: look.body.consent.hash };
  assert.equal((await h.req('POST', '/api/gymv2/invite/claim', { body: { c: inv.body.token, password: 'Kot.Las7', consent } })).body.code, 'legal-required');
  const claim = await h.req('POST', '/api/gymv2/invite/claim', { jar: {}, body: { c: inv.body.token, password: 'Kot.Las7', consent, legal: ok } });
  assert.equal(claim.status, 200);
  assert.equal(h.db().users.find(u => u.id === cid).legal.via, 'invite');
});

test('LEGAL unset: nothing asked, nothing said', async t => {
  const h = await startServer(t, { users: people(), env: { INVITE_ONLY: '' } });
  assert.equal((await h.req('GET', '/api/config')).body.legal, undefined);
  const r = await h.req('POST', '/api/register/password', { body: { name: 'Zosia', password: 'Kot.Las7' } });
  assert.equal(r.status, 200); assert.equal('legal_ok' in r.body.user, false);
  assert.equal((await h.req('POST', '/api/account/legal', { jar: { sid: mint('MEM') }, body: {} })).status, 404);
});

// Habcore Gym (patch 0013): the AI Coach and the Zepp watch relay are off unless switched on.
test('AI_COACH and ZEPP unset: every Coach route is 410, /api/config has no coach, the watch relay is 410', async t => {
  const h = await startServer(t, { users: people(), env: { AI_COACH: '', ZEPP: '' } });
  const ola = { sid: mint('MEM') }, admin = { sid: mint('ADM') };
  for (const [m, p] of [['GET', '/api/coach/status'], ['POST', '/api/coach/ask'], ['POST', '/api/coach/plan'], ['GET', '/api/coach/disclosure']]) {
    const r = await h.req(m, p, { jar: ola, body: m === 'POST' ? { q: 'hi' } : undefined });
    assert.equal(r.status, 410, p); assert.equal(r.body.code, 'ai-off');
  }
  for (const [m, p] of [['GET', '/api/admin/coach'], ['POST', '/api/admin/coach/config'], ['POST', '/api/admin/coach/connect']]) {
    assert.equal((await h.req(m, p, { jar: admin, body: m === 'POST' ? { provider: 'openrouter' } : undefined })).status, 410, p);
  }
  assert.equal('coach' in (await h.req('GET', '/api/config', { jar: ola })).body, false);
  for (const [m, p] of [['POST', '/api/watch/pair'], ['GET', '/api/watch/links'], ['POST', '/api/watch/redeem'], ['GET', '/api/watch/box']]) {
    const r = await h.req(m, p, { jar: ola, body: m === 'POST' ? {} : undefined });
    assert.equal(r.status, 410, p); assert.equal(r.body.code, 'zepp-off');
  }
});

// Habcore Gym (patch 0013): the calendar feed works without API tokens, and its address carries the
// app's prefix (BASE_PATH): it used to point at the site's root (ORIGIN + /api/...), where nothing answers.
test('calendar feed: on without API_TOKENS, its address under BASE_PATH, a real ICS; tokens are off', async t => {
  const h = await startServer(t, { users: people(), env: { API_TOKENS: '', BASE_PATH: '/opengym' } });
  const ola = { sid: mint('MEM') };
  assert.equal((await h.req('GET', '/api/config', { jar: ola })).body.calendar, true);
  assert.equal((await h.req('GET', '/api/config', { jar: ola })).body.api_tokens, undefined);
  assert.equal((await h.req('POST', '/api/tokens', { jar: ola, body: { name: 'x', scopes: { workouts: 'view' } } })).status, 404);
  const made = await h.req('POST', '/api/calendar', { jar: ola, body: { done: true } });
  assert.equal(made.status, 200);
  assert.match(made.body.url, new RegExp('^' + ORIGIN + '/opengym/api/calendar/ogt_[A-Za-z0-9_-]{43}\\.ics$'));
  const r = await fetch(h.api + made.body.url.slice((ORIGIN + '/opengym').length));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/calendar/);
  const ics = await r.text();
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/); assert.match(ics, /END:VCALENDAR\r\n$/);
});

test('INTEGRATIONS is ignored without HABCORE_INTEGRATIONS: no webhooks, no Strava', async t => {
  const h = await startServer(t, { users: people(), env: { INTEGRATIONS: 'webhook', HABCORE_INTEGRATIONS: '' } });
  const ola = { sid: mint('MEM') };
  assert.equal((await h.req('GET', '/api/config', { jar: ola })).body.integrations, undefined);
  const r = await h.req('POST', '/api/integrations', { jar: ola, body: { provider: 'webhook', url: 'https://example.com/hook' } });
  assert.notEqual(r.status, 200);
});
