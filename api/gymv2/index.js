// Gym mode v2 (local patch 0003, Habcore Gym): one gym per server, trainers given by an admin,
// clients created by a trainer (an account with no way in until it is claimed) or joining with
// the gym's code. Every trainer of the gym sees and leads every client of the gym, with full
// consent given once at joining and ended only by leaving the gym.
//
// "Lead as client" is a second, short-lived token bound to the trainer's own session: it names
// the client, the trainer and the trainer's session version, and is checked on every request
// (actOf). The session that acts is the client's, but only for the routes in ACT_ALLOWED: the
// training data and its media. Passwords, e-mail, passkeys, pairing, deletion and everything
// else answer 403 `acting-forbidden`. Every write made while leading is logged with the trainer.
//
// State: DATA_DIR/gymv2.json (temp-then-rename, a .bak beside it) and DATA_DIR/gymv2-log/<uid>.jsonl.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { stampEntry } from '../sync-stamps.js';
import { findPairs, joinWorkouts, entriesCore, placeJoin, WINDOW_MS } from './merge.js';
import { createLive, liveRoutes } from './live.js';
import { addedNotes, trainersOf, notePush, applyNote } from './notes.js';

export const ACT_TTL_MS = 12 * 3600 * 1000;
export const INVITE_TTL_MS = 7 * 86400 * 1000;
export const CODE_TTL_MS = 90 * 86400 * 1000;
export const CONSENT = {
  v: 1,
  pl: 'Dołączając do siłowni, dajesz wszystkim trenerom tej siłowni (obecnym i przyszłym) pełny dostęp do Twojego konta treningowego: podgląd oraz prowadzenie konta, czyli dodawanie, zmienianie i usuwanie treningów, ćwiczeń, serii, planów, pomiarów i wagi. Każda zmiana trenera jest zapisywana z jego nazwą. Trener nie może zmienić Twojego hasła ani e-maila i nie może usunąć Twojego konta. Tej zgody nie można cofnąć osobno: możesz tylko opuścić siłownię, co od razu odbiera trenerom dostęp.',
  en: 'By joining the gym you give every trainer of this gym (now and in future) full access to your training account: they can see it and lead it, which means adding, changing and deleting workouts, exercises, sets, plans, measurements and body weight. Every change a trainer makes is logged with their name. A trainer cannot change your password or e-mail and cannot delete your account. This consent cannot be withdrawn on its own: you can only leave the gym, which ends the trainers\' access at once.'
};
export const consentHash = () => crypto.createHash('sha256').update(`gymv2|${CONSENT.v}|${CONSENT.pl}|${CONSENT.en}`).digest('hex').slice(0, 32);

// The routes a trainer leading a client may call as that client. Everything else is refused.
export const ACT_ALLOWED = new Set([
  'GET /api/me', 'GET /api/config', 'GET /api/health',
  'GET /api/data', 'GET /api/data/rev', 'PUT /api/data', 'GET /api/nudge-check',
  'GET /api/media/{hash}', 'PUT /api/media/{hash}', 'POST /api/media/missing',
  'POST /api/logout', 'POST /api/activity',
  'GET /api/gymv2/status', 'POST /api/gymv2/act', 'POST /api/gymv2/act/end',
  // Live joint training (patch 0006): the client's running workout, shared with the trainer.
  'GET /api/live', 'GET /api/live/stream', 'POST /api/live/ops', 'POST /api/live/end'
]);

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = n => Array.from(crypto.randomBytes(n)).map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const nowIso = () => new Date().toISOString();
const str = v => (typeof v === 'string' ? v : '');

/* ---------- the store ---------- */
export function createGymStore({ file, seed = null }) {
  let doc = null;
  const empty = () => ({ v: 1, name: 'Siłownia', trainers: [], members: [], codes: [], invites: [] });
  function load() {
    for (const f of [file, file + '.bak']) {
      try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); if (d && typeof d === 'object') return Object.assign(empty(), d); }
      catch (e) { if (e.code !== 'ENOENT' && f === file) console.error('gymv2.json unreadable, trying .bak:', e.message); }
    }
    return null;
  }
  function save() {
    const text = JSON.stringify(doc, null, 2);
    for (const f of [file, file + '.bak']) {
      const tmp = f + '.tmp';
      fs.writeFileSync(tmp, text, { mode: 0o600 });
      fs.renameSync(tmp, f);
    }
  }
  doc = load();
  if (!doc) { doc = empty(); if (seed) { try { seed(doc); } catch (e) { console.error('gymv2 seed', e.message); } } save(); }
  const get = () => doc;
  const isTrainerId = id => doc.trainers.some(t => t.userId === id);
  const memberOf = id => doc.members.find(m => m.userId === id) || null;
  return { get, save, isTrainerId, memberOf };
}

/* ---------- the change log ---------- */
const byId = list => new Map((Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object' && x.id != null).map(x => [String(x.id), x]));
const byDay = list => new Map((Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object' && x.d).map(x => [String(x.d), x]));
const SKIP_KEYS = new Set(['_rev', '_ts', '_wid', '_wids', '_stamps', 'deleted', 'edited', 'active', '_unstamped', '_prior']);
function listDiff(a, b, keyed, label) {
  const A = keyed(a), B = keyed(b), out = { added: [], removed: [], changed: [] };
  for (const [k, v] of B) if (!A.has(k)) out.added.push(label(v, k)); else if (JSON.stringify(A.get(k)) !== JSON.stringify(v)) out.changed.push(label(v, k));
  for (const [k, v] of A) if (!B.has(k)) out.removed.push(label(v, k));
  return out.added.length || out.removed.length || out.changed.length ? out : null;
}
export function diffStates(cur, next) {
  cur = cur || {}; next = next || {};
  const wLabel = (w, k) => ({ id: k, d: w.d || null, name: String(w.name || '').slice(0, 60), sets: (w.entries || []).reduce((n, e) => n + ((e && e.sets) || []).length, 0), ex: (w.entries || []).length });
  const rLabel = (r, k) => ({ id: k, name: String(r.name || '').slice(0, 60) });
  const dLabel = (x, k) => ({ d: k });
  const out = {};
  const w = listDiff(cur.workouts, next.workouts, byId, wLabel); if (w) out.workouts = w;
  const r = listDiff(cur.routines, next.routines, byId, rLabel); if (r) out.routines = r;
  const bw = listDiff(cur.bodyweight, next.bodyweight, byDay, dLabel); if (bw) out.bodyweight = bw;
  const ms = listDiff(cur.measurements, next.measurements, byDay, dLabel); if (ms) out.measurements = ms;
  const keys = [];
  for (const k of new Set([...Object.keys(cur), ...Object.keys(next)])) {
    if (SKIP_KEYS.has(k) || ['workouts', 'routines', 'bodyweight', 'measurements'].includes(k)) continue;
    if (JSON.stringify(cur[k]) !== JSON.stringify(next[k])) keys.push(k);
  }
  if (keys.length) out.other = keys.slice(0, 40);
  return Object.keys(out).length ? out : null;
}

/* ---------- routes ---------- */
export function gymV2({
  on, dataDir, db, saveDb, json, readBody, sessionOf, isAdmin, sessionVersion, audit, secure, sameSite,
  passwordLogin, hashPassword, passwordProblem, policyError, setPassword, nameTaken, nameKey, normalizeEmail, emailTaken,
  sessionCookie, publicUser, limitAddress, readStateCached, readState,
  // Joint training (patch 0004, gymv2/merge.js): GYM_MERGE, and the server's own write into a profile.
  merge: mergeOn = false, writeStateAs = null,
  // Live joint training (patch 0006, gymv2/live.js): GYM_LIVE.
  live: liveOn = false,
  // Habcore Gym (patch 0013, api/legal.js): with LEGAL=on the client accepts the Terms at take-over.
  legal = null,
  // Habcore Gym (kl14, gymv2/notes.js): a push about a new note on a workout.
  sendPush = null, langOf = () => 'en'
}) {
  const users = () => db().users;
  const userById = id => users().find(u => u.id === id) || null;
  const store = on ? createGymStore({
    file: path.join(dataDir, 'gymv2.json'),
    // First start: the trainers are whoever held a trainer or lead role in the upstream gyms
    // (org.json), admins excepted, and the gym is named after the gym most of them were in.
    seed: doc => {
      let org; try { org = JSON.parse(fs.readFileSync(path.join(dataDir, 'org.json'), 'utf8')); } catch { return; }
      const staff = (org.staff || []).filter(s => !s.until && (s.role === 'trainer' || s.role === 'lead'));
      const count = new Map();
      for (const s of staff) {
        const u = userById(s.userId);
        if (!u || isAdmin(u) || u.disabled) continue;
        if (!doc.trainers.some(t => t.userId === u.id)) doc.trainers.push({ userId: u.id, since: nowIso(), by: 'seed:org.json' });
        count.set(s.gymId, (count.get(s.gymId) || 0) + 1);
      }
      const top = [...count].sort((a, b) => b[1] - a[1])[0];
      const g = top && (org.gyms || []).find(x => x.id === top[0]);
      if (g?.name) doc.name = String(g.name).slice(0, 60);
    }
  }) : null;
  const logDir = path.join(dataDir, 'gymv2-log');
  const logFile = uid => path.join(logDir, String(uid).replace(/[^a-zA-Z0-9_-]/g, '') + '.jsonl');
  function log(uid, rec) {
    try {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
      fs.appendFileSync(logFile(uid), JSON.stringify({ at: Date.now(), ...rec }) + '\n', { mode: 0o600 });
    } catch (e) { console.error('gymv2 log', e.message); }
  }
  function readLog(uid, limit = 200) {
    let lines = [];
    try { lines = fs.readFileSync(logFile(uid), 'utf8').split('\n').filter(Boolean); } catch { return []; }
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
  }
  const who = u => ({ id: u.id, name: String(u.name || '').slice(0, 40) });
  // Live joint training (patch 0006): the running workout of a gym client, on the server.
  const live = on && liveOn ? createLive({ dataDir }) : null;
  // A workout the client's own device and a trainer's both had live is one workout already: the
  // join after the workout (0004) leaves it alone.
  const liveShared = id => !!live && live.liveShared(id);

  /* roles */
  const isTrainer = u => !!u && !u.disabled && store.isTrainerId(u.id);
  const isStaff = u => !!u && !u.disabled && (isAdmin(u) || isTrainer(u));
  const isMember = u => !!u && !!store.memberOf(u.id);
  // Whom a trainer (or an admin) may lead: a member of the gym who is neither staff nor admin.
  const canLead = (actor, client) => !!actor && !!client && actor.id !== client.id && isStaff(actor)
    && !client.disabled && isMember(client) && !isAdmin(client) && !isTrainer(client);

  /* the act token */
  const KEY = crypto.createHmac('sha256', String(on ? fs.readFileSync(path.join(dataDir, 'secret'), 'utf8').trim() : 'off')).update('gymv2-act-v1').digest();
  const mac = p => crypto.createHmac('sha256', KEY).update(p).digest('base64url');
  const COOKIE = secure ? '__Host-gymact' : 'gymact';
  const actCookie = (tok, maxAge) => `${COOKIE}=${tok}; Path=/; Max-Age=${maxAge}; HttpOnly;${secure ? ' Secure;' : ''} SameSite=${sameSite}`;
  const clearActCookie = () => actCookie('', 0);
  function mintAct(actor, client) {
    const exp = Date.now() + ACT_TTL_MS;
    const p = ['ga1', client.id, actor.id, exp, sessionVersion(actor), sessionVersion(client)].join('.');
    return { token: p + '.' + mac(p), exp };
  }
  function actTokenOf(req) {
    const h = req.headers['x-opengym-act'];
    if (typeof h === 'string' && h) return h.trim();
    for (const c of String(req.headers.cookie || '').split(';')) {
      const i = c.indexOf('=');
      if (i > 0 && c.slice(0, i).trim() === COOKIE) { const v = c.slice(i + 1).trim(); if (v) return v; }
    }
    return null;
  }
  // The client a request acts as, or null: the token verifies, has not run out, was made for the
  // trainer whose own session carries it, at that trainer's (and the client's) current session
  // version, and the trainer may still lead that client right now.
  function actOf(req, base) {
    if (!on || !base) return null;
    const tok = actTokenOf(req);
    if (!tok) return null;
    const i = tok.lastIndexOf('.');
    if (i < 0) return null;
    const p = tok.slice(0, i), m = tok.slice(i + 1);
    const want = mac(p);
    if (m.length !== want.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want))) return null;
    const [tag, cid, aid, exp, asv, csv] = p.split('.');
    if (tag !== 'ga1' || +exp < Date.now() || aid !== base.id || +asv !== sessionVersion(base)) return null;
    const client = userById(cid);
    if (!client || +csv !== sessionVersion(client) || !canLead(base, client)) return null;
    return { client, exp: +exp };
  }
  const actAllowed = key => ACT_ALLOWED.has(key);

  /* small helpers */
  const off = res => json(res, 404, { error: 'gym mode is off', code: 'gymv2-off' });
  // The person behind the request: the trainer when they are leading a client.
  function me(req, res) {
    const s = sessionOf(req);
    if (!s) { json(res, 401, { error: 'not signed in' }); return null; }
    return { self: s.actor || s.user, acting: s.actor ? s.user : null, s };
  }
  function staffOnly(req, res) {
    const m = me(req, res); if (!m) return null;
    if (!isStaff(m.self)) { json(res, 403, { error: 'trainers only', code: 'not-trainer' }); return null; }
    return m;
  }
  function adminOnly(req, res) {
    const m = me(req, res); if (!m) return null;
    if (!isAdmin(m.self)) { json(res, 403, { error: 'admins only', code: 'not-admin' }); return null; }
    return m;
  }
  const fails = new Map();   // address -> { n, until }
  const paused = addr => { const f = fails.get(addr); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; };
  const strike = addr => { const f = fails.get(addr) || { n: 0, until: 0 }; f.n++; if (f.n >= 10) { f.until = Date.now() + Math.min(3600, 60 * 2 ** (f.n - 10)) * 1000; } fails.set(addr, f); };
  setInterval(() => { const t = Date.now() - 3600000; for (const [k, v] of fails) if (v.until < t) fails.delete(k); }, 600000).unref();

  function summary(u) {
    const S = readStateCached(u.id) || {};
    const ws = Array.isArray(S.workouts) ? S.workouts.filter(w => w && typeof w === 'object') : [];
    const last = ws.reduce((m, w) => (w.d && (!m || w.d > m) ? w.d : m), null);
    return { workouts: ws.length, lastWorkout: last, routines: Array.isArray(S.routines) ? S.routines.length : 0 };
  }
  const activeInvite = uid => store.get().invites.find(i => i.userId === uid && !i.usedAt && i.expires > Date.now()) || null;
  const activeCode = () => store.get().codes.find(c => !c.revokedAt && c.expires > Date.now()) || null;
  const consentOut = () => ({ v: CONSENT.v, hash: consentHash(), pl: CONSENT.pl, en: CONSENT.en });
  function removeMember(uid) {
    const d = store.get();
    const before = d.members.length;
    d.members = d.members.filter(m => m.userId !== uid);
    if (d.members.length !== before) pruneGroups(uid);
    return d.members.length !== before;
  }

  /* ---------- saved groups (patch 0006.2) ---------- */
  // A trainer saves a group of clients who usually train together ("Bartek + Sylwek",
  // "Poniedziałek 18:00"), for the whole gym: every trainer sees, starts, edits and deletes it.
  // gymv2.json `groups`: [{ id, name, members: [uid], created, by, updated, updatedBy }].
  // Only the gym's clients can be in a group (checked on every save); someone who leaves the gym,
  // is taken out of it, becomes a trainer or is deleted is taken out of every group at once.
  const GROUP_MAX = 5, GROUP_MIN = 2, GROUPS_MAX = 200;
  const groupsOf = () => { const d = store.get(); if (!Array.isArray(d.groups)) d.groups = []; return d.groups; };
  const groupRef = gr => ({ id: gr.id, name: gr.name });
  // The change log of each person of a group: a group made, changed or deleted, by whom.
  function logGroup(uids, ev, gr, by, extra = {}) {
    for (const uid of new Set(uids)) log(uid, { ev, by, group: groupRef(gr), ...extra });
  }
  // Called with the store about to be saved by the caller.
  function pruneGroups(uid) {
    for (const gr of groupsOf()) {
      if (!gr.members.includes(uid)) continue;
      gr.members = gr.members.filter(x => x !== uid);
      gr.updated = nowIso();
      logGroup(gr.members, 'group-edit', gr, null, { why: 'member-left', removed: 1 });
    }
  }
  // What a trainer gets: the people of the group who are still the gym's clients, with names.
  function groupOut(gr, self) {
    const members = gr.members.map(userById).filter(u => u && !u.disabled && canLead(self, u)).map(who);
    const byU = userById(gr.by), upU = userById(gr.updatedBy);
    return { id: gr.id, name: gr.name, members, created: gr.created, updated: gr.updated || gr.created,
      by: byU ? who(byU) : null, updatedBy: upU ? who(upU) : null };
  }
  // The name and the people of a group from a request, checked; or { error }.
  function groupInput(body, self, { partial = false } = {}) {
    const out = {};
    if (!partial || body.name !== undefined) {
      const name = str(body.name).trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!name) return { error: 'name required', code: 'group-name' };
      out.name = name;
    }
    if (!partial || body.members !== undefined) {
      if (!Array.isArray(body.members)) return { error: 'members required', code: 'group-size' };
      const ids = [...new Set(body.members.map(str).filter(Boolean))];
      if (ids.length < GROUP_MIN || ids.length > GROUP_MAX) return { error: `a group has ${GROUP_MIN}-${GROUP_MAX} people`, code: 'group-size' };
      for (const id of ids) {
        const u = userById(id);
        if (!u || !canLead(self, u)) return { error: 'only the gym\'s clients can be in a group', code: 'group-not-client', status: 403 };
      }
      out.members = ids;
    }
    return out;
  }

  /* ---------- the language of client accounts made by a trainer (patch 0006.1) ---------- */
  const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;
  const DEFAULT_LANG = LANG_RE.test(process.env.DEFAULT_LANG || '') ? process.env.DEFAULT_LANG : 'pl';
  // The trainer's language and units (their document), or the server's default language.
  function lookOf(trainerId) {
    const T = (trainerId && readStateCached(trainerId)) || {};
    // A trainer who never picked a language (langAuto) sees the server's default language.
    const own = T.langAuto !== true && typeof T.lang === 'string' && LANG_RE.test(T.lang) ? T.lang : DEFAULT_LANG;
    return { lang: own, unit: T.unit === 'lb' || T.unit === 'kg' ? T.unit : null };
  }
  // Writes the language (and units) into a client's document, stamped as a settings edit, so a
  // device's merge keeps it. `onlyIf(cur)`: leave the document alone unless true.
  function seedLook(uid, trainerId, onlyIf = null) {
    if (!writeStateAs) return false;
    const look = lookOf(trainerId);
    try {
      return writeStateAs(uid, (next, t) => {
        if (onlyIf && !onlyIf(next)) return 'skip';
        next.lang = look.lang;
        next.langAuto = false;
        if (look.unit && !(Array.isArray(next.workouts) && next.workouts.length)) next.unit = look.unit;
        next.edited = { ...(next.edited && typeof next.edited === 'object' ? next.edited : {}), lang: t, langAuto: t, ...(next.unit === look.unit && look.unit ? { unit: t } : {}) };
        return 'set';
      }, { create: true, skipIf: r => r === 'skip' }) === 'set';
    } catch (e) { console.error('gymv2 seed look', uid, e.message); return false; }
  }
  // Once: the accounts trainers made before this, still in English or with no language chosen,
  // take their trainer's language (DEFAULT_LANG). Through the server's own write, at start-up,
  // never by editing files under a running API. Marked done in gymv2.json.
  function migrateLanguages() {
    if (!on || !store) return;
    const d = store.get();
    if (d.migrations?.clientLang) return;
    let n = 0;
    for (const u of users()) {
      if (!u || u.disabled || !(u.gymVirtual || u.gymCreatedBy)) continue;
      const S = readStateCached(u.id);
      const lang = S && typeof S.lang === 'string' ? S.lang : null;
      if (lang && lang !== 'en' && S.langAuto !== true) continue;
      if (seedLook(u.id, u.gymCreatedBy, next => !(typeof next.lang === 'string' && next.lang !== 'en' && next.langAuto !== true))) { n++; log(u.id, { ev: 'lang-set', by: { id: 'server', name: 'server' }, lang: lookOf(u.gymCreatedBy).lang }); }
    }
    d.migrations = { ...(d.migrations || {}), clientLang: { at: nowIso(), n } };
    store.save();
    if (n) console.log(`gymv2: ${n} client account(s) made by a trainer now in their trainer's language`);
  }
  setImmediate(() => { try { migrateLanguages(); } catch (e) { console.error('gymv2 lang migration', e.message); } });

  /* ---------- joint training (patch 0004, gymv2/merge.js) ---------- */
  // Which workouts of a client a trainer added while leading: from the change log (every write made
  // while leading names the workouts it added). Parsed again only when the log file changed.
  const trainerLogCache = new Map();   // uid -> { size, mtimeMs, map }
  function trainerWorkouts(uid) {
    let st;
    try { st = fs.statSync(logFile(uid)); } catch { return new Map(); }
    const hit = trainerLogCache.get(uid);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.map;
    const map = new Map();
    let text = '';
    try { text = fs.readFileSync(logFile(uid), 'utf8'); } catch { /* none */ }
    for (const line of text.split('\n')) {
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e?.ev !== 'write' || !e.by?.id) continue;
      for (const w of e.changes?.workouts?.added || []) if (w?.id != null && !map.has(String(w.id))) map.set(String(w.id), { id: String(e.by.id), name: String(e.by.name || '') });
    }
    trainerLogCache.set(uid, { size: st.size, mtimeMs: st.mtimeMs, map });
    return map;
  }
  const mergedDir = path.join(dataDir, 'gymv2-merged');
  const mergedFile = id => path.join(mergedDir, String(id).replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
  function saveMerged(rec) {
    fs.mkdirSync(mergedDir, { recursive: true, mode: 0o700 });
    const f = mergedFile(rec.id), tmp = f + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, f);
  }
  const readMerged = id => { try { return JSON.parse(fs.readFileSync(mergedFile(id), 'utf8')); } catch { return null; } };
  const mergesOf = uid => (store ? (store.get().merges || []).filter(m => m.client === uid) : []);
  // How long after a join a device that had not seen it yet can still put the client's own sets
  // back over it (it edited them, e.g. with the heart rate from Apple Health, before it pulled the
  // join): within this, such a write is joined again.
  const FOLLOW_MS = WINDOW_MS;
  const wKey = w => (w?.id != null ? String(w.id) : `${w?.d}|${w?.start}`);

  // After every write of a client's document (PUT /api/data, from any device): join what is a pair.
  function reconcile(client) {
    const uid = client.id;
    const tw = trainerWorkouts(uid);
    if (!tw.size) return null;
    const S0 = readStateCached(uid);
    if (!S0 || !Array.isArray(S0.workouts)) return null;
    const now = Date.now();
    const all = mergesOf(uid);
    const live = all.filter(m => !m.undone);
    const taken = new Set(all.flatMap(m => [String(m.base), String(m.from)]));
    // A cheap look first, on the cached document: anything to do at all?
    const ids = new Set(S0.workouts.filter(w => w && w.id != null).map(w => String(w.id)));
    const follow = live.filter(m => now - m.at < FOLLOW_MS && ids.has(String(m.base)));
    const quick = findPairs(S0.workouts, new Set(tw.keys()), { now, skip: id => taken.has(id) || liveShared(id) });
    if (!quick.pairs.length && !quick.ambiguous.length && !follow.length) return null;

    const done = [];
    const notes = [];
    writeStateAs(uid, (next, t) => {
      const ws = Array.isArray(next.workouts) ? next.workouts : [];
      const byId = id => ws.find(w => w && String(w.id) === String(id)) || null;
      // 1. Joins already made: the trainer's workout came back (a device edited it before it saw the
      //    join), or the client's own sets came back over the join. Joined again.
      for (const m of follow) {
        const rec = readMerged(m.id);
        const base = byId(m.base);
        if (!rec || !base) continue;
        const back = byId(m.from);
        if (back) {
          const joined = joinWorkouts({ ...base, entries: rec.client.entries }, back, { id: m.id, by: m.by, at: m.at });
          if (placeJoin(next, t, m.base, joined, back)) { rec.trainerLatest = back; notes.push({ m, rec, why: 'trainer-back' }); }
          continue;
        }
        const core = entriesCore(base.entries);
        if (core === entriesCore(rec.client.entries) && core !== entriesCore(rec.joined.entries)) {
          const trainer = rec.trainerLatest || rec.trainer;
          const joined = joinWorkouts(base, trainer, { id: m.id, by: m.by, at: m.at });
          if (placeJoin(next, t, m.base, joined, trainer)) notes.push({ m, rec, why: 'client-back' });
        }
      }
      // 2. New pairs, on the document as it is now.
      const { pairs, ambiguous } = findPairs(next.workouts, new Set(tw.keys()), { now, skip: id => taken.has(id) || liveShared(id) });
      for (const { trainer, client: cw } of pairs) {
        const by = tw.get(String(trainer.id)) || { id: '?', name: '?' };
        const id = crypto.randomBytes(9).toString('base64url');
        const meta = { id, by, at: t };
        const joined = joinWorkouts(cw, trainer, meta);
        if (!placeJoin(next, t, cw.id, joined, trainer)) continue;
        done.push({ id, by, base: String(cw.id), from: String(trainer.id), at: t, client: JSON.parse(JSON.stringify(cw)), trainer: JSON.parse(JSON.stringify(trainer)), joined });
      }
      for (const a of ambiguous) notes.push({ ambiguous: a });
      return done.length || notes.some(n => n.m) ? 'write' : 'skip';
    }, { skipIf: r => r === 'skip' });

    const d = store.get();
    d.merges = Array.isArray(d.merges) ? d.merges : [];
    let dirty = false;
    for (const x of done) {
      // The originals of both (and the result), for "Undo the join".
      saveMerged({ id: x.id, clientId: uid, at: x.at, by: x.by, base: x.base, from: x.from, client: x.client, trainer: x.trainer, joined: x.joined });
      d.merges.push({ id: x.id, client: uid, base: x.base, from: x.from, by: x.by, at: x.at, d: x.client.d || null, name: String(x.joined.name || '').slice(0, 60), undone: null });
      log(uid, { ev: 'merge', by: x.by, merge: x.id, base: x.base, from: x.from, d: x.client.d || null });
      console.log('gymv2 merge', uid, x.id, x.from, '->', x.base);
      dirty = true;
    }
    for (const n of notes) {
      if (n.m) {
        if (n.rec.trainerLatest) saveMerged(n.rec);
        n.m.again = (n.m.again || 0) + 1;
        log(uid, { ev: 'merge-again', by: n.m.by, merge: n.m.id, why: n.why });
        dirty = true;
      } else if (n.ambiguous) {
        // Said once per situation, not on every push.
        const sig = JSON.stringify(n.ambiguous);
        d.mergeSkips = d.mergeSkips && typeof d.mergeSkips === 'object' ? d.mergeSkips : {};
        const seen = Array.isArray(d.mergeSkips[uid]) ? d.mergeSkips[uid] : [];
        if (!seen.includes(sig)) {
          d.mergeSkips[uid] = [...seen, sig].slice(-20);
          log(uid, { ev: 'merge-skip', by: tw.get(n.ambiguous.trainer) || null, why: 'ambiguous', trainer: n.ambiguous.trainer, clients: n.ambiguous.clients, trainers: n.ambiguous.trainers });
          dirty = true;
        }
      }
    }
    if (d.merges.length > 1000) d.merges = d.merges.slice(-1000);
    if (dirty) store.save();
    return done.length;
  }

  // Undo a join: both workouts as they were before it, each stamped later than the join, the
  // trainer's marked as added back. The heart rate and media the client's workout got after the
  // join stay with it.
  function undoMerge(m, actor) {
    const rec = readMerged(m.id);
    if (!rec) throw Object.assign(new Error('the originals of this join are missing'), { status: 410, code: 'merge-lost' });
    writeStateAs(m.client, (next, t) => {
      next.workouts = Array.isArray(next.workouts) ? next.workouts : [];
      const ws = next.workouts;
      const del = (next.deleted = next.deleted && typeof next.deleted === 'object' ? next.deleted : {});
      const dw = (del.workouts = del.workouts && typeof del.workouts === 'object' ? del.workouts : {});
      const i = ws.findIndex(w => w && String(w.id) === String(m.base));
      const restored = JSON.parse(JSON.stringify(rec.client));
      delete restored._f; delete restored._u;
      if (i >= 0) {
        const cur = ws[i];
        for (const k of ['hr', 'media']) if (cur[k] !== undefined) restored[k] = JSON.parse(JSON.stringify(cur[k]));
        restored._f = cur._f;
        if (restored._f === undefined) delete restored._f;
        stampEntry(cur, restored, t);
        ws[i] = restored;
      } else {
        restored._ts = t;
        ws.push(restored);
        dw[wKey(restored)] = -t;
      }
      const tr = JSON.parse(JSON.stringify(rec.trainerLatest || rec.trainer));
      delete tr._f; delete tr._u;
      tr._ts = t;
      const j = ws.findIndex(w => w && wKey(w) === wKey(tr));
      if (j >= 0) ws[j] = tr; else ws.push(tr);
      dw[wKey(tr)] = -t;
      ws.sort((a, b) => String(a?.d || '').localeCompare(String(b?.d || '')) || (Number(a?.start) || 0) - (Number(b?.start) || 0));
      return true;
    });
    m.undone = { at: Date.now(), by: who(actor) };
    store.save();
    log(m.client, { ev: 'merge-undo', by: who(actor), merge: m.id, base: m.base, from: m.from });
  }
  const mergeOut = m => ({ id: m.id, at: m.at, d: m.d, name: m.name, by: m.by });
  const liveMerges = uid => mergesOf(uid).filter(m => !m.undone && Date.now() - m.at < 30 * 86400000).map(mergeOut).reverse();

  const routes = {
    // What the app needs to draw the gym screen for whoever asks.
    'GET /api/gymv2/status': async (req, res) => {
      if (!on) return off(res);
      const m = me(req, res); if (!m) return;
      const { self, acting } = m;
      const d = store.get();
      const mem = store.memberOf(self.id);
      json(res, 200, {
        on: true, name: d.name,
        role: isAdmin(self) ? 'admin' : isTrainer(self) ? 'trainer' : mem ? 'member' : 'none',
        admin: isAdmin(self), trainer: isTrainer(self),
        member: mem ? { since: mem.since, via: mem.via } : null,
        acting: acting ? { client: who(acting), by: who(self), exp: m.s.actExp || null } : null,
        trainers: d.trainers.map(t => userById(t.userId)).filter(u => u && !u.disabled).map(who),
        consent: consentOut(),
        passwordLogin: !!passwordLogin,
        merge: !!mergeOn,
        live: !!live
      });
    },

    // Every client of the gym, for the trainers.
    'GET /api/gymv2/clients': async (req, res) => {
      if (!on) return off(res);
      const m = staffOnly(req, res); if (!m) return;
      const d = store.get();
      const list = d.members.map(x => ({ x, u: userById(x.userId) })).filter(({ u }) => u && !u.disabled)
        .map(({ x, u }) => {
          const inv = activeInvite(u.id);
          return {
            ...who(u), since: x.since, via: x.via, virtual: !!u.gymVirtual,
            canLead: canLead(m.self, u), invite: inv ? { expires: inv.expires } : null, ...summary(u),
            ...(mergeOn ? { merges: liveMerges(u.id) } : {}),
            ...(live ? { live: live.liveOf(u.id) } : {})
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
      json(res, 200, { clients: list, name: d.name });
    },

    // A trainer makes a client account: a name, no e-mail, no password. It cannot sign in until
    // the client takes it over with an invite link.
    'POST /api/gymv2/clients': async (req, res) => {
      if (!on) return off(res);
      const m = staffOnly(req, res); if (!m) return;
      const body = await readBody(req);
      const name = str(body.name).trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!name) return json(res, 400, { error: 'name required', code: 'missing' });
      if (name.includes('@')) return json(res, 400, { error: 'a name cannot be an e-mail address', code: 'name-invalid' });
      const k = nameKey(name);
      if (nameTaken(name) || users().some(u => nameKey(u.name) === k)) return json(res, 409, { error: 'another profile already has this name', code: 'name-taken' });
      const created = nowIso();
      const u = { id: crypto.randomBytes(12).toString('base64url'), name, created, gymVirtual: true, gymCreatedBy: m.self.id };
      users().push(u);
      saveDb();
      store.get().members.push({ userId: u.id, since: created, via: 'created', by: m.self.id });
      store.save();
      log(u.id, { ev: 'created', by: who(m.self) });
      // Habcore Gym (patch 0006.1): the new account speaks the trainer's language (and units), so
      // "Lead as client" and the client's first sign-in are not in English.
      seedLook(u.id, m.self.id);
      audit(req, 'gymv2.client.create', { user: m.self, target: u });
      json(res, 200, { client: { ...who(u), virtual: true, since: created, canLead: true, invite: null, workouts: 0, lastWorkout: null, routines: 0 } });
    },

    // A one-time link with which the client takes over the account the trainer made.
    'POST /api/gymv2/invite': async (req, res) => {
      if (!on) return off(res);
      const m = staffOnly(req, res); if (!m) return;
      const body = await readBody(req);
      const u = userById(str(body.id));
      if (!u || !isMember(u)) return json(res, 404, { error: 'no such client', code: 'not-found' });
      if (!u.gymVirtual) return json(res, 409, { error: 'this client already has their own sign-in', code: 'not-virtual' });
      if (!passwordLogin) return json(res, 409, { error: 'password sign-in is off on this server', code: 'password-off' });
      const token = crypto.randomBytes(24).toString('base64url');
      const d = store.get();
      d.invites = d.invites.filter(i => i.userId !== u.id && i.expires > Date.now() - 30 * 86400000);
      const inv = { hash: sha(token), userId: u.id, by: m.self.id, created: Date.now(), expires: Date.now() + INVITE_TTL_MS, usedAt: null };
      d.invites.push(inv);
      store.save();
      log(u.id, { ev: 'invite', by: who(m.self) });
      audit(req, 'gymv2.client.invite', { user: m.self, target: u });
      json(res, 200, { token, expires: inv.expires });
    },

    // The invite link's page asks who it is for (public: the token is the credential).
    'GET /api/gymv2/invite': async (req, res) => {
      if (!on) return off(res);
      const addr = limitAddress(req);
      const wait = paused(addr); if (wait) return json(res, 429, { error: 'too many tries', code: 'rate-limited' }, { 'Retry-After': String(wait) });
      const c = new URL(req.url, 'http://x').searchParams.get('c') || '';
      const inv = c && store.get().invites.find(i => i.hash === sha(c));
      const u = inv && userById(inv.userId);
      if (!inv || !u) { strike(addr); return json(res, 404, { error: 'this link is not valid', code: 'invite-invalid' }); }
      if (inv.usedAt) return json(res, 410, { error: 'this link was used already', code: 'invite-used' });
      if (inv.expires < Date.now()) return json(res, 410, { error: 'this link has expired', code: 'invite-expired' });
      if (!u.gymVirtual) return json(res, 410, { error: 'this link was used already', code: 'invite-used' });
      json(res, 200, { name: u.name, gym: store.get().name, expires: inv.expires, consent: consentOut(), passwordLogin: !!passwordLogin });
    },

    // The client sets a password (and an e-mail if they like) and the account is theirs, with
    // everything the trainers logged in it. Signs them in.
    'POST /api/gymv2/invite/claim': async (req, res) => {
      if (!on) return off(res);
      if (!passwordLogin) return json(res, 409, { error: 'password sign-in is off on this server', code: 'password-off' });
      const addr = limitAddress(req);
      const wait = paused(addr); if (wait) return json(res, 429, { error: 'too many tries', code: 'rate-limited' }, { 'Retry-After': String(wait) });
      const body = await readBody(req);
      const c = str(body.c);
      const find = () => { const inv = c && store.get().invites.find(i => i.hash === sha(c)); return inv && !inv.usedAt && inv.expires > Date.now() ? inv : null; };
      let inv = find();
      if (!inv) { strike(addr); return json(res, 410, { error: 'this link is not valid any more', code: 'invite-invalid' }); }
      if (body.consent?.v !== CONSENT.v) return json(res, 409, { error: 'the consent text changed', code: 'consent-outdated', consent: consentOut() });
      const u = userById(inv.userId);
      if (!u || !u.gymVirtual || u.disabled) return json(res, 410, { error: 'this link is not valid any more', code: 'invite-invalid' });
      if (legal && !legal.accepted(body.legal)) return json(res, 400, legal.required);
      const problem = passwordProblem(body.password, u.name);
      if (problem) return policyError(res, problem);
      const hasEmail = typeof body.email === 'string' && body.email.trim() !== '';
      const email = hasEmail ? normalizeEmail(body.email) : null;
      if (hasEmail && !email) return json(res, 400, { error: 'that is not an e-mail address', code: 'email-invalid' });
      if (nameTaken(u.name, u.id)) return json(res, 409, { error: 'another profile already signs in with this name', code: 'name-taken' });
      const h = await hashPassword(body.password);
      inv = find();
      if (!inv || inv.userId !== u.id || !u.gymVirtual) return json(res, 410, { error: 'this link is not valid any more', code: 'invite-invalid' });
      if (email && emailTaken(email, u.id)) return json(res, 409, { error: 'another profile already uses this e-mail address', code: 'email-taken' });
      setPassword(u, h);
      if (email) u.email = email;
      if (legal) u.legal = legal.record('invite');
      delete u.gymVirtual;
      u.gymClaimed = nowIso();
      inv.usedAt = Date.now();
      const mem = store.memberOf(u.id);
      if (mem) mem.consent = { v: CONSENT.v, hash: consentHash(), at: nowIso(), via: 'invite' };
      saveDb();
      store.save();
      log(u.id, { ev: 'claimed' });
      audit(req, 'gymv2.client.claim', { user: u });
      json(res, 200, { user: publicUser(u) }, { 'Set-Cookie': sessionCookie(u) });
    },

    // Start leading a client: the act token as an HttpOnly cookie (browser, PWA) and in the body
    // (the paired phone sends it as X-OpenGym-Act beside its own bearer).
    'POST /api/gymv2/act': async (req, res) => {
      if (!on) return off(res);
      const m = staffOnly(req, res); if (!m) return;
      const body = await readBody(req);
      const client = userById(str(body.id));
      if (!client || !isMember(client)) return json(res, 404, { error: 'no such client', code: 'not-found' });
      if (!canLead(m.self, client)) return json(res, 403, { error: 'you cannot lead this account', code: 'not-allowed' });
      const { token, exp } = mintAct(m.self, client);
      log(client.id, { ev: 'act-start', by: who(m.self) });
      audit(req, 'gymv2.act.start', { user: m.self, target: client });
      json(res, 200, { ok: true, client: who(client), token, exp }, { 'Set-Cookie': actCookie(token, Math.floor(ACT_TTL_MS / 1000)) });
    },
    'POST /api/gymv2/act/end': async (req, res) => {
      if (!on) return off(res);
      const m = me(req, res); if (!m) return;
      if (m.acting) { log(m.acting.id, { ev: 'act-end', by: who(m.self) }); audit(req, 'gymv2.act.end', { user: m.self, target: m.acting }); }
      json(res, 200, { ok: true, user: publicUser(m.self) }, { 'Set-Cookie': clearActCookie() });
    },

    // The change log of one client: for the trainers, and for the client themself.
    // kl6.3: the app asks GET /api/gymv2/changes?u=<id>. The old address "/log?id=" is a rule of
    // EasyPrivacy (uBlock Origin, AdBlock, Brave…), so in such a browser the request never left it
    // ("Failed to fetch"); /log stays for app builds that still use it.
    'GET /api/gymv2/changes': async (req, res) => routes['GET /api/gymv2/log'](req, res),
    'GET /api/gymv2/log': async (req, res) => {
      if (!on) return off(res);
      const m = me(req, res); if (!m) return;
      const q = new URL(req.url, 'http://x').searchParams;
      const id = q.get('u') || q.get('id') || m.self.id;
      const u = userById(id);
      if (!u) return json(res, 404, { error: 'not found' });
      if (u.id !== m.self.id && !(isStaff(m.self) && isMember(u))) return json(res, 404, { error: 'not found' });
      // A client reading their own log: a group's name may name other clients (patch 0006.2).
      const own = u.id === m.self.id && !isStaff(m.self);
      json(res, 200, { log: readLog(u.id).map(e => (own && e.group ? { ...e, group: { id: e.group.id }, from: undefined } : e)) });
    },

    // The gym's join code (trainers and admins): the current one, or a new one replacing it.
    'GET /api/gymv2/code': async (req, res) => {
      if (!on) return off(res);
      const m = staffOnly(req, res); if (!m) return;
      const c = activeCode();
      json(res, 200, { code: c ? { code: c.plain, expires: c.expires } : null });
    },
    'POST /api/gymv2/code': async (req, res) => {
      if (!on) return off(res);
      const m = staffOnly(req, res); if (!m) return;
      const d = store.get();
      for (const c of d.codes) if (!c.revokedAt) c.revokedAt = Date.now();
      const plain = 'SIL-' + randomCode(5) + '-' + randomCode(5);
      d.codes = d.codes.filter(c => c.expires > Date.now() - 30 * 86400000).slice(-20);
      // Kept readable so every trainer can show the same code; it only lets someone join.
      d.codes.push({ hash: sha(plain), plain, created: Date.now(), expires: Date.now() + CODE_TTL_MS, by: m.self.id, revokedAt: null });
      store.save();
      audit(req, 'gymv2.code.new', { user: m.self });
      json(res, 200, { code: { code: plain, expires: Date.now() + CODE_TTL_MS } });
    },

    // A person with their own account joins with the gym's code, agreeing to the consent text.
    'POST /api/gymv2/join': async (req, res) => {
      if (!on) return off(res);
      const m = me(req, res); if (!m) return;
      if (m.acting) return json(res, 403, { error: 'not while leading a client', code: 'acting-forbidden' });
      const u = m.self;
      const addr = limitAddress(req);
      const wait = paused(addr); if (wait) return json(res, 429, { error: 'too many tries', code: 'rate-limited' }, { 'Retry-After': String(wait) });
      const body = await readBody(req);
      const code = str(body.code).trim().toUpperCase();
      const c = code && store.get().codes.find(x => x.hash === sha(code) && !x.revokedAt && x.expires > Date.now());
      if (!c) { strike(addr); return json(res, 404, { error: 'that gym code is not valid', code: 'code-invalid' }); }
      if (isAdmin(u) || isTrainer(u)) return json(res, 409, { error: 'trainers and admins cannot join as clients', code: 'staff' });
      if (isMember(u)) return json(res, 409, { error: 'you are already in the gym', code: 'already-member' });
      if (body.consent?.v !== CONSENT.v || body.consent?.hash !== consentHash()) return json(res, 409, { error: 'the consent text changed', code: 'consent-outdated', consent: consentOut() });
      const since = nowIso();
      store.get().members.push({ userId: u.id, since, via: 'code', consent: { v: CONSENT.v, hash: consentHash(), at: since, via: 'code' } });
      store.save();
      log(u.id, { ev: 'joined' });
      audit(req, 'gymv2.join', { user: u });
      json(res, 200, { ok: true, member: { since, via: 'code' } });
    },

    // Leaving the gym is the one way to end the trainers' access. Not for an account nobody has
    // taken over yet (it has no owner to decide).
    'POST /api/gymv2/leave': async (req, res) => {
      if (!on) return off(res);
      const m = me(req, res); if (!m) return;
      if (m.acting) return json(res, 403, { error: 'not while leading a client', code: 'acting-forbidden' });
      if (!removeMember(m.self.id)) return json(res, 409, { error: 'you are not in the gym', code: 'not-member' });
      store.save();
      log(m.self.id, { ev: 'left' });
      audit(req, 'gymv2.leave', { user: m.self });
      json(res, 200, { ok: true });
    },

    // Undo a joint-training join (patch 0004): a trainer or an admin, for a client of the gym.
    'POST /api/gymv2/merge/undo': async (req, res) => {
      if (!on || !mergeOn) return off(res);
      const m = staffOnly(req, res); if (!m) return;
      if (m.acting) return json(res, 403, { error: 'not while leading a client', code: 'acting-forbidden' });
      const body = await readBody(req);
      const rec = (store.get().merges || []).find(x => x.id === str(body.id));
      const u = rec && userById(rec.client);
      if (!rec || !u || !isMember(u)) return json(res, 404, { error: 'no such join', code: 'not-found' });
      if (rec.undone) return json(res, 409, { error: 'this join was undone already', code: 'merge-undone' });
      try { undoMerge(rec, m.self); }
      catch (e) { return json(res, e.status || 500, { error: e.message, code: e.code || 'merge-undo-failed' }); }
      audit(req, 'gymv2.merge.undo', { user: m.self, target: u });
      json(res, 200, { ok: true, merges: liveMerges(u.id) });
    },

    // Admins: everyone on the server with their gym role, to give or take the trainer role.
    'GET /api/gymv2/users': async (req, res) => {
      if (!on) return off(res);
      const m = adminOnly(req, res); if (!m) return;
      json(res, 200, {
        name: store.get().name,
        users: users().map(u => ({ ...who(u), admin: isAdmin(u), trainer: store.isTrainerId(u.id), member: isMember(u), virtual: !!u.gymVirtual, disabled: !!u.disabled }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
      });
    },
    'POST /api/gymv2/trainer': async (req, res) => {
      if (!on) return off(res);
      const m = adminOnly(req, res); if (!m) return;
      const body = await readBody(req);
      const u = userById(str(body.id));
      if (!u) return json(res, 404, { error: 'no such user' });
      const d = store.get();
      if (body.trainer === true) {
        if (u.gymVirtual) return json(res, 409, { error: 'an account nobody has taken over cannot be a trainer', code: 'virtual' });
        if (!store.isTrainerId(u.id)) d.trainers.push({ userId: u.id, since: nowIso(), by: m.self.id });
        // A trainer is not a client: nobody may lead a trainer's account.
        if (removeMember(u.id)) log(u.id, { ev: 'left', why: 'became-trainer' });
      } else {
        d.trainers = d.trainers.filter(t => t.userId !== u.id);
      }
      store.save();
      audit(req, body.trainer === true ? 'gymv2.trainer.add' : 'gymv2.trainer.remove', { user: m.self, target: u });
      json(res, 200, { ok: true, id: u.id, trainer: store.isTrainerId(u.id) });
    },
    'POST /api/gymv2/name': async (req, res) => {
      if (!on) return off(res);
      const m = adminOnly(req, res); if (!m) return;
      const body = await readBody(req);
      const name = str(body.name).trim().slice(0, 60);
      if (!name) return json(res, 400, { error: 'name required' });
      store.get().name = name;
      store.save();
      json(res, 200, { ok: true, name });
    },
    // An admin takes a client out of the gym (the account stays).
    'POST /api/gymv2/members/remove': async (req, res) => {
      if (!on) return off(res);
      const m = adminOnly(req, res); if (!m) return;
      const body = await readBody(req);
      const id = str(body.id);
      if (!removeMember(id)) return json(res, 404, { error: 'not a member' });
      store.save();
      log(id, { ev: 'left', by: who(m.self), why: 'removed-by-admin' });
      json(res, 200, { ok: true });
    }
  };

  // Live joint training (patch 0006): for a gym client's own session, or a trainer leading them.
  if (live) {
    Object.assign(routes, liveRoutes({
      live, json, readBody, sessionOf, log,
      resolve: (s, as) => {
        if (!s?.user) return null;
        // A trainer leading a client: that client.
        if (s.actor) return canLead(s.actor, s.user) ? { uid: s.user.id, actor: s.actor, self: s.actor } : null;
        // A trainer in their own account naming a client (group training): checked right now.
        if (as) {
          const c = userById(as);
          return c && canLead(s.user, c) ? { uid: c.id, actor: s.user, self: s.user } : null;
        }
        // A gym client's own device.
        return isMember(s.user) && !isStaff(s.user) ? { uid: s.user.id, actor: null, self: s.user } : null;
      }
    }));
    // Group training (patch 0006): a trainer in their own account trains several clients at once.
    // Every route names the client and is checked for that client on every request (canLead), like
    // the live routes' `as`; nothing here works while leading one client (act token).
    const groupStaff = (req, res) => {
      const m = staffOnly(req, res); if (!m) return null;
      if (m.acting) { json(res, 403, { error: 'not while leading a client', code: 'acting-forbidden' }); return null; }
      return m;
    };
    const groupClient = (m, id, res) => {
      const c = userById(str(id));
      if (!c || !canLead(m.self, c)) { json(res, 403, { error: 'you cannot lead this account', code: 'not-allowed' }); return null; }
      return c;
    };
    // One client's document (read only): their routines, history and units, for building their
    // exercises and the weights they did last.
    routes['GET /api/gymv2/group/client'] = async (req, res) => {
      const m = groupStaff(req, res); if (!m) return;
      const c = groupClient(m, new URL(req.url, 'http://x').searchParams.get('id'), res); if (!c) return;
      const S = readStateCached(c.id) || {};
      const { _unstamped, _prior, ...state } = S;
      json(res, 200, { client: who(c), state, live: live.liveOf(c.id) });
    };
    // A workout a trainer finished for a client whose phone is not on it: into the client's
    // document, logged with the trainer, as a write made while leading would be.
    routes['POST /api/gymv2/group/save'] = async (req, res) => {
      const m = groupStaff(req, res); if (!m) return;
      const body = await readBody(req);
      const c = groupClient(m, body.id, res); if (!c) return;
      const w = body.workout;
      if (!w || typeof w !== 'object' || Array.isArray(w) || typeof w.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(w.id) || !Array.isArray(w.entries)) return json(res, 400, { error: 'workout required', code: 'bad-workout' });
      if (JSON.stringify(w).length > 512 * 1024) return json(res, 413, { error: 'workout too large', code: 'too-large' });
      const before = readStateCached(c.id) || {};
      let out;
      try {
        out = writeStateAs(c.id, (next, t) => {
          if (!Array.isArray(next.workouts)) next.workouts = [];
          if (next.workouts.some(x => x && String(x.id) === w.id)) return 'exists';
          const x = JSON.parse(JSON.stringify(w));
          delete x._ts; delete x._f; delete x._u;
          stampEntry(null, x, t);
          next.workouts.push(x);
          return 'saved';
        }, { skipIf: r => r === 'exists', create: true });
      } catch (e) { return json(res, e.status || 500, { error: e.message, code: e.code || 'error' }); }
      if (out === 'saved') {
        const after = readStateCached(c.id) || {};
        let d = null; try { d = diffStates(before, after); } catch { d = null; }
        if (d) log(c.id, { ev: 'write', by: who(m.self), changes: d, via: 'group' });
        live.savedInState(c.id, after);
        if (mergeOn && writeStateAs) { try { reconcile(c); } catch (e) { console.error('gymv2 merge', c.id, e.message); } }
      }
      audit(req, 'gymv2.group.save', { user: m.self, target: c });
      json(res, 200, { ok: true, saved: out === 'saved' });
    };
    // One long poll for the whole group: answers as soon as any of the clients' workouts changed.
    // `c` = id:wid:seq,... (the workouts the trainer's device has, and how far it read each).
    routes['GET /api/gymv2/group/poll'] = async (req, res) => {
      const m = groupStaff(req, res); if (!m) return;
      const p = new URL(req.url, 'http://x').searchParams;
      const dev = str(p.get('dev'));
      const want = [];
      for (const part of str(p.get('c')).split(',').filter(Boolean).slice(0, 8)) {
        const [id, wid = '', seq = ''] = part.split(':');
        const c = userById(id);
        if (!c || !canLead(m.self, c)) return json(res, 403, { error: 'you cannot lead this account', code: 'not-allowed', id });
        want.push({ uid: c.id, wid, seq: seq === '' ? null : Number(seq) });
      }
      const waitS = Math.max(0, Math.min(25, Number(p.get('wait')) || 0));
      const answerAll = () => {
        const out = {};
        for (const w of want) { live.seen(w.uid, dev, m.self); out[w.uid] = live.answer(w.uid, w.wid, Number.isInteger(w.seq) ? w.seq : null); }
        return out;
      };
      const news = all => Object.values(all).some(a => !a.live ? false : !a.live.ops || a.live.ops.length > 0);
      const first = answerAll();
      if (!waitS || news(first)) return json(res, 200, { answers: first, now: Date.now() });
      let done = false, timer = null;
      const offs = [];
      const finish = () => {
        if (done) return; done = true;
        offs.forEach(f => f()); clearTimeout(timer);
        if (!res.writableEnded && !res.destroyed) json(res, 200, { answers: answerAll(), now: Date.now() });
      };
      for (const w of want) offs.push(live.wait(w.uid, finish));
      timer = setTimeout(finish, waitS * 1000);
      req.on('close', () => { if (!done) { done = true; offs.forEach(f => f()); clearTimeout(timer); } });
    };
    // Saved groups (patch 0006.2): the gym's, for every trainer; never while leading a client.
    routes['GET /api/gymv2/groups'] = async (req, res) => {
      const m = groupStaff(req, res); if (!m) return;
      const list = groupsOf().map(gr => groupOut(gr, m.self)).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
      json(res, 200, { groups: list });
    };
    routes['POST /api/gymv2/groups'] = async (req, res) => {
      const m = groupStaff(req, res); if (!m) return;
      const body = await readBody(req);
      const v = groupInput(body, m.self);
      if (v.error) return json(res, v.status || 400, { error: v.error, code: v.code });
      if (groupsOf().length >= GROUPS_MAX) return json(res, 409, { error: 'too many groups', code: 'group-limit' });
      const at = nowIso();
      const gr = { id: 'gr' + crypto.randomBytes(9).toString('base64url'), name: v.name, members: v.members, created: at, by: m.self.id, updated: at, updatedBy: m.self.id };
      groupsOf().push(gr);
      store.save();
      logGroup(gr.members, 'group-create', gr, who(m.self));
      audit(req, 'gymv2.group.create', { user: m.self, msg: `${gr.id} members=${gr.members.length}` });
      json(res, 200, { group: groupOut(gr, m.self) });
    };
    routes['POST /api/gymv2/groups/update'] = async (req, res) => {
      const m = groupStaff(req, res); if (!m) return;
      const body = await readBody(req);
      const gr = groupsOf().find(x => x.id === str(body.id));
      if (!gr) return json(res, 404, { error: 'no such group', code: 'not-found' });
      const v = groupInput(body, m.self, { partial: true });
      if (v.error) return json(res, v.status || 400, { error: v.error, code: v.code });
      const before = { name: gr.name, members: gr.members.slice() };
      if (v.name !== undefined) gr.name = v.name;
      if (v.members !== undefined) gr.members = v.members;
      const added = gr.members.filter(x => !before.members.includes(x));
      const removed = before.members.filter(x => !gr.members.includes(x));
      const renamed = gr.name !== before.name;
      if (!added.length && !removed.length && !renamed) return json(res, 200, { group: groupOut(gr, m.self), changed: false });
      gr.updated = nowIso(); gr.updatedBy = m.self.id;
      store.save();
      const by = who(m.self), from = renamed ? before.name : undefined;
      logGroup(added, 'group-add', gr, by, { from });
      logGroup(removed, 'group-remove', gr, by, { from });
      logGroup(gr.members.filter(x => !added.includes(x)), 'group-edit', gr, by, { from, added: added.length, removed: removed.length });
      audit(req, 'gymv2.group.update', { user: m.self, msg: `${gr.id} +${added.length} -${removed.length}${renamed ? ' renamed' : ''}` });
      json(res, 200, { group: groupOut(gr, m.self), changed: true });
    };
    routes['POST /api/gymv2/groups/delete'] = async (req, res) => {
      const m = groupStaff(req, res); if (!m) return;
      const body = await readBody(req);
      const d = store.get();
      const gr = groupsOf().find(x => x.id === str(body.id));
      if (!gr) return json(res, 404, { error: 'no such group', code: 'not-found' });
      d.groups = groupsOf().filter(x => x !== gr);
      store.save();
      logGroup(gr.members, 'group-delete', gr, who(m.self));
      audit(req, 'gymv2.group.delete', { user: m.self, msg: gr.id });
      json(res, 200, { ok: true });
    };
    // Who of the gym's clients is training right now (live), for a trainer's banner.
    routes['GET /api/gymv2/live-now'] = async (req, res) => {
      const m = staffOnly(req, res); if (!m) return;
      if (m.acting) return json(res, 200, { live: [] });
      const list = store.get().members.map(x => userById(x.userId)).filter(u => u && !u.disabled && canLead(m.self, u))
        .map(u => ({ ...who(u), live: live.liveOf(u.id) })).filter(x => x.live);
      json(res, 200, { live: list });
    };
  }

  // Habcore Gym (kl14, patch 0016): a client's workouts in the gym panel (the same feed the client
  // has), and the trainer's notes on them, without leading the client. Read and write go through
  // canLead on every request; never while leading one client (act token).
  if (on) {
    const panelClient = (req, res, id) => {
      const m = staffOnly(req, res); if (!m) return null;
      if (m.acting) { json(res, 403, { error: 'not while leading a client', code: 'acting-forbidden' }); return null; }
      const c = userById(str(id));
      if (!c || !canLead(m.self, c)) { json(res, 403, { error: 'you cannot lead this account', code: 'not-allowed' }); return null; }
      return { m, c };
    };
    // Newest first, `n` (max 60) from `off`; with the client's units, own exercises and plan names.
    routes['GET /api/gymv2/client/workouts'] = async (req, res) => {
      const p = new URL(req.url, 'http://x').searchParams;
      const x = panelClient(req, res, p.get('id')); if (!x) return;
      const S = readStateCached(x.c.id) || {};
      const all = (Array.isArray(S.workouts) ? S.workouts : []).filter(w => w && typeof w === 'object')
        .slice().sort((a, b) => (String(b.d || '') < String(a.d || '') ? -1 : String(b.d || '') > String(a.d || '') ? 1 : (Number(b.start) || 0) - (Number(a.start) || 0)));
      const off = Math.max(0, Math.floor(Number(p.get('off')) || 0));
      const n = Math.max(1, Math.min(60, Math.floor(Number(p.get('n')) || 30)));
      const since = /^\d{4}-\d{2}-\d{2}$/.test(p.get('from') || '') ? p.get('from') : null;
      const until = /^\d{4}-\d{2}-\d{2}$/.test(p.get('to') || '') ? p.get('to') : null;
      const pick = all.filter(w => (!since || String(w.d) >= since) && (!until || String(w.d) <= until));
      json(res, 200, {
        client: who(x.c), total: pick.length, off, workouts: pick.slice(off, off + n),
        unit: S.unit === 'lb' ? 'lb' : 'kg', weekStart: S.weekStart ?? null,
        customEx: (Array.isArray(S.customEx) ? S.customEx : []).filter(e => e && e.id).map(e => ({ id: e.id, name: str(e.name).slice(0, 80), muscles: e.muscles, primary: e.primary, secondary: e.secondary })),
        routines: (Array.isArray(S.routines) ? S.routines : []).filter(r => r && r.id).map(r => ({ id: r.id, name: str(r.name).slice(0, 80), emoji: r.emoji })),
        // Every trained day (for the panel's calendar), not only this page.
        days: [...new Set(all.map(w => String(w.d || '')).filter(Boolean))],
      });
    };
    routes['POST /api/gymv2/client/note'] = async (req, res) => {
      const body = await readBody(req);
      const x = panelClient(req, res, body.id); if (!x) return;
      const wid = str(body.wid);
      if (!wid) return json(res, 400, { error: 'workout required', code: 'bad-workout' });
      const by = { id: x.m.self.id, name: String(x.m.self.name || '').slice(0, 60), role: 'trainer' };
      let out;
      try {
        out = writeStateAs(x.c.id, next => {
          const w = (Array.isArray(next.workouts) ? next.workouts : []).find(y => y && String(y.id) === wid);
          if (!w) return 'no-workout';
          const r = applyNote(w, by, { nid: str(body.nid), text: str(body.text), del: body.del === true });
          return typeof r === 'string' && !['edited', 'deleted'].includes(r) ? r : { r, w: JSON.parse(JSON.stringify(w)) };
        }, { skipIf: r => typeof r === 'string' });
      } catch (e) { return json(res, e.status || 500, { error: e.message, code: e.code || 'error' }); }
      if (typeof out === 'string') return json(res, out === 'no-workout' || out === 'no-note' ? 404 : out === 'not-yours' ? 403 : 400, { error: out, code: out });
      log(x.c.id, { ev: 'note', by: who(x.m.self), wid, what: out.r?.added ? 'added' : out.r });
      if (out.r?.added && sendPush) { try { sendPush(x.c.id, notePush(langOf(x.c.id), 'toClient', by.name, out.w, out.r.added.text)); } catch (e) { console.error('gymv2 note push', e.message); } }
      audit(req, 'gymv2.note', { user: x.m.self, target: x.c });
      json(res, 200, { ok: true, workout: out.w });
    };
  }

  return {
    on: !!on,
    live,
    routes,
    actOf,
    actAllowed,
    clearActCookie,
    // A write made while leading: the trainer and what changed, in the client's log.
    logWrite(client, actor, cur, next) {
      if (!on) return;
      let d = null;
      try { d = diffStates(cur, next); } catch (e) { d = { error: String(e.message).slice(0, 80) }; }
      if (d) log(client.id, { ev: 'write', by: who(actor), changes: d });
    },
    // A write that added notes to workouts (kl14): a push to the other side. A trainer leading the
    // client wrote it: to the client. The client wrote it: to the trainers of that workout's thread
    // (who led it, who wrote in it) still allowed to lead them. Never throws into the request.
    notesAfterWrite(u, actor, cur, next) {
      if (!on || !sendPush || !u) return;
      try {
        for (const { w, n } of addedNotes(cur, next)) {
          if (actor) { sendPush(u.id, notePush(langOf(u.id), 'toClient', actor.name || n.by?.name, w, n.text)); continue; }
          if (n.by?.role === 'trainer') continue;
          for (const tid of trainersOf(w)) {
            const t = userById(tid);
            if (t && t.id !== u.id && canLead(t, u)) sendPush(t.id, { ...notePush(langOf(t.id), 'toTrainer', u.name, w, n.text), url: '#/silownia?feed=' + encodeURIComponent(u.id) + '&w=' + encodeURIComponent(String(w.id)) });
          }
        }
      } catch (e) { console.error('gymv2 notes push', e.message); }
    },
    // After a write of a client's document (patch 0004): join a trainer's and the client's workout
    // of one session. Never throws into the request: the write itself is done.
    afterWrite(u) {
      // The workout a live channel carried is in the document now: the channel is over (patch 0006).
      if (live && u) { try { live.savedInState(u.id, readStateCached(u.id)); } catch (e) { console.error('gymv2 live', u.id, e.message); } }
      if (!on || !mergeOn || !writeStateAs || !u) return;
      if (!isMember(u) || isAdmin(u) || isTrainer(u)) return;
      try { reconcile(u); } catch (e) { console.error('gymv2 merge', u.id, e.message); }
    },
    roleOf(u) { return !on || !u ? null : isAdmin(u) ? 'admin' : isTrainer(u) ? 'trainer' : isMember(u) ? 'member' : 'none'; },
    removeUser(uid) {
      if (!on) return;
      const d = store.get();
      d.trainers = d.trainers.filter(t => t.userId !== uid);
      if (d.members.some(x => x.userId === uid)) pruneGroups(uid);
      d.members = d.members.filter(x => x.userId !== uid);
      d.invites = d.invites.filter(i => i.userId !== uid);
      store.save();
      try { fs.unlinkSync(logFile(uid)); } catch { /* none */ }
    }
  };
}
