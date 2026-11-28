// Habcore Gym (kl14): the workout feed's filters, groups, numbers and the comparison (lib/workout-feed.js).
import { describe, it, expect } from 'vitest'
import { feedFilter, feedGroups, cardFacts, previousSame, compareWorkouts, ledOf, repsDone, filterChoices } from './workout-feed.js'

const set = (w, r) => ({ w, r, done: true })
const W = (id, d, extra = {}) => ({ id, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T11:05:00'), name: 'Push', routineIds: ['r1'], routineId: 'r1',
  entries: [{ id: 'bench', sets: [set(80, 8), set(80, 8)] }, { id: 'dips', sets: [set(0, 10)] }], ...extra })
const S = { unit: 'kg', weekStart: 1, workouts: [] }

describe('workout feed', () => {
  const ws = [W('a', '2026-11-02'), W('b', '2026-11-10', { name: 'Legs', routineIds: ['r2'], routineId: 'r2', entries: [{ id: 'squat', sets: [set(100, 5)] }] }), W('c', '2026-11-24', { entries: [{ id: 'bench', sets: [set(85, 8), set(80, 8)] }], note: 'easy day' })]
  it('sorts newest first and filters by period, exercise, plan and search', () => {
    const nameOf = id => ({ bench: 'Bench press', squat: 'Squat' }[id] || id)
    expect(feedFilter(ws).map(w => w.id)).toEqual(['c', 'b', 'a'])
    expect(feedFilter(ws, { period: '7' }, { today: '2026-11-28' }).map(w => w.id)).toEqual(['c'])
    expect(feedFilter(ws, { ex: 'squat' }).map(w => w.id)).toEqual(['b'])
    expect(feedFilter(ws, { plan: 'r1' }).map(w => w.id)).toEqual(['c', 'a'])
    expect(feedFilter(ws, { q: 'bench' }, { nameOf }).map(w => w.id)).toEqual(['c', 'a'])
    expect(feedFilter(ws, { q: 'EASY' }).map(w => w.id)).toEqual(['c'])
    expect(filterChoices(ws).ex[0]).toBe('bench')
  })
  it('groups by week and month with the totals', () => {
    const g = feedGroups(feedFilter(ws), S, 'week')
    expect(g.map(x => x.key)).toEqual(['2026-11-23', '2026-11-09', '2026-11-02'])
    const m = feedGroups(feedFilter(ws), S, 'month')
    expect(m.length).toBe(1)
    expect(m[0].n).toBe(3)
    expect(m[0].from).toBe('2026-11-01')
    expect(m[0].to).toBe('2026-11-30')
  })
  it('a card\'s numbers, who led it, and the comparison with the same plan last time', () => {
    const f = cardFacts(ws[0], S)
    expect(f.sets).toBe(3); expect(f.reps).toBe(26); expect(f.exercises).toBe(2); expect(f.ms).toBe(65 * 60000)
    expect(repsDone(ws[1])).toBe(5)
    expect(ledOf({ name: 'Trening z trenerem' })).toEqual({ kind: 'group', name: '' })
    expect(ledOf({ led: { kind: 'trainer', name: 'Tomasz' } })).toEqual({ kind: 'trainer', name: 'Tomasz' })
    expect(ledOf(ws[0])).toBe(null)
    const prev = previousSame(ws, ws[2])
    expect(prev.id).toBe('a')
    const cmp = compareWorkouts(ws[2], prev, S)
    expect(cmp.up).toBe(1)
    expect(cmp.sets).toBe(-1)
    expect(previousSame(ws, ws[1])).toBe(null)
  })
})
