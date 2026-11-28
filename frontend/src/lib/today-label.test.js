/* Habcore Gym (kl15.1): "Upper · rescheduled" on a day the owner simply picked Upper (no weekly plan).
   The note under Today's session now: nothing for a pick, "Instead of" over a planned session,
   "Moved from <day>" only when it was planned on an earlier day this week and not done there. */
import { describe, expect, it } from 'vitest'
import { dayChoiceNote } from './today-label.js'
import { DEF } from '../store/useStore.js'

const R = [{ id: 'up', name: 'Upper', ex: [] }, { id: 'lo', name: 'Lower', ex: [] }]
const S = patch => ({ ...structuredClone(DEF), routines: R, ...patch })

describe('dayChoiceNote', () => {
  it('the live shape: no weekly plan, Upper picked for Saturday -> nothing', () => {
    expect(dayChoiceNote(S({ week: {}, dayPlan: { '2026-11-24': 'up', '2026-11-28': 'up' } }), '2026-11-28')).toBe(null)
  })
  it('a pick over a planned session says what it replaced; the same session says nothing', () => {
    expect(dayChoiceNote(S({ week: { 6: ['lo'] }, dayPlan: { '2026-11-28': 'up' } }), '2026-11-28')).toEqual({ kind: 'instead', ids: ['lo'] })
    expect(dayChoiceNote(S({ week: { 6: ['up'] }, dayPlan: { '2026-11-28': 'up' } }), '2026-11-28')).toBe(null)
    expect(dayChoiceNote(S({ week: { 6: ['lo'] }, dayPlan: { '2026-11-28': 'rest' } }), '2026-11-28')).toBe(null)
  })
  it('moved: planned on Thursday this week, not done there', () => {
    const base = { week: { 4: ['up'] }, dayPlan: { '2026-11-28': 'up' } }
    expect(dayChoiceNote(S(base), '2026-11-28')).toEqual({ kind: 'moved', from: '2026-11-26' })
    // Done on Thursday: a second Upper on Saturday is a pick, not a move.
    expect(dayChoiceNote(S({ ...base, workouts: [{ id: 'w', d: '2026-11-26', start: 1, end: 2, entries: [] }] }), '2026-11-28')).toBe(null)
    // Last week's Thursday is not this week's.
    expect(dayChoiceNote(S({ week: { 4: ['up'] }, dayPlan: { '2026-11-30': 'up' } }), '2026-11-30')).toBe(null)
  })
})
