// Habcore Gym (kl14, local patch 0016): workout notes as a thread (frontend/src/lib/workout-notes.js).
// The server's part: who gets a push about a new note, the notes a write added, and the trainer's
// own way to write one from the gym panel without leading the client.
const list = v => (Array.isArray(v) ? v : []);
const str = v => (typeof v === 'string' ? v : '');
export const NOTE_MAX = 2000;

const COPY = {
  pl: {
    toClient: '{0} dodał(a) notatkę do Twojego treningu',
    toTrainer: '{0}: nowa notatka do treningu',
  },
  en: {
    toClient: '{0} left a note on your workout',
    toTrainer: '{0}: a new note on a workout',
  },
};
const fill = (s, ...a) => a.reduce((t, v, i) => t.split('{' + i + '}').join(String(v)), s);
export function notePush(lang, kind, name, w, text) {
  const c = String(lang || '').toLowerCase().startsWith('pl') ? COPY.pl : COPY.en;
  const title = fill(kind === 'toClient' ? c.toClient : c.toTrainer, str(name).slice(0, 40) || '?');
  const body = (str(w?.name) ? str(w.name).slice(0, 40) + ': ' : '') + str(text).replace(/\s+/g, ' ').slice(0, 120);
  return { title, body, tag: 'wnote-' + String(w?.id || '').slice(0, 40), url: '#/treningi?w=' + encodeURIComponent(String(w?.id || '')) };
}

const notesIn = w => list(w?.notes).filter(n => n && typeof n === 'object' && n.id && !n.del && str(n.text).trim());
/** The notes `next` has that `cur` did not (by workout id and note id): [{ w, n }]. */
export function addedNotes(cur, next) {
  const old = new Map(list(cur?.workouts).filter(w => w && w.id != null).map(w => [String(w.id), new Set(list(w.notes).map(n => n && n.id))]));
  const out = [];
  for (const w of list(next?.workouts)) {
    if (!w || w.id == null) continue;
    const had = old.get(String(w.id)) || new Set();
    for (const n of notesIn(w)) if (!had.has(n.id) && n.id !== 'n0') out.push({ w, n });
  }
  return out.slice(0, 20);
}
/** The trainers a client's note is for: whoever led that workout, and trainers in its thread. */
export function trainersOf(w) {
  const ids = new Set();
  if (w?.led?.id) ids.add(String(w.led.id));
  for (const n of notesIn(w)) if (n.by?.role === 'trainer' && n.by.id) ids.add(String(n.by.id));
  return [...ids];
}
const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function legacy(w) {
  if (list(w.notes).length) return;
  const t = str(w.note).trim();
  w.notes = t ? [{ id: 'n0', text: t, at: Number(w.end) || Number(w.start) || Date.now(), by: null }] : [];
}
function syncLegacy(w) {
  const shown = notesIn(w).sort((a, b) => (a.at || 0) - (b.at || 0));
  if (shown.length) w.note = shown[0].text; else delete w.note;
}
/**
 * One change to a workout's thread by `by` ({ id, name, role }): { text } adds, { nid, text } edits
 * its own, { nid, del: true } deletes its own. Mutates `w`; returns 'added' | 'edited' | 'deleted' or
 * an error code.
 */
export function applyNote(w, by, { nid = '', text = '', del = false }, now = Date.now()) {
  legacy(w);
  const body = str(text).trim().slice(0, NOTE_MAX);
  if (!nid) {
    if (!body) return 'empty';
    const n = { id: newId(), text: body, at: now, by };
    w.notes.push(n);
    syncLegacy(w);
    return { added: n };
  }
  const i = w.notes.findIndex(x => x && x.id === nid && !x.del);
  if (i < 0) return 'no-note';
  if (w.notes[i].by?.id !== by.id) return 'not-yours';
  if (del || !body) w.notes[i] = { id: nid, at: w.notes[i].at, del: true, e: now };
  else { w.notes[i].text = body; w.notes[i].e = now; }
  syncLegacy(w);
  return del || !body ? 'deleted' : 'edited';
}
