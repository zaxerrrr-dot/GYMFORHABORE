// Joint training (local patch 0004, Habcore Gym): a client trains with the phone app and the watch,
// and at the same time a trainer logs the exercises for them through "Lead as client" (gymv2). The
// app keeps a running workout on its own device (server.js commitState: `delete state.active`), so
// the two can never be one workout while they run. Once both are finished and on the server, they
// are joined into one: the client's workout is the base (its id, start, end, heart rate, the link to
// Apple Health `opengym-w-<id>`, everything the phone and the watch wrote), and its exercises and
// sets are the trainer's.
//
// Pure: what is a pair, and what the joined workout is. The writing (with stamps the devices' merge
// honours), the backups and the log are in gymv2/index.js.
//
// Pairing. On one client's account: a finished workout the trainer added while leading (the
// gymv2 change log names it), and a finished workout that was not added that way (the client's
// own device). Their times overlap enough to be one session:
//   - the overlap is at least half of the shorter one (OVERLAP_SHARE), or
//   - they started at most START_GAP_MS apart (one of them was started late or finished early).
// Both must have ended within WINDOW_MS (two days), so nothing old is ever joined. A trainer workout
// with more than one client workout that fits (or the other way round) is not joined: the log says
// so and nothing changes.
//
// The joined workout (joinWorkouts):
//   - from the client's: id, d, start, end, name, bw, hr (the session's heart rate), media, gym,
//     autoEnded, note and every other field, including ones this file does not know;
//   - from the trainer's: entries (exercises, sets, reps, weights, set ticks `at`), prs, routineIds
//     and routineId (when the trainer's has a routine), excludeFromProgression, circuits;
//   - exercises: the trainer's win. An exercise the client also logged keeps the trainer's sets;
//     only the heart rate the watch measured on the client's set (hr, restHr) is carried over onto
//     the trainer's set of the same exercise ticked closest in time (within 3 minutes; by the set's
//     number when the client's set has no tick), where that set has none. An
//     exercise only the client logged is added after the trainer's;
//   - notes of both are kept (the client's first); media of both;
//   - `vol`: the trainer's, plus the volume of the client's exercises added;
//   - gymMerge: { id, by: { id, name }, from: <the trainer's workout id>, at } - marks it.

import { stampEntry } from '../sync-stamps.js';

export const OVERLAP_SHARE = 0.5;
export const START_GAP_MS = 20 * 60 * 1000;
export const WINDOW_MS = 48 * 3600 * 1000;

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const num = v => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/** { start, end } of a finished workout, or null when it has no usable times. */
export function spanOf(w) {
  if (!isMap(w)) return null;
  const start = num(w.start), end = num(w.end);
  if (!(start > 0) || !(end > start)) return null;
  return { start, end };
}

/** Whether two finished workouts are one session (see the top of the file). */
export function overlapping(a, b) {
  const x = spanOf(a), y = spanOf(b);
  if (!x || !y) return false;
  const shorter = Math.min(x.end - x.start, y.end - y.start);
  const over = Math.min(x.end, y.end) - Math.max(x.start, y.start);
  if (over > 0 && over >= OVERLAP_SHARE * shorter) return true;
  return Math.abs(x.start - y.start) <= START_GAP_MS;
}

/**
 * The pairs among `workouts` (a state's list): { pairs: [{ trainer, client }], ambiguous: [...] }.
 * `trainerIds`: Set of ids the trainer added while leading. `skip(id)`: ids taken out of pairing
 * (already joined, a join undone). Only workouts that ended within WINDOW_MS of `now`.
 */
export function findPairs(workouts, trainerIds, { now = Date.now(), skip = () => false, isPairDone = () => false } = {}) {
  const recent = (Array.isArray(workouts) ? workouts : []).filter(w => {
    const s = spanOf(w);
    return s && w.id != null && now - s.end <= WINDOW_MS && s.end <= now + 10 * 60 * 1000 && !skip(String(w.id));
  });
  const T = recent.filter(w => trainerIds.has(String(w.id)));
  const C = recent.filter(w => !trainerIds.has(String(w.id)) && !isMap(w.gymMerge));
  const fits = new Map();       // trainer id -> client workouts
  const back = new Map();       // client id -> trainer workouts
  for (const t of T) {
    for (const c of C) {
      if (isPairDone(String(t.id), String(c.id)) || !overlapping(t, c)) continue;
      if (!fits.has(t.id)) fits.set(t.id, []);
      fits.get(t.id).push(c);
      if (!back.has(c.id)) back.set(c.id, []);
      back.get(c.id).push(t);
    }
  }
  const pairs = [], ambiguous = [];
  for (const t of T) {
    const cs = fits.get(t.id) || [];
    if (!cs.length) continue;
    if (cs.length === 1 && (back.get(cs[0].id) || []).length === 1) pairs.push({ trainer: t, client: cs[0] });
    else ambiguous.push({ trainer: String(t.id), clients: cs.map(c => String(c.id)), trainers: [...new Set(cs.flatMap(c => (back.get(c.id) || []).map(x => String(x.id))))] });
  }
  return { pairs, ambiguous };
}

/* ---------- joining ---------- */
const doneRow = s => isMap(s) && (s.done === true || (isMap(s.sides) && (s.sides.L?.done === true || s.sides.R?.done === true)));
const warm = s => isMap(s) && (s.warmup === true || s.phase === 'warmup' || s.type === 'warmup');
const n0 = v => (Number(v) > 0 ? Number(v) : 0);
/** A rough volume (weight x reps of done working sets, drops and both sides included) of some entries. */
export function volumeOf(entries) {
  let v = 0;
  for (const e of Array.isArray(entries) ? entries : []) {
    for (const s of Array.isArray(e?.sets) ? e.sets : []) {
      if (!doneRow(s) || warm(s)) continue;
      const rows = isMap(s.sides) ? [s.sides.L, s.sides.R].filter(x => x?.done === true) : [s];
      for (const r of rows) {
        v += n0(r.w) * n0(r.r);
        for (const d of Array.isArray(r.drops) ? r.drops : []) v += n0(d?.w) * n0(d?.r);
      }
    }
  }
  return Math.round(v * 100) / 100;
}

// How far apart the client's and the trainer's tick of one set may be.
export const HR_MATCH_MS = 3 * 60 * 1000;
const hrOk = v => isMap(v) && Number(v.avg) > 0 && Number(v.max) > 0;

/**
 * The trainer's exercises with the client's own added (see the top of the file). Never mutates its
 * arguments. → { entries, added } (`added`: the client's entries put in).
 */
export function joinEntries(trainerEntries, clientEntries) {
  const out = clone(Array.isArray(trainerEntries) ? trainerEntries.filter(isMap) : []);
  const used = new Set();
  const added = [];
  for (const ce of Array.isArray(clientEntries) ? clientEntries.filter(isMap) : []) {
    const i = out.findIndex((e, k) => !used.has(k) && e.id != null && String(e.id) === String(ce.id));
    if (i < 0) { const x = clone(ce); out.push(x); added.push(x); continue; }
    used.add(i);
    const te = out[i];
    const ts = Array.isArray(te.sets) ? te.sets : [];
    (Array.isArray(ce.sets) ? ce.sets : []).forEach((from, k) => {
      if (!isMap(from) || !(hrOk(from.hr) || hrOk(from.restHr))) return;
      // The trainer's set ticked closest to the client's tick (within HR_MATCH_MS); a client's set
      // without a tick goes by its number.
      let s = null;
      const fa = Number(from.at);
      if (fa > 0) {
        let best = Infinity;
        for (const x of ts) {
          const d = Math.abs((Number(x?.at) || -Infinity) - fa);
          if (isMap(x) && d <= HR_MATCH_MS && d < best) { best = d; s = x; }
        }
      } else s = isMap(ts[k]) ? ts[k] : null;
      if (!s) return;
      if (!hrOk(s.hr) && hrOk(from.hr)) s.hr = clone(from.hr);
      if (!hrOk(s.restHr) && hrOk(from.restHr)) s.restHr = clone(from.restHr);
    });
  }
  return { entries: out, added };
}

/** The joined workout (a new object). `meta`: { id, by: { id, name }, at }. */
export function joinWorkouts(client, trainer, meta) {
  const out = clone(client);
  for (const k of ['_ts', '_f', '_u']) delete out[k];
  const { entries, added } = joinEntries(trainer.entries, client.entries);
  out.entries = entries;
  const prs = [...new Set([...(Array.isArray(trainer.prs) ? trainer.prs : []), ...(Array.isArray(client.prs) ? client.prs.filter(id => added.some(e => String(e.id) === String(id))) : [])])];
  out.prs = prs;
  const tRoutines = Array.isArray(trainer.routineIds) ? trainer.routineIds.filter(x => x != null) : [];
  if (tRoutines.length) {
    const cRoutines = Array.isArray(client.routineIds) ? client.routineIds.filter(x => x != null) : [];
    out.routineIds = [...new Set([...tRoutines, ...cRoutines])];
    out.routineId = out.routineIds[0];
    // A client's workout with no routine is named after nothing in particular: the trainer's name.
    if (!cRoutines.length && typeof trainer.name === 'string' && trainer.name.trim()) out.name = trainer.name;
  }
  if (trainer.excludeFromProgression === true && !added.length) out.excludeFromProgression = true; else delete out.excludeFromProgression;
  if (Array.isArray(trainer.circuits) && trainer.circuits.length) out.circuits = clone(trainer.circuits);
  const tv = Number(trainer.vol);
  out.vol = Math.round(((Number.isFinite(tv) ? tv : volumeOf(trainer.entries)) + volumeOf(added)) * 100) / 100;
  if (!(typeof out.name === 'string' && out.name.trim()) && typeof trainer.name === 'string') out.name = trainer.name;
  const notes = [client.note, trainer.note].map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  const note = [...new Set(notes)].join('\n');
  if (note) out.note = note.slice(0, 2000); else delete out.note;
  const media = [...(Array.isArray(client.media) ? client.media : []), ...(Array.isArray(trainer.media) ? trainer.media : [])];
  const seen = new Set();
  const m = media.filter(x => { const k = JSON.stringify(isMap(x) ? (x.hash || x.id || x) : x); if (seen.has(k)) return false; seen.add(k); return true; });
  if (m.length) out.media = clone(m); else delete out.media;
  out.gymMerge = { id: meta.id, by: meta.by, from: String(trainer.id), at: meta.at };
  return out;
}

// The content of entries without the heart rate on their sets: what tells "the client's own sets
// came back over the join" (a device that edited them before it saw the join) from anything else.
export function entriesCore(entries) {
  return JSON.stringify(Array.isArray(entries) ? entries : [], (k, v) => (k === 'hr' || k === 'restHr' ? undefined : v));
}

// The key and the edit time of a workout, as the devices' merge and the removal records read them
// (frontend lib/sync-merge.js workoutKey / workoutTime, api/sync-stamps.js).
const wKey = w => (w?.id != null ? String(w.id) : `${w?.d}|${w?.start}`);
const wTime = w => Number(w?._ts) || Number(w?.end) || Number(w?.start) || 0;

/**
 * Puts `joined` in place of workout `baseId` of document `next` (mutated), stamped as an edit at `t`
 * field by field (sync-stamps.js stampEntry: `_ts` and `_f`), so every device's merge takes the
 * joined fields over its own older copy; and removes the trainer's workout with a removal record
 * later than its last edit (`deleted.workouts`), so no device's copy of it comes back. `t` must be
 * later than every stamp in the document (writeStateAs gives such a time). False when the base is gone.
 */
export function placeJoin(next, t, baseId, joined, trainerW) {
  const ws = Array.isArray(next.workouts) ? next.workouts : (next.workouts = []);
  const i = ws.findIndex(w => w && String(w.id) === String(baseId));
  if (i < 0) return false;
  const old = ws[i];
  const x = clone(joined);
  delete x._ts; delete x._f; delete x._u;
  if (isMap(old._f)) x._f = clone(old._f);
  stampEntry(old, x, t);
  ws[i] = x;
  const k = wKey(trainerW);
  next.workouts = ws.filter(w => !(w && w !== x && wKey(w) === k));
  next.deleted = isMap(next.deleted) ? next.deleted : {};
  const del = isMap(next.deleted.workouts) ? next.deleted.workouts : (next.deleted.workouts = {});
  del[k] = Math.max(t, wTime(trainerW) + 1, Math.abs(Number(del[k]) || 0) + 1);
  return true;
}
