// Habcore Gym (kl14, local patch 0016): a workout's notes as a thread, the way comments sit under an
// activity. The client and their trainer both write; each note says who wrote it and when.
//
// Stored on the workout as `notes: [{ id, text, at, by: { id, name, role }, e? , del? }]`:
//   role 'trainer' for a trainer (leading the client, or from the gym panel), 'self' otherwise;
//   `e` is when the text was last edited; a deleted note stays as `{ id, at, del: true, e }` so
//   the sync merge (mergeWorkoutNotes) does not bring it back from an older copy.
// The old single field `note` stays the first note's text (exports, the share card, older builds
// read it); a workout from before has only `note`, read here as the thread's first note.
export const WORKOUT_NOTE_MAX = 2000
const NOTES_CAP = 200

const list = v => (Array.isArray(v) ? v : [])
const str = v => (typeof v === 'string' ? v : '')
const cleanBy = by => (by && typeof by === 'object' && by.id
  ? { id: String(by.id).slice(0, 64), name: str(by.name).slice(0, 60), role: by.role === 'trainer' ? 'trainer' : 'self' }
  : null)

/** The notes as stored, the legacy `note` read as the first one. Tombstones included. */
export function rawNotesOf(w, owner = null) {
  if (!w || typeof w !== 'object') return []
  const own = list(w.notes).filter(n => n && typeof n === 'object' && n.id)
  if (own.length) return own
  const text = str(w.note).trim()
  if (!text) return []
  return [{ id: 'n0', text, at: Number(w.end) || Number(w.start) || 0, by: owner ? cleanBy({ ...owner, role: 'self' }) : null }]
}
/** What the thread shows: oldest first, deleted ones left out. */
export const notesOf = (w, owner = null) => rawNotesOf(w, owner).filter(n => !n.del && str(n.text).trim()).sort((a, b) => (a.at || 0) - (b.at || 0))
export const notesCount = w => notesOf(w).length

// `note` follows the first note still standing.
function syncLegacy(w) {
  const shown = notesOf(w)
  if (shown.length) w.note = shown[0].text; else delete w.note
}
// The thread as stored, the legacy note made a real entry the first time anything is written.
function ensure(w, owner) {
  if (!Array.isArray(w.notes) || !w.notes.length) w.notes = rawNotesOf({ note: w.note, start: w.start, end: w.end }, owner).map(n => ({ ...n }))
  return w.notes
}
const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** Adds a note to `w` (mutates). Returns the note, or null for an empty text. */
export function addNote(w, { text, by, owner = null, now = Date.now() }) {
  const body = str(text).trim().slice(0, WORKOUT_NOTE_MAX)
  if (!body || !w) return null
  const notes = ensure(w, owner)
  const n = { id: newId(), text: body, at: now, by: cleanBy(by) }
  notes.push(n)
  if (notes.length > NOTES_CAP) w.notes = notes.slice(-NOTES_CAP)
  syncLegacy(w)
  return n
}
/** Changes the text of one note (only its own author's, checked by the caller). Empty = delete. */
export function editNote(w, id, text, { owner = null, now = Date.now() } = {}) {
  const body = str(text).trim().slice(0, WORKOUT_NOTE_MAX)
  if (!body) return deleteNote(w, id, { owner, now })
  const n = ensure(w, owner).find(x => x.id === id && !x.del)
  if (!n) return false
  if (n.text === body) return false
  n.text = body; n.e = now
  syncLegacy(w)
  return true
}
export function deleteNote(w, id, { owner = null, now = Date.now() } = {}) {
  const notes = ensure(w, owner)
  const i = notes.findIndex(x => x.id === id && !x.del)
  if (i < 0) return false
  notes[i] = { id, at: notes[i].at, del: true, e: now }
  syncLegacy(w)
  return true
}
/** Who may change a note: its author (a note from before the thread is the owner's own). */
export const mayChange = (n, me) => !!me && (n.by ? n.by.id === me : true)

/**
 * Sync: of a workout both copies have, the kept version's thread gains the other's notes; a note
 * both have keeps the later edit, a deletion on either side wins over an older text. Mutates and
 * returns `kept`.
 */
export function mergeWorkoutNotes(kept, other) {
  if (!kept || typeof kept !== 'object' || !other || typeof other !== 'object') return kept
  // Only threads are joined: a plain `note` is one field, merged as the sync merges any field.
  const theirs = list(other.notes).filter(n => n && n.id)
  if (!theirs.length) return kept
  const mine = rawNotesOf(kept)
  const by = new Map(mine.map(n => [n.id, n]))
  const stamp = n => Math.max(Number(n.e) || 0, Number(n.at) || 0)
  for (const n of theirs) {
    const x = by.get(n.id)
    if (!x) { by.set(n.id, { ...n }); continue }
    if (n.del && !x.del) { by.set(n.id, { ...n }); continue }
    if (!x.del && !n.del && stamp(n) > stamp(x)) by.set(n.id, { ...n })
  }
  kept.notes = [...by.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-NOTES_CAP)
  syncLegacy(kept)
  return kept
}

/** The notes as text, for "Copy as text" and the export: "Name (Trainer): text" one per line. */
export function notesText(w, { trainerWord = 'Trainer' } = {}) {
  return notesOf(w).map(n => (n.by?.role === 'trainer' ? `${n.by.name || trainerWord} (${trainerWord}): ` : '') + n.text).join('\n\n')
}
