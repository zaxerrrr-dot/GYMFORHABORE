import { describe, expect, it } from 'vitest'
import { bmiOf, bmiCategory, ageOf, profileMissing, leanOf, bodyRows, changes, cleanBody, cleanBodyMeta, bodyCSV } from './body.js'
import { normalizeMeasurementsState } from './measurements.js'

describe('lib/body.js (kl13)', () => {
  it('BMI and the WHO adult categories', () => {
    expect(bmiOf(80, 180)).toBe(24.7)
    expect(bmiOf(80, null)).toBe(null)
    expect([18.4, 18.5, 24.9, 25, 29.9, 30].map(bmiCategory)).toEqual(['under', 'normal', 'normal', 'over', 'over', 'obese'])
  })
  it('age from the date of birth, the birthday counted', () => {
    expect(ageOf({ birthDate: '2000-12-01' }, '2026-11-28')).toBe(25)
    expect(ageOf({ birthDate: '2000-11-28' }, '2026-11-28')).toBe(26)
    expect(ageOf({ birthYear: 1990 }, '2026-11-28')).toBe(36)
    expect(ageOf({}, '2026-11-28')).toBe(null)
  })
  it('the profile the module needs: sex, date of birth, height', () => {
    expect(profileMissing({})).toEqual(['sex', 'birthDate', 'height'])
    expect(profileMissing({ sex: 'female', birthDate: '1995-03-02', heightCm: 168 })).toEqual([])
  })
  it('lean mass: the reading, else weight minus fat', () => {
    expect(leanOf(80, 20, null)).toBe(64)
    expect(leanOf(80, 20, { lean: 61 })).toBe(61)
    expect(leanOf(80, null, null)).toBe(null)
  })
  it('a measurement keeps body composition, source, trainer and time through normalisation; nothing else breaks', () => {
    const s = { measurements: [{ d: '2026-11-20', t: 1, bodyFat: 20, waist: 80, body: { muscle: 35.5, water: 55, visceral: 7, bmr: 1700.4, junk: 3 }, src: 'scale', by: { id: 't1', name: 'Tomek' }, at: '07:30', raw: { imp: 512 } }] }
    normalizeMeasurementsState(s)
    const m = s.measurements[0]
    expect(m.body).toEqual({ muscle: 35.5, water: 55, visceral: 7, bmr: 1700 })
    expect(m).toMatchObject({ src: 'scale', by: { id: 't1', name: 'Tomek' }, at: '07:30', raw: { imp: 512 }, bodyFat: 20, waist: 80 })
    expect(cleanBody({ water: 120, muscle: -1 })).toBe(null)
    expect(cleanBodyMeta({ src: 'manual' })).toEqual({})
  })
  it('rows by day, newest first, with BMI and the change since the last and the first', () => {
    const S = { unit: 'kg', heightCm: 180, bodyweight: [{ d: '2026-11-01', w: 82 }, { d: '2026-11-10', w: 81 }, { d: '2026-11-20', w: 80 }], measurements: [{ d: '2026-11-20', bodyFat: 20, body: { muscle: 36 } }] }
    const rows = bodyRows(S)
    expect(rows.map(r => r.d)).toEqual(['2026-11-20', '2026-11-10', '2026-11-01'])
    expect(rows[0]).toMatchObject({ w: 80, bmi: 24.7, fat: 20, lean: 64 })
    expect(changes(rows, 'w')).toEqual({ now: 80, prev: -1, first: -2 })
    expect(bodyCSV(S).split('\n')[0]).toMatch(/^date,time,weight,bmi,body_fat_percent,muscle/)
  })
  it('a profile in pounds: BMI from the weight in kg', () => {
    const rows = bodyRows({ unit: 'lb', heightCm: 180, bodyweight: [{ d: '2026-11-20', w: 176.4 }] })
    expect(rows[0].bmi).toBe(24.7)
  })
})
