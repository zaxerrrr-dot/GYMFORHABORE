// @vitest-environment happy-dom
// Habcore Gym (local patch 0006): Home's gym card puts the client training right now first, then
// the ones led last, and leaves out whom this trainer may not lead.
import { describe, expect, it } from 'vitest'
import { cardOrder } from './GymHomeCard.jsx'

describe('cardOrder', () => {
  it('live first, then the most recently led, then by last workout', () => {
    const c = (id, extra = {}) => ({ id, name: id, canLead: true, ...extra })
    const list = [c('a', { lastWorkout: '2026-11-20' }), c('b', { lastWorkout: '2026-11-25' }), c('c'), c('d', { live: { wid: 'w' } }), c('e', { canLead: false })]
    expect(cardOrder(list, ['c', 'a']).map(x => x.id)).toEqual(['d', 'c', 'a', 'b'])
  })
})
