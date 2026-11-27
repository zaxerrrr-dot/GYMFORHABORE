// @vitest-environment happy-dom
/* Habcore Gym (kl12): the "Passa" card's numbers (components/Passa.jsx). */
import { describe, expect, it } from 'vitest'
import { passaData, weekLine, WEEKS_SHOWN } from './Passa.jsx'
import { isoOf } from '../lib/format.js'

const day = (base, n) => { const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
const TODAY = '2026-11-26' // a Thursday; the week starts Monday 2026-11-23
const w = (d, mins = 45, kg = 1000) => ({ id: 'w' + d + mins, d, start: Date.parse(d + 'T10:00:00'), end: Date.parse(d + 'T10:00:00') + mins * 60000, vol: kg })

describe('passaData', () => {
  it('counts the streak, marks the weeks oldest first, this week outlined while open', () => {
    const S = { weekStart: 1, unit: 'kg', workouts: [w(day('2026-11-23', -7)), w(day('2026-11-23', -14)), w(day('2026-11-23', -21))] }
    const p = passaData(S, TODAY)
    expect(p.weeks).toHaveLength(WEEKS_SHOWN)
    expect(p.weeks.at(-1)).toMatchObject({ wk: '2026-11-23', s: 'open' })
    expect(p.weeks.at(-2).s).toBe('on')
    expect(p.weeks.at(-4).s).toBe('on')
    expect(p.info.current).toBe(3)
    expect(p.days.map(d => d.d)[0]).toBe('2026-11-23')
    expect(p.days.find(d => d.today).d).toBe(TODAY)
  })

  it('this week: the days trained, the count, the time and the volume', () => {
    const S = { weekStart: 1, unit: 'kg', workouts: [w('2026-11-23', 50, 7000), w('2026-11-25', 45, 5400), w('2026-11-16')] }
    const p = passaData(S, TODAY)
    expect(p.weeks.at(-1).s).toBe('on')
    expect(p.days.filter(d => d.done).map(d => d.d)).toEqual(['2026-11-23', '2026-11-25'])
    expect(p.week).toEqual({ count: 2, ms: 95 * 60000, vol: 12400 })
    expect(weekLine(p.week, 'kg')).toMatch(/^2 workouts · .+ · 12.400 kg$/)
    expect(p.total).toBe(3)
  })

  it('an empty week in the past is missed, not open', () => {
    const S = { weekStart: 1, workouts: [w('2026-11-09')] }
    const p = passaData(S, TODAY)
    expect(p.weeks.at(-2).s).not.toBe('on')
    expect(p.weeks.at(-2).s).not.toBe('open')
  })
})
