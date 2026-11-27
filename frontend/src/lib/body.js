// Habcore Gym (patch 0015, kl13): the "Ciało" (Body) module's numbers. Built on what was there:
// the weigh-ins (S.bodyweight), the body measurements (S.measurements, one check-in per day,
// lib/measurements.js; body fat is its `bodyFat`), and the profile's S.sex / S.heightCm (Tools,
// Strength level). New on a measurement entry, kept by normalizeMeasurementEntry:
//   body  { muscle, water, bone, visceral, bmr, protein, metaAge, lean }  (kg, %, kg, level,
//         kcal, %, years, kg; kg always stored in kg)
//   src   'manual' | 'scale' | 'import'     how it was taken (absent = manual)
//   by    { id, name }                       a trainer who added it for the client
//   at    'HH:MM'                            the time of the reading
//   raw   {...}                              a scale's raw readings (impedance...), never shown;
//                                            for a future Bluetooth scale (openScale formulas)
// And on the profile: S.birthDate 'YYYY-MM-DD' (S.birthYear follows it for older readers).
import { isoOf } from './format.js'

export const LB_PER_KG = 2.2046226218

/** The body-composition readings beyond weight and body fat, in the order they are shown. */
export const BODY_FIELDS = [
  { key: 'muscle', label: 'Muscle mass', kind: 'mass', max: 300 },
  { key: 'water', label: 'Body water', kind: 'percent', max: 100 },
  { key: 'bone', label: 'Bone mass', kind: 'mass', max: 30 },
  { key: 'visceral', label: 'Visceral fat', kind: 'level', max: 60 },
  { key: 'bmr', label: 'BMR', kind: 'kcal', max: 10000 },
  { key: 'protein', label: 'Protein', kind: 'percent', max: 100 },
  { key: 'metaAge', label: 'Metabolic age', kind: 'years', max: 150 },
  { key: 'lean', label: 'Lean mass', kind: 'mass', max: 300 },
]
export const BODY_KEYS = BODY_FIELDS.map(f => f.key)
export const BODY_SOURCES = ['manual', 'scale', 'import']
const RAW_MAX = 4000

const num = v => (v == null || v === '' ? null : Number.isFinite(+v) ? +v : null)
const r1 = n => Math.round(n * 10) / 10

/** A body sub-object cleaned: known keys with a number in range, or null when nothing is left. */
export function cleanBody(raw) {
  if (!raw || typeof raw !== 'object') return null
  const out = {}
  for (const f of BODY_FIELDS) {
    const v = num(raw[f.key])
    if (v == null || v < 0 || v > f.max || (v === 0 && f.kind !== 'level')) continue
    out[f.key] = f.kind === 'kcal' || f.kind === 'years' ? Math.round(v) : f.kind === 'mass' ? Math.round(v * 1000) / 1000 : r1(v)
  }
  return Object.keys(out).length ? out : null
}

/** The entry's other new fields (source, who added it, time, raw scale data), cleaned. */
export function cleanBodyMeta(raw) {
  const out = {}
  if (BODY_SOURCES.includes(raw?.src) && raw.src !== 'manual') out.src = raw.src
  if (raw?.by && typeof raw.by === 'object' && raw.by.id) out.by = { id: String(raw.by.id).slice(0, 64), name: String(raw.by.name || '').slice(0, 60) }
  if (typeof raw?.at === 'string' && /^\d{2}:\d{2}$/.test(raw.at)) out.at = raw.at
  if (raw?.raw && typeof raw.raw === 'object') {
    try { const s = JSON.stringify(raw.raw); if (s.length <= RAW_MAX) out.raw = JSON.parse(s) } catch { /* not kept */ }
  }
  return out
}

/** Age in whole years on `today` from 'YYYY-MM-DD', or from a birth year alone; null if unknown. */
export function ageOf(S, today = isoOf(new Date())) {
  const b = typeof S?.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(S.birthDate) ? S.birthDate : null
  if (b) {
    let a = +today.slice(0, 4) - +b.slice(0, 4)
    if (today.slice(5) < b.slice(5)) a--
    return a >= 0 && a < 130 ? a : null
  }
  const y = Number(S?.birthYear)
  return y > 1900 ? +today.slice(0, 4) - y : null
}

/** What the module needs before it shows anything: sex, birth date, height. */
export function profileMissing(S) {
  const miss = []
  if (S?.sex !== 'male' && S?.sex !== 'female') miss.push('sex')
  if (!(typeof S?.birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(S.birthDate))) miss.push('birthDate')
  if (!(Number(S?.heightCm) >= 50 && Number(S?.heightCm) <= 260)) miss.push('height')
  return miss
}

/** BMI from kg and cm, one decimal; null without both. */
export function bmiOf(kg, cm) {
  const w = num(kg), h = num(cm)
  if (!(w > 0) || !(h > 0)) return null
  return r1(w / ((h / 100) ** 2))
}

/** The WHO adult category: 'under' < 18.5 ≤ 'normal' < 25 ≤ 'over' < 30 ≤ 'obese'. */
export function bmiCategory(bmi) {
  if (bmi == null) return null
  return bmi < 18.5 ? 'under' : bmi < 25 ? 'normal' : bmi < 30 ? 'over' : 'obese'
}

/** Lean (fat-free) mass in kg: the reading if there is one, else weight minus fat. */
export function leanOf(kg, fatPct, body) {
  if (body?.lean > 0) return body.lean
  const w = num(kg), f = num(fatPct)
  return w > 0 && f != null && f >= 0 && f < 100 ? Math.round(w * (1 - f / 100) * 10) / 10 : null
}

/** The weight of a day (the day's value in S.bodyweight), or null. */
export const weightOn = (S, d) => {
  const e = (S?.bodyweight || []).find(b => b?.d === d)
  return e && Number(e.w) > 0 ? Number(e.w) : null
}

/**
 * Every day with a weigh-in or a body check-in, newest first, as one row:
 * { d, w (kg as stored), fat, body, bmi, lean, src, by, at, note, hasMeasurement }.
 */
export function bodyRows(S) {
  const days = new Map()
  for (const b of S?.bodyweight || []) if (b?.d && Number(b.w) > 0) days.set(b.d, { d: b.d, w: Number(b.w) })
  for (const m of S?.measurements || []) {
    if (!m?.d) continue
    const row = days.get(m.d) || { d: m.d, w: null }
    row.fat = m.bodyFat ?? null
    row.body = m.body || null
    row.src = m.src || 'manual'
    row.by = m.by || null
    row.at = m.at || null
    row.note = m.note || ''
    row.hasMeasurement = true
    days.set(m.d, row)
  }
  const kgOf = w => (S?.unit === 'lb' && w != null ? w / LB_PER_KG : w)
  return [...days.values()].map(r => {
    const kg = kgOf(r.w)
    return { fat: null, body: null, src: 'manual', by: null, at: null, note: '', hasMeasurement: false, ...r, bmi: bmiOf(kg, S?.heightCm), lean: leanOf(kg, r.fat, r.body) }
  }).sort((a, b) => b.d.localeCompare(a.d))
}

/** A value of a row by metric key: 'w', 'bmi', 'fat', 'lean' or a BODY_FIELDS key. */
export function rowValue(row, key) {
  if (!row) return null
  if (key === 'w' || key === 'bmi' || key === 'fat' || key === 'lean') return row[key] ?? null
  return row.body?.[key] ?? null
}

/** Change of `key` from the previous row that has it, and from the first one that has it. */
export function changes(rows, key) {
  const has = rows.filter(r => rowValue(r, key) != null)
  if (!has.length) return { now: null, prev: null, first: null }
  const now = rowValue(has[0], key)
  return {
    now,
    prev: has.length > 1 ? r1(now - rowValue(has[1], key)) : null,
    first: has.length > 1 ? r1(now - rowValue(has[has.length - 1], key)) : null,
  }
}

// ---- export ------------------------------------------------------------------------------------
const CSV_COLS = ['date', 'time', 'weight', 'bmi', 'body_fat_percent', ...BODY_FIELDS.map(f => f.key), 'source', 'added_by', 'note']
const csvCell = v => (v == null ? '' : /[",\n;]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v))
export function bodyCSV(S) {
  const lines = [CSV_COLS.join(',')]
  for (const r of bodyRows(S).slice().reverse()) {
    lines.push([r.d, r.at, r.w, r.bmi, r.fat, ...BODY_FIELDS.map(f => (f.key === 'lean' ? r.lean : r.body?.[f.key])), r.src, r.by?.name || '', r.note].map(csvCell).join(','))
  }
  return lines.join('\n') + '\n'
}
export function bodyJSON(S) {
  return JSON.stringify({
    profile: { sex: S?.sex || null, birthDate: S?.birthDate || null, heightCm: S?.heightCm || null, unit: S?.unit || 'kg' },
    rows: bodyRows(S).slice().reverse().map(({ hasMeasurement, ...r }) => r),
  }, null, 2)
}
