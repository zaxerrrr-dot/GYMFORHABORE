/* Sessions a trainer plans at a time of day (Habcore Gym kl16, sessions-core.js, gymv2/sessions.js):
   the rules (Warsaw wall time to UTC across summer/winter time, repeats, edits of one or the series,
   cancelling, merging copies), the calendar feed's timed events, and the routes end to end against
   the real server.js in a child: who may plan for whom, the client's document, the trainer's
   schedule and feed, a phone that never heard of a session not dropping it. */
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-sess-'));
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



import * as core from '../sessions-core.js';
import { buildIcs, buildTrainerIcs, CANCEL_SHOWN_MS } from '../integrations/calendar.js';
import { stampPut } from '../sync-stamps.js';
import { changePushes, remindersDue, remindPush } from '../gymv2/sessions.js';

const TR = { id: 'TR1', name: 'Tomasz', role: 'trainer' };
const iso = ms => new Date(ms).toISOString();
const unfold = x => x.replace(/\r\n /g, '');

test('sessions-core: the api copy is the frontend file, byte for byte', () => {
  const fe = path.join(API, '..', 'frontend', 'src', 'lib', 'sessions-core.js');
  if (!fs.existsSync(fe)) return;
  assert.equal(fs.readFileSync(path.join(API, 'sessions-core.js'), 'utf8'), fs.readFileSync(fe, 'utf8'));
});

test('wall time in Poraj to UTC: winter, summer, the night the clock jumps and the one it repeats', () => {
  assert.equal(iso(core.wallToUtc('2026-12-01', '18:00')), '2026-12-01T17:00:00.000Z');
  assert.equal(iso(core.wallToUtc('2027-07-01', '18:00')), '2027-07-01T16:00:00.000Z');
  // 28 Mar 2027: 02:00 -> 03:00. The Monday before and after keep 18:00 on the wall.
  assert.equal(iso(core.wallToUtc('2027-03-22', '18:00')), '2027-03-22T17:00:00.000Z');
  assert.equal(iso(core.wallToUtc('2027-03-29', '18:00')), '2027-03-29T16:00:00.000Z');
  assert.equal(iso(core.wallToUtc('2027-03-28', '02:30')), '2027-03-28T01:30:00.000Z', 'a skipped time reads after the jump (03:30)');
  // 25 Oct 2026: 03:00 -> 02:00.
  assert.equal(iso(core.wallToUtc('2026-10-24', '18:00')), '2026-10-24T16:00:00.000Z');
  assert.equal(iso(core.wallToUtc('2026-10-26', '18:00')), '2026-10-26T17:00:00.000Z');
  assert.deepEqual(core.utcToWall(Date.parse('2027-03-29T16:00:00Z')), { d: '2027-03-29', t: '18:00' });
  assert.ok(Number.isNaN(core.wallToUtc('2026-12-01', '25:00')));
});

test('repeat: weekdays for N weeks or until a day; edit one, edit the series from one on, cancel', () => {
  assert.deepEqual(core.seriesDates({ d: '2026-12-01', days: [1, 3], weeks: 2 }), ['2026-12-02', '2026-12-07', '2026-12-09', '2026-12-14']);
  assert.deepEqual(core.seriesDates({ d: '2026-12-01', days: [2], until: '2026-12-15' }), ['2026-12-01', '2026-12-08', '2026-12-15']);
  assert.ok(core.seriesDates({ d: '2026-01-01', days: [0, 1, 2, 3, 4, 5, 6], weeks: 52 }).length <= core.SERIES_MAX);
  const add = core.applySessionOp([], { op: 'add', d: '2026-12-01', t: '18:00', dur: 45, rid: 'r1', rname: 'Upper', note: 'Bring a towel', tr: TR, rep: { days: [2, 4], weeks: 3 } }, TR, 1000);
  assert.equal(add.changed.length, 6);
  assert.ok(add.list.every(s => s.sid === add.list[0].sid && s.dur === 45 && s.tz === 'Europe/Warsaw' && s.tr.name === 'Tomasz' && s.seq === 0));
  assert.equal(new Set(add.list.map(s => s.id)).size, 6, 'every occurrence its own id');
  const third = add.list[2];
  const one = core.applySessionOp(add.list, { op: 'edit', id: add.list[1].id, scope: 'one', d: '2026-12-04', t: '07:30' }, TR, 2000);
  const moved = one.list.find(s => s.id === add.list[1].id);
  assert.equal(moved.d + ' ' + moved.t, '2026-12-04 07:30'); assert.equal(moved.seq, 1); assert.equal(moved.mod, 2000); assert.equal(moved.sid, undefined, 'a moved day leaves the series');
  const ser = core.applySessionOp(one.list, { op: 'edit', id: third.id, scope: 'series', t: '19:00', note: '' }, TR, 3000);
  assert.deepEqual(ser.list.map(s => s.t), ['18:00', '07:30', '19:00', '19:00', '19:00', '19:00']);
  assert.ok(ser.list.filter(s => s.t === '19:00').every(s => !s.note && s.seq === 1));
  assert.deepEqual(core.sessionChanges(one.list, ser.list).map(x => x.kind), ['changed', 'changed', 'changed', 'changed']);
  const cx = core.applySessionOp(ser.list, { op: 'cancel', id: ser.list[4].id, scope: 'series' }, TR, 4000);
  assert.equal(cx.list.filter(s => s.cx).length, 2);
  assert.deepEqual(core.sessionChanges(ser.list, cx.list).map(x => x.kind), ['cancelled', 'cancelled']);
  assert.equal(core.applySessionOp(cx.list, { op: 'edit', id: cx.list[5].id, t: '10:00' }, TR, 5000).error, 'cancelled');
  assert.equal(core.applySessionOp([], { op: 'add', d: '2026-12-01', t: '9:00' }, TR).error, 'bad-time');
});

test('merge: per occurrence the one changed last; tombstones win over an old copy; pruning by date', () => {
  const a = core.applySessionOp([], { op: 'add', d: '2026-12-01', t: '18:00', tr: TR }, TR, 1000).list;
  const b = core.applySessionOp(a, { op: 'cancel', id: a[0].id }, TR, 2000).list;
  const c = core.applySessionOp(a, { op: 'add', d: '2026-12-02', t: '08:00', tr: TR }, TR, 1500).list;
  const m = core.mergeSessions(c, b);
  assert.equal(m.length, 2); assert.ok(m.find(s => s.id === a[0].id).cx, 'the cancellation is kept');
  assert.deepEqual(core.mergeSessions(b, c), m, 'the same both ways');
  const old = [{ ...a[0], d: '2026-01-01' }, { ...a[0], id: 'x2', cx: 1 }];
  assert.equal(core.pruneSessions(old, '2026-12-01', Date.parse('2026-12-01')).length, 0);
});

test('PUT stamping keeps a trainer\'s session a phone never heard of (and an app from before kl16)', () => {
  const s = core.applySessionOp([], { op: 'add', d: '2026-12-01', t: '18:00', tr: TR }, TR, Date.now()).list;
  const cur = { _rev: 4, workouts: [], sessions: s };
  for (const stamped of [true, false]) {
    const report = {};
    const next = stampPut(cur, { workouts: [{ id: 'w', d: '2026-12-01' }] }, { stamped, overRead: true, report });
    assert.equal(next.sessions.length, 1); assert.equal(report.changed, true, 'the writer is told to read again');
  }
  const report = {};
  stampPut(cur, { workouts: [], sessions: s }, { stamped: true, report });
  assert.notEqual(report.changed, true, 'nothing put back, nothing to read');
});

test('calendar feed: timed events in UTC, stable UID, SEQUENCE and LAST-MODIFIED, cancelled then gone', () => {
  const now = Date.parse('2027-03-20T10:00:00Z');
  let list = core.applySessionOp([], { op: 'add', d: '2027-03-22', t: '18:00', rname: 'Upper; full, body', note: 'Bez kofeiny\nwieczorem', tr: TR, rep: { days: [1], weeks: 2 } }, TR, now - 5000).list;
  const S = { lang: 'pl', routines: [], week: {}, sessions: list };
  const ics = unfold(buildIcs(S, { uid: 'CLI', now }));
  assert.match(ics, /X-PUBLISHED-TTL:PT1H\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H/);
  assert.match(ics, /DTSTART:20270322T170000Z\r\nDTEND:20270322T180000Z/, 'winter: 18:00 is 17:00Z');
  assert.match(ics, /DTSTART:20270329T160000Z\r\nDTEND:20270329T170000Z/, 'summer: 18:00 is 16:00Z');
  assert.match(ics, /SUMMARY:Trening z trenerem Tomasz – Habcore Gym/);
  assert.match(ics, /LOCATION:Habcore\\, ul\. Mickiewicza 25J\\, 42-360 Poraj/);
  assert.match(ics, /DESCRIPTION:Plan: Upper\\; full\\, body\\nProwadzi: Tomasz\\nNotatka: Bez kofeiny\\nwi/);
  const uid = id => new RegExp('UID:sess-' + id + '-c-CLI@habcore-gym');
  assert.match(ics, uid(list[0].id)); assert.match(ics, /SEQUENCE:0/);
  list = core.applySessionOp(list, { op: 'edit', id: list[0].id, scope: 'one', t: '19:15' }, TR, now - 1000).list;
  const ics2 = unfold(buildIcs({ ...S, sessions: list }, { uid: 'CLI', now }));
  const ev = ics2.split('BEGIN:VEVENT').find(x => uid(list[0].id).test(x));
  assert.match(ev, /SEQUENCE:1/); assert.match(ev, /LAST-MODIFIED:20270320T095959Z/); assert.match(ev, /DTSTART:20270322T181500Z/);
  list = core.applySessionOp(list, { op: 'cancel', id: list[1].id }, TR, now).list;
  const ics3 = unfold(buildIcs({ ...S, sessions: list }, { uid: 'CLI', now }));
  const ev3 = ics3.split('BEGIN:VEVENT').find(x => uid(list[1].id).test(x));
  assert.match(ev3, /STATUS:CANCELLED/); assert.match(ev3, /SUMMARY:Odwołany: /); assert.match(ev3, /SEQUENCE:1/);
  assert.doesNotMatch(buildIcs({ ...S, sessions: list }, { uid: 'CLI', now: now + CANCEL_SHOWN_MS + 1000 }), uid(list[1].id), 'gone from the feed');
  assert.match(buildIcs({ ...S, lang: 'en', sessions: list }, { uid: 'CLI', now }), /SUMMARY:Workout with Tomasz – Habcore Gym/);
  // The trainer's feed: the client's first name and the plan, no note.
  const ticsRaw = buildTrainerIcs(list.map(s => ({ ...s, client: { id: 'CLI', name: 'Sylwester Kowalski' } })), { uid: 'TR1', now, lang: 'pl', name: 'Tomasz' });
  const tics = unfold(ticsRaw);
  assert.match(tics, /SUMMARY:Trening: Sylwester · Upper\\; full\\, body – Habcore Gym/);
  assert.doesNotMatch(tics, /kofeiny|Kowalski/);
  assert.match(tics, /X-WR-CALNAME:Habcore Gym · grafik Tomasz/);
  // Every line is folded at 75 octets.
  for (const l of ticsRaw.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, l);
});

test('pushes: a series is one message; the reminder an hour before, once', () => {
  const list = core.applySessionOp([], { op: 'add', d: '2026-12-01', t: '18:00', rname: 'Upper', tr: TR, rep: { days: [2, 4], weeks: 2 } }, TR, 1).list;
  const p = changePushes('pl', 'Tomasz', core.sessionChanges([], list));
  assert.equal(p.length, 1); assert.equal(p[0].title, 'Tomasz zaplanował(a) 4 treningów'); assert.match(p[0].body, /18:00 · Upper/); assert.match(p[0].url, /^#\/home\?sess=/);
  const start = core.sessionStart(list[0]);
  const S = { sessions: list, reminder: {} };
  assert.equal(remindersDue(S, start - 61 * 60000, new Set()).length, 0);
  const due = remindersDue(S, start - 59 * 60000, new Set());
  assert.equal(due.length, 1);
  assert.equal(remindersDue(S, start - 58 * 60000, new Set([due[0].key])).length, 0, 'once');
  assert.equal(remindersDue({ ...S, reminder: { sessBefore: 0 } }, start - 59 * 60000, new Set()).length, 0, 'off');
  assert.equal(remindersDue({ ...S, reminder: { sessBefore: 15 } }, start - 14 * 60000, new Set()).length, 1);
  assert.equal(remindPush('pl', list[0]).title, 'Trening z trenerem Tomasz o 18:00');
});

test('routes: a trainer plans for a client of the gym; the client sees them; feeds; who may not', async t => {
  const h = await startServer(t);
  const { tr, cli, cl2, out, admin } = h;
  // A client has no document yet: the trainer's first session starts one.
  const d = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  let r = await h.req('POST', '/api/gymv2/client/session', { jar: tr, body: { id: 'CLI', op: 'add', d, t: '18:00', rname: 'Upper', note: 'Rozgrzewka 10 min', rep: { days: [new Date(d + 'T12:00:00Z').getUTCDay()], weeks: 3 } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.changed.length, 3); assert.equal(r.body.sessions[0].tr.name, 'Tomasz');
  const ids = r.body.changed;
  // The client's own document has them.
  const data = (await h.req('GET', '/api/data', { jar: cli })).body.state;
  assert.equal(data.sessions.length, 3);
  // A phone that never heard of them pushes its state: they stay.
  const put = await h.req('PUT', '/api/data', { jar: cli, body: { state: { ...data, sessions: undefined, unit: 'kg' }, baseRev: data._rev, stamped: true } });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal((await h.req('GET', '/api/data', { jar: cli })).body.state.sessions.length, 3);
  // An overlapping one for another client: saved, with a warning.
  r = await h.req('POST', '/api/gymv2/client/session', { jar: tr, body: { id: 'CL2', op: 'add', d, t: '18:30', dur: 30 } });
  assert.equal(r.status, 200); assert.equal(r.body.overlaps.length, 1); assert.equal(r.body.overlaps[0].client.name, 'Sylwester');
  // Edit the series from the second on; cancel the first.
  r = await h.req('POST', '/api/gymv2/client/session', { jar: tr, body: { id: 'CLI', op: 'edit', sess: ids[1], scope: 'series', t: '17:00' } });
  assert.equal(r.status, 200); assert.equal(r.body.changed.length, 2);
  r = await h.req('POST', '/api/gymv2/client/session', { jar: tr, body: { id: 'CLI', op: 'cancel', sess: ids[0] } });
  assert.equal(r.status, 200);
  // Who may not: a client, someone outside the gym, a trainer for a non-member, a bad trainer.
  assert.equal((await h.req('POST', '/api/gymv2/client/session', { jar: cli, body: { id: 'CL2', op: 'add', d, t: '10:00' } })).status, 403);
  assert.equal((await h.req('GET', '/api/gymv2/client/sessions?id=CLI', { jar: out })).status, 403);
  assert.equal((await h.req('POST', '/api/gymv2/client/session', { jar: tr, body: { id: 'OUT', op: 'add', d, t: '10:00' } })).status, 403);
  assert.equal((await h.req('POST', '/api/gymv2/client/session', { jar: tr, body: { id: 'CLI', op: 'add', d, t: '10:00', tr: { id: 'CL2' } } })).status, 400);
  assert.equal((await h.req('GET', '/api/gymv2/schedule', { jar: cli })).status, 403);
  // "Mój grafik".
  const sch = (await h.req('GET', '/api/gymv2/schedule?from=' + d, { jar: tr })).body;
  assert.equal(sch.sessions.length, 4); assert.deepEqual([...new Set(sch.sessions.map(s => s.client.name))].sort(), ['Anna', 'Sylwester']);
  assert.equal((await h.req('GET', '/api/gymv2/schedule', { jar: admin })).body.sessions.length, 0, 'the admin leads none of them');
  assert.equal((await h.req('GET', '/api/gymv2/schedule?all=1', { jar: admin })).body.sessions.length, 4);
  // Leading Sylwester: his sessions yes, Anna's no.
  const act = await h.req('POST', '/api/gymv2/act', { jar: tr, body: { id: 'CLI' } });
  assert.equal(act.status, 200, JSON.stringify(act.body));
  const leading = { sid: tr.sid, act: tr.act };
  assert.equal((await h.req('GET', '/api/gymv2/client/sessions?id=CLI', { jar: leading })).status, 200);
  assert.equal((await h.req('POST', '/api/gymv2/client/session', { jar: leading, body: { id: 'CLI', op: 'add', d, t: '07:00' } })).status, 200);
  assert.equal((await h.req('POST', '/api/gymv2/client/session', { jar: leading, body: { id: 'CL2', op: 'add', d, t: '07:00' } })).status, 403);
  await h.req('POST', '/api/gymv2/act/end', { jar: leading, body: {} });
  delete tr.act;
  // The feeds: the client's has the note, the trainer's only the first name and the plan.
  const cf = (await h.req('POST', '/api/calendar', { jar: cli, body: {} })).body;
  const cics = unfold(await (await fetch(h.api + new URL(cf.url).pathname)).text());
  assert.match(cics, /SUMMARY:Trening z trenerem Tomasz – Habcore Gym/); assert.match(cics, /Rozgrzewka/); assert.match(cics, /STATUS:CANCELLED/);
  assert.equal((await h.req('POST', '/api/calendar', { jar: cli, body: { feed: 'trainer' } })).status, 403, 'a client has no trainer feed');
  const tf = (await h.req('POST', '/api/calendar', { jar: tr, body: { feed: 'trainer' } })).body;
  assert.ok(tf.on && tf.url && tf.url !== cf.url, JSON.stringify(tf));
  assert.equal((await h.req('GET', '/api/calendar?feed=trainer', { jar: tr })).body.url, tf.url, 'shown again');
  const res = await fetch(h.api + new URL(tf.url).pathname);
  assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/calendar/); assert.match(res.headers.get('cache-control'), /max-age=900/);
  const tics = unfold(await res.text());
  assert.match(tics, /SUMMARY:Trening: Sylwester · Upper – Habcore Gym/); assert.match(tics, /SUMMARY:Trening: Anna – Habcore Gym/);
  assert.doesNotMatch(tics, /Rozgrzewka/);
  const again = await fetch(h.api + new URL(tf.url).pathname, { headers: { 'If-None-Match': res.headers.get('etag') } });
  assert.equal(again.status, 304, 'unchanged: 304');
  // The trainer's own feed is untouched by it.
  assert.equal((await h.req('GET', '/api/calendar', { jar: tr })).body.on, false);
  // The client log names the changes.
  assert.ok(h.logOf('CLI').some(e => e.ev === 'session' && e.op === 'add' && e.n === 3));
});
