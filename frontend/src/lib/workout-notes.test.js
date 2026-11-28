// Habcore Gym (kl14): a workout's notes as a thread (lib/workout-notes.js).
import { describe, it, expect } from 'vitest'
import { notesOf, addNote, editNote, deleteNote, mergeWorkoutNotes, notesText, mayChange } from './workout-notes.js'

const W = extra => ({ id: 'w1', d: '2026-11-20', start: 1000, end: 5000, entries: [], ...extra })
const me = { id: 'U1', name: 'Ania', role: 'self' }
const tr = { id: 'T1', name: 'Tomasz', role: 'trainer' }

describe('workout notes', () => {
  it('reads the old single note as the first one, and keeps `note` the first note', () => {
    const w = W({ note: 'Felt strong' })
    expect(notesOf(w).map(n => n.text)).toEqual(['Felt strong'])
    const n = addNote(w, { text: 'Great depth', by: tr, owner: { id: 'U1', name: 'Ania' }, now: 9000 })
    expect(w.notes.map(x => x.text)).toEqual(['Felt strong', 'Great depth'])
    expect(w.notes[0].by).toEqual({ id: 'U1', name: 'Ania', role: 'self' })
    expect(w.note).toBe('Felt strong')
    expect(n.by.role).toBe('trainer')
    expect(mayChange(w.notes[0], 'T1')).toBe(false)
    expect(mayChange(n, 'T1')).toBe(true)
  })
  it('edits and deletes; a deletion stays as a tombstone and moves `note` on', () => {
    const w = W()
    const a = addNote(w, { text: 'one', by: me, now: 1 })
    addNote(w, { text: 'two', by: tr, now: 2 })
    expect(editNote(w, a.id, 'one!', { now: 3 })).toBe(true)
    expect(w.note).toBe('one!')
    expect(deleteNote(w, a.id, { now: 4 })).toBe(true)
    expect(w.note).toBe('two')
    expect(w.notes.find(x => x.id === a.id).del).toBe(true)
    expect(notesOf(w).length).toBe(1)
    expect(addNote(w, { text: '   ', by: me })).toBe(null)
  })
  it('merges two copies: both sides\' new notes, the later edit, a deletion wins', () => {
    const base = W()
    const a = addNote(base, { text: 'base', by: me, now: 10 })
    const x = JSON.parse(JSON.stringify(base)), y = JSON.parse(JSON.stringify(base))
    addNote(x, { text: 'from phone', by: me, now: 20 })
    addNote(y, { text: 'from trainer', by: tr, now: 21 })
    deleteNote(y, a.id, { now: 30 })
    mergeWorkoutNotes(x, y)
    expect(notesOf(x).map(n => n.text)).toEqual(['from phone', 'from trainer'])
    expect(x.note).toBe('from phone')
    expect(notesText(x)).toBe('from phone\n\nTomasz (Trainer): from trainer')
  })
})
