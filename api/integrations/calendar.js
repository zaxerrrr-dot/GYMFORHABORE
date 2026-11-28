/* The calendar feed (v1.4.5): a private ICS address of a profile's planned sessions, and, if the
 * person wants, the workouts they finished, for Apple Calendar, Google Calendar, Outlook or
 * anything else that subscribes to an iCalendar URL. Settings → Integrations → Calendar feed.
 *
 * The address carries a scoped token (tokens.js) of its own kind, `calendar`: it can read the
 * plan (and the workouts when asked) through this one route and nothing else, the API token routes
 * refuse it, and it ends with "sign out everywhere" like every token. A calendar app cannot send
 * a header, so the token is in the path; it is sealed in db.json (crypto.js) so Settings can show
 * the address again, and a new address ends the old one.
 *
 * What a day holds is the reminder's own rule (queue.js effectiveRoutineId): a per-date override,
 * then a coach week or rotation's next session, then the weekday plan with its combined routines.
 * A floating coach-week or rotation session has no day of its own past today, so after today
 * only pins, overrides and weekdays show. Planned days are all-day events (they have no time);
 * finished workouts are timed events in UTC.
 *
 * Pure, so the tests can feed it documents. docs/CALENDAR.md is the reference. */
import { effectiveRoutineId, queueLiveOn } from '../queue.js';
import { libraryName } from '../coach/core/library.js';
import { workoutTime } from './events.js';
import { sessionsOf, sessionStart, sessionEnd, SESS_LOCATION, firstName } from '../sessions-core.js';

export const PAST_DAYS = 7;
export const AHEAD_DAYS = 56;
export const DONE_DAYS = 90;
const MAX_EVENTS = 400;
const NAME_MAX = 80;

const list = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && !Array.isArray(x)) : []);

/** The calendar date of an instant in `tz` (UTC when unset or unknown). */
export function dayIn(ms, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
    const g = t => parts.find(x => x.type === t)?.value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  } catch { return new Date(ms).toISOString().slice(0, 10); }
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** RFC 5545 text: backslash, semicolon, comma and line breaks escaped, controls dropped. */
export function icsText(v) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/** A content line folded at 75 octets, continuation lines starting with a space. */
export function fold(line) {
  const out = [];
  let cur = '', n = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const dateValue = iso => iso.replace(/-/g, '');

function exerciseName(id, doc) {
  const own = list(doc?.customEx).find(c => String(c.id) === String(id));
  return String(own?.n || own?.name || libraryName(String(id)) || id).slice(0, NAME_MAX);
}

/** The routine ids a day holds, in the reminder's order of precedence. */
export function dayRoutines(S, iso, today) {
  const routines = list(S?.routines);
  const known = new Set(routines.map(r => r.id));
  const ov = S?.dayPlan?.[iso];
  if (ov === 'rest') return [];
  // A floating session is "today's" on every future day; it has no day of its own there.
  if (iso > today && queueLiveOn(S, iso) && !ov) {
    const wd = new Date(iso + 'T12:00:00').getDay();
    const queued = new Set(Array.isArray(S.queue?.ids) ? S.queue.ids : []);
    return [].concat(S.week?.[wd] || []).filter(id => known.has(id) && !queued.has(id));
  }
  const first = effectiveRoutineId(S, iso);
  if (!first) return [];
  // A plain weekday can combine routines; an override or a queue session is one.
  const wd = new Date(iso + 'T12:00:00').getDay();
  const week = [].concat(S.week?.[wd] || []).filter(id => known.has(id));
  if (!ov && week.includes(first) && !queueLiveOn(S, iso)) return week;
  return [first];
}

/* Habcore Gym (kl18): the feed's own words in the profile's language (Polish unless English). */
const FEED_COPY = {
  pl: { workout: 'Trening', planDesc: 'Plan na ten dzień · ćwiczeń: {0}', time: 'Czas: {0}', vol: 'Objętość: {0}', sets: 'Serie: {0}', ex: 'Ćwiczenia: {0}', noTime: 'bez zapisanego czasu' },
  en: { workout: 'Workout', planDesc: 'Plan for the day · exercises: {0}', time: 'Time: {0}', vol: 'Volume: {0}', sets: 'Sets: {0}', ex: 'Exercises: {0}', noTime: 'no time logged' },
};
export const feedCopy = lang => (String(lang || 'pl').toLowerCase().startsWith('en') ? FEED_COPY.en : FEED_COPY.pl);
const fillC = (s, ...a) => a.reduce((x, v, i) => x.split('{' + i + '}').join(String(v)), s);
const doneSet = s => s && (s.done === true || s.sides?.L?.done || s.sides?.R?.done);
/** Sets done, volume (weight × reps of done sets) and exercises of a logged workout. */
export function workoutFacts(w) {
  let sets = 0, vol = 0, ex = 0;
  for (const e of list(w.entries)) {
    const done = list(e.sets).filter(doneSet);
    if (done.length) ex++;
    sets += done.length;
    for (const s of done) vol += (Number(s.w) || 0) * (Number(s.r) || 0);
  }
  return { sets, vol: Math.round(vol), ex };
}
/** The workout's real name: its plans' names, else the name it was saved with. Never an icon. */
export function workoutTitle(w, routines, c) {
  const ids = Array.isArray(w.routineIds) && w.routineIds.length ? w.routineIds : w.routineId ? [w.routineId] : [];
  const names = ids.map(id => routines.get(id)?.name).filter(Boolean).map(x => String(x).trim()).filter(Boolean);
  return (names.length ? names.join(' + ') : String(w.name || '').trim() || c.workout).slice(0, NAME_MAX);
}
const thin = v => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
function doneText(f, ms, timed, unit, c) {
  const min = Math.round(ms / 60000);
  const dur = min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}` : `${min} min`;
  return [fillC(c.time, timed ? dur : c.noTime), ...(f.vol > 0 ? [fillC(c.vol, thin(f.vol) + ' ' + (unit === 'lb' ? 'lb' : 'kg'))] : []), fillC(c.sets, f.sets), fillC(c.ex, f.ex)].join('\n');
}

/**
 * The feed's text. `opts`: { uid, now, tz, done (with finished workouts), name (the profile's) }.
 * Every event has a stable UID, so a calendar updates an event in place instead of doubling it.
 */
export function buildIcs(S, { uid = 'u', now = Date.now(), tz = S?.reminder?.tz, done = false, name = '' } = {}) {
  // Habcore Gym (kl18): the gym's clock when the profile names none (a calendar's "today" was UTC's).
  const today = dayIn(now, tz || 'Europe/Warsaw');
  const c = feedCopy(S?.lang);
  const routines = new Map(list(S?.routines).map(r => [r.id, r]));
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habcore Gym//Calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText(name ? `Habcore Gym · ${name}` : 'Habcore Gym'),
    'X-WR-TIMEZONE:Europe/Warsaw',
    'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  let n = 0;
  const event = props => {
    if (n >= MAX_EVENTS) return;
    n++;
    lines.push('BEGIN:VEVENT', ...props, 'END:VEVENT');
  };
  // Every day with a workout logged: its plan day is done, whether finished workouts are shown or not.
  const doneDays = new Set(list(S?.workouts).map(w => (typeof w.d === 'string' ? w.d.slice(0, 10) : '')).filter(Boolean));
  if (done) {
    const since = now - DONE_DAYS * 86400000;
    for (const w of list(S?.workouts)) {
      const at = workoutTime(w);
      if (!at || at < since || at > now + 86400000) continue;
      // Habcore Gym (kl18): the workout's real time (start-end); an entry without a length (a trainer's
      // entry the old way: start = end) gets an hour.
      const start = Number(w.start) || at;
      const end = Number(w.end) > start + 60000 ? Number(w.end) : start + 3600000;
      const f = workoutFacts(w);
      event([
        'UID:' + icsText(`done-${String(w.id).slice(0, 60)}-${uid}@opengym`),
        'DTSTAMP:' + stamp(now),
        'DTSTART:' + stamp(start), 'DTEND:' + stamp(end),
        'SUMMARY:' + icsText('✓ ' + workoutTitle(w, routines, c)),
        'DESCRIPTION:' + icsText(doneText(f, end - start, Number(w.end) > start + 60000, S?.unit, c)),
        'CATEGORIES:Habcore Gym', 'TRANSP:TRANSPARENT',
      ]);
    }
  }
  // The plan of a day (no time of its own): today and the days to come that are not done yet. A day
  // gone by without a workout is not put back in the calendar (the app's streak tells that story).
  for (let i = 0; i <= AHEAD_DAYS; i++) {
    const iso = addDays(today, i);
    if (doneDays.has(iso)) continue;
    for (const id of dayRoutines(S, iso, today)) {
      const r = routines.get(id);
      if (!r) continue;
      const count = list(r.ex).length;
      event([
        'UID:' + icsText(`plan-${iso}-${String(id).slice(0, 60)}-${uid}@opengym`),
        'DTSTAMP:' + stamp(now),
        'DTSTART;VALUE=DATE:' + dateValue(iso), 'DTEND;VALUE=DATE:' + dateValue(addDays(iso, 1)),
        // Never the plan's icon: `emoji` holds an icon's name ("dumbbell", "flame") since the glyph icons.
        'SUMMARY:' + icsText(String(r.name || '').trim().slice(0, NAME_MAX) || c.workout),
        'DESCRIPTION:' + icsText(fillC(c.planDesc, count)),
        'CATEGORIES:Habcore Gym', 'TRANSP:TRANSPARENT',
      ]);
    }
  }
  // Habcore Gym (kl16): sessions a trainer planned at a time of day, as timed events.
  for (const ev of sessionEvents(sessionsOf(S), { now, lang: S?.lang, uidTag: 'c-' + uid, kind: 'client' })) event(ev);
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/* ---------- Habcore Gym (kl16, local patch 0018): sessions at a time of day ----------
 * Times go out in UTC (DTSTART:…Z). Every occurrence is its own event (the server expands a repeat
 * when it is planned, no RRULE), so nothing is left for a calendar to work out across a change of
 * summer/winter time, and Google Calendar, Apple Calendar and Outlook all read a UTC time the same
 * way; a TZID with a VTIMEZONE of our own is what Outlook's subscriptions have read wrongly before.
 * The wall time in Poraj was turned into UTC with that day's offset (sessions-core.js wallToUtc).
 * UID: one per occurrence and feed, never reused; SEQUENCE counts its changes, LAST-MODIFIED says
 * when. A cancelled occurrence stays for CANCEL_SHOWN_MS as STATUS:CANCELLED (a calendar that
 * refreshes in that time strikes it out or removes it), then leaves the feed. */
export const SESS_PAST_DAYS = 30;
export const SESS_AHEAD_DAYS = 180;
export const CANCEL_SHOWN_MS = 2 * 86400000;
const SESS_COPY = {
  pl: { with: 'Trening z trenerem {0} – Habcore Gym', alone: 'Trening – Habcore Gym', cancelled: 'Odwołany: ', plan: 'Plan: {0}', note: 'Notatka: {0}', trainer: 'Prowadzi: {0}',
    client: 'Trening: {0} – Habcore Gym', clientPlan: 'Trening: {0} · {1} – Habcore Gym', cal: 'Habcore Gym · grafik {0}' },
  en: { with: 'Workout with {0} – Habcore Gym', alone: 'Workout – Habcore Gym', cancelled: 'Cancelled: ', plan: 'Plan: {0}', note: 'Note: {0}', trainer: 'Trainer: {0}',
    client: 'Session: {0} – Habcore Gym', clientPlan: 'Session: {0} · {1} – Habcore Gym', cal: 'Habcore Gym · {0}’s schedule' },
};
const copyOf = lang => (String(lang || '').toLowerCase().startsWith('pl') ? SESS_COPY.pl : SESS_COPY.en);
const fillIn = (s, ...a) => a.reduce((x, v, i) => x.split('{' + i + '}').join(String(v)), s);

/** The VEVENT lines of sessions. `kind` 'client' (a client's own feed) or 'trainer' (`s.client` set). */
export function sessionEvents(list, { now = Date.now(), lang = 'pl', uidTag = 'x', kind = 'client' } = {}) {
  const c = copyOf(lang);
  const from = now - SESS_PAST_DAYS * 86400000, to = now + SESS_AHEAD_DAYS * 86400000;
  const out = [];
  for (const s of list) {
    const a = sessionStart(s), b = sessionEnd(s);
    if (!Number.isFinite(a) || a < from || a > to) continue;
    if (s.cx && s.cx < now - CANCEL_SHOWN_MS) continue;
    const plan = String(s.rname || '').slice(0, NAME_MAX);
    let title, desc;
    if (kind === 'trainer') {
      const who = firstName(s.client?.name);
      title = plan ? fillIn(c.clientPlan, who, plan) : fillIn(c.client, who);
      // Only the client's first name and the plan: no note, nothing about health.
      desc = [plan ? fillIn(c.plan, plan) : null].filter(Boolean);
    } else {
      title = s.tr?.name ? fillIn(c.with, String(s.tr.name).slice(0, 40)) : c.alone;
      desc = [plan ? fillIn(c.plan, plan) : null, s.tr?.name ? fillIn(c.trainer, s.tr.name) : null, s.note ? fillIn(c.note, String(s.note).slice(0, 500)) : null].filter(Boolean);
    }
    out.push([
      'UID:' + icsText(`sess-${String(s.id).slice(0, 60)}-${uidTag}@habcore-gym`),
      'DTSTAMP:' + stamp(now),
      ...(s.at ? ['CREATED:' + stamp(s.at)] : []),
      'LAST-MODIFIED:' + stamp(s.mod || s.at || now),
      'SEQUENCE:' + (Number(s.seq) || 0),
      'DTSTART:' + stamp(a), 'DTEND:' + stamp(b),
      'SUMMARY:' + icsText((s.cx ? c.cancelled : '') + title),
      ...(desc.length ? ['DESCRIPTION:' + icsText(desc.join('\n'))] : []),
      'LOCATION:' + icsText(SESS_LOCATION),
      'STATUS:' + (s.cx ? 'CANCELLED' : 'CONFIRMED'),
      'TRANSP:OPAQUE', 'CATEGORIES:Habcore Gym',
    ]);
    if (out.length >= MAX_EVENTS) break;
  }
  return out;
}

/** A trainer's feed: every session they lead, of every client of the gym (`list` items carry `client`). */
export function buildTrainerIcs(list, { uid = 't', now = Date.now(), lang = 'pl', name = '' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Habcore Gym//Trainer schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText(fillIn(copyOf(lang).cal, name || 'Habcore Gym')),
    'X-WR-TIMEZONE:Europe/Warsaw',
    'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const ev of sessionEvents(list, { now, lang, uidTag: 't-' + uid, kind: 'trainer' })) lines.push('BEGIN:VEVENT', ...ev, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
