// Local patch: every share image is in English while the app stays in its own language.
import { describe, it, expect, afterEach } from 'vitest'
import { t, tn, dateLocale, getLang, exerciseNameFor, inCardEnglish, isCardEnglish, _setLangState } from './i18n-core.js'
import pl from '../locales/pl.js'
import plNames from '../exercise-names/pl.js'
import { shareCardModel, layoutShareCard, drawShareCard, shownElements, sharePalette } from './share-card.js'
import { drawRecapCard } from './recap-card.js'
import { cardPalette, SITE, logoFor } from './card-draw.js'
import { fmtDate, fmtNum } from './format.js'
import { EXIDX } from './exercises.js'

// No Path2D in Node: the drawn icons are not what this test reads.
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class {}
const measure = (text, weight, size) => String(text).length * size * 0.5
const S = (w, r) => ({ w, r, done: true })
const workout = id => ({ id: 'w', d: '2026-11-05', start: 0, end: 72 * 60000, name: 'Push', prs: [id], entries: [{ id, target: { mode: 'reps' }, sets: [S(1234.5, 8), S(60, 8)] }] })
function recorder() {
  const texts = []
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : k === 'fillText' ? s => texts.push(String(s)) : k === 'measureText' ? s => ({ width: String(s).length * 10 })
      : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true },
  })
  return { ctx, texts }
}
// A catalogue exercise the Polish name pack translates.
const exId = Object.keys(plNames).find(id => EXIDX[id] && plNames[id] && plNames[id].toLowerCase() !== EXIDX[id].n.toLowerCase())

describe('share images in English while the app is Polish', () => {
  afterEach(() => _setLangState('en', {}, null, null))

  it('the scope answers in English and ends with it', () => {
    _setLangState('pl', pl, null, plNames)
    expect(t('Volume')).toBe('Objętość')
    inCardEnglish(() => {
      expect(isCardEnglish()).toBe(true)
      expect(getLang()).toBe('en')
      expect(dateLocale()).toBe('en-GB')
      expect(t('Volume')).toBe('Volume')
      expect(tn('workout', 'workouts', 5)).toBe('workouts')
      expect(fmtNum(1234.5)).toBe('1,234.5')
      expect(fmtDate('2026-11-05', true, true)).toMatch(/Nov/)
      expect(exerciseNameFor(EXIDX[exId])).toBe(EXIDX[exId].n)
    })
    expect(isCardEnglish()).toBe(false)
    expect(getLang()).toBe('pl')
    expect(t('Volume')).toBe('Objętość')
    expect(tn('workout', 'workouts', 5)).toBe('treningów')
    expect(exerciseNameFor(EXIDX[exId])).not.toBe(EXIDX[exId].n)
  })

  it('ends the scope when the card throws', () => {
    _setLangState('pl', pl, null, plNames)
    expect(() => inCardEnglish(() => { throw new Error('x') })).toThrow('x')
    expect(t('Volume')).toBe('Objętość')
  })

  it('the workout card renders English labels, dates and exercise names', () => {
    _setLangState('pl', pl, null, plNames)
    const { ctx, texts } = recorder()
    inCardEnglish(() => {
      const model = shareCardModel(workout(exId), { unit: 'kg', streak: 3, nameOf: e => exerciseNameFor(EXIDX[e.id]) })
      const layout = layoutShareCard(model, { template: 'classic', format: 'story', show: shownElements(), measure })
      drawShareCard(ctx, layout, sharePalette('classic', 'dark'), {})
    })
    const all = texts.join(' | ')
    expect(all).toMatch(/Volume/i)
    expect(all).toMatch(/Duration/i)
    expect(all).toMatch(/1h 12m/)
    expect(all).toMatch(/3 week streak/i)
    expect(all).toMatch(/Nov/)
    expect(all.toLowerCase()).toContain(EXIDX[exId].n.toLowerCase().split(' ')[0])
    expect(all).not.toMatch(/Objętość|Czas|seria 3 tyg/)
    expect(texts).toContain(SITE)
    // …and the app's own words are still Polish right after.
    expect(t('Duration')).toBe('Czas')
  })

  it('the recap card draws the English words it is given, with the kinkylocked footer', () => {
    _setLangState('pl', pl, null, plNames)
    const words = inCardEnglish(() => ({ title: t('Your month'), dates: '1–30 Nov', tiles: [{ label: tn('workout', 'workouts', 12), value: '12' }, { label: t('Volume'), value: '1 kg' }, { label: 'x', value: '0' }, { label: 'y', value: '1' }], top: null }))
    expect(words.title).toBe('Your month')
    expect(words.tiles[0].label).toBe('workouts')
    const { ctx, texts } = recorder()
    drawRecapCard(ctx, words, { width: 1080, height: 1920, colors: cardPalette('dark') })
    expect(texts).toEqual(expect.arrayContaining(['Your month', 'workouts', 'Volume', 'kinkylocked.com']))
    expect(texts).not.toContain('Gym')
  })

  it('picks the dark logo on light paper and the white one on dark paper', () => {
    expect(logoFor('#f2f2f7')).toBe('dark')
    expect(logoFor('#ffffff')).toBe('dark')
    expect(logoFor('#000000')).toBe('light')
    expect(logoFor('#12151b')).toBe('light')
  })
})
