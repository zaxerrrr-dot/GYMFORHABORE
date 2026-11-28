// Habcore Gym (kl16, local patch 0018): sessions a trainer plans for a client at a time of day
// (sessions-core.js holds the rules). The server's part: the pushes about them, and the reminder
// before one. Polish and English; every other language reads the English.
import { sessionStart, remindBefore, upcoming } from '../sessions-core.js';

const COPY = {
  pl: {
    added: '{0} zaplanował(a) trening', addedN: '{0} zaplanował(a) {1} treningów',
    changed: '{0} zmienił(a) termin treningu', cancelled: '{0} odwołał(a) trening',
    remind: 'Trening o {0}', remindWith: 'Trening z trenerem {1} o {0}', remindBody: 'Habcore, ul. Mickiewicza 25J, Poraj',
  },
  en: {
    added: '{0} planned a workout', addedN: '{0} planned {1} workouts',
    changed: '{0} moved a workout', cancelled: '{0} cancelled a workout',
    remind: 'Workout at {0}', remindWith: 'Workout with {1} at {0}', remindBody: 'Habcore, ul. Mickiewicza 25J, Poraj',
  },
};
const copyOf = lang => (String(lang || '').toLowerCase().startsWith('pl') ? COPY.pl : COPY.en);
const fill = (s, ...a) => a.reduce((t, v, i) => t.split('{' + i + '}').join(String(v)), s);

/** "wt 2 gru, 18:00" in the client's language, on the gym's clock. */
export function whenText(s, lang) {
  const pl = String(lang || '').toLowerCase().startsWith('pl');
  try {
    const day = new Intl.DateTimeFormat(pl ? 'pl-PL' : 'en-GB', { timeZone: s.tz || 'Europe/Warsaw', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(sessionStart(s)));
    return `${day}, ${s.t}`;
  } catch { return `${s.d} ${s.t}`; }
}

/**
 * One push about what a trainer changed: `changes` [{ s, kind }] (sessions-core.js sessionChanges).
 * Several of one kind fold into one push (a whole series planned is one message).
 */
export function changePushes(lang, trainerName, changes) {
  const c = copyOf(lang);
  const name = String(trainerName || '').slice(0, 40) || '?';
  const out = [];
  for (const kind of ['added', 'changed', 'cancelled']) {
    const these = changes.filter(x => x.kind === kind).sort((a, b) => sessionStart(a.s) - sessionStart(b.s));
    if (!these.length) continue;
    const first = these[0].s;
    const title = kind === 'added' && these.length > 1 ? fill(c.addedN, name, these.length) : fill(c[kind], name);
    const body = these.slice(0, 3).map(x => whenText(x.s, lang) + (x.s.rname ? ' · ' + String(x.s.rname).slice(0, 30) : '')).join('; ') + (these.length > 3 ? ' …' : '');
    out.push({ title, body, tag: 'sess-' + kind + '-' + String(first.sid || first.id).slice(0, 40), url: '#/home?sess=' + encodeURIComponent(first.id) });
  }
  return out;
}

export function remindPush(lang, s) {
  const c = copyOf(lang);
  const title = s.tr?.name ? fill(c.remindWith, s.t, String(s.tr.name).slice(0, 40)) : fill(c.remind, s.t);
  return { title, body: (s.rname ? String(s.rname).slice(0, 40) + ' · ' : '') + c.remindBody, tag: 'sess-remind-' + String(s.id).slice(0, 40), url: '#/home?sess=' + encodeURIComponent(s.id) };
}

/**
 * The reminders owed now: [{ s, key }] for occurrences whose reminder time (start minus the
 * client's "before") has come within the last `windowMin` minutes and is not in `sent`.
 */
export function remindersDue(S, now, sent, windowMin = 15) {
  const before = remindBefore(S);
  if (!before) return [];
  const out = [];
  for (const s of upcoming(S?.sessions, now, 20)) {
    const at = sessionStart(s) - before * 60000;
    const key = `${s.id}:${s.d}:${s.t}`;
    if (now >= at && now - at <= windowMin * 60000 && now < sessionStart(s) && !sent.has(key)) out.push({ s, key });
  }
  return out;
}
