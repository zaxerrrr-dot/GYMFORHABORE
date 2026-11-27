import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { normalizeMeasurementsState } from '../lib/measurements.js'
import { addWeighIn } from '../lib/weigh-ins.js'
import { MOBILE, shareExport } from '../lib/mobile.js'
import {
  BODY_FIELDS, LB_PER_KG, ageOf, profileMissing, bmiCategory, bodyRows, rowValue, changes,
  bodyCSV, bodyJSON, cleanBody, cleanBodyMeta,
} from '../lib/body.js'
import LineChart from '../components/LineChart.jsx'
import StatsTabs from '../components/StatsTabs.jsx'
import Icon from '../components/Icon.jsx'
import { Button, NumberField, Section, Segmented } from '../components/ui.jsx'
import { confirmSheet } from '../sheets.jsx'

/* Habcore Gym (patch 0015, kl13): "Ciało", the body module. The profile it needs (sex, date of
   birth, height: asked once, a trainer leading the client can fill them in), the latest reading
   with BMI and its WHO category and the change since the last and the first, a chart of every
   value, and the history to edit or delete. Weight stays in the weigh-ins (S.bodyweight), body
   fat and the circumferences in the body measurements (S.measurements, views/Measurements.jsx);
   the rest of a body-composition reading rides on that day's measurement (lib/body.js). */

// A Bluetooth scale (Xiaomi S400 / Mi Body Composition Scale 2, openScale formulas) is a later step:
// the button stays hidden until then, the readings already have a place (`raw`, src 'scale').
export const SCALE_BT = false

const toast = m => useUI.getState().toast(m)
const CATS = () => ({ under: t('Underweight'), normal: t('Normal weight'), over: t('Overweight'), obese: t('Obesity') })
const SOURCES = () => [{ value: 'manual', label: t('Manual') }, { value: 'scale', label: t('Scale') }, { value: 'import', label: t('Import') }]
const LABEL = { w: 'Body weight', bmi: 'BMI', fat: 'Body fat' }
const metricLabel = key => t(LABEL[key] || BODY_FIELDS.find(f => f.key === key)?.label || key)

// Shown in the profile's unit: kg or lb for masses, % or the plain number for the rest.
function shown(key, v, unit) {
  if (v == null) return null
  const f = BODY_FIELDS.find(x => x.key === key)
  const mass = key === 'w' ? null : (key === 'lean' || f?.kind === 'mass')
  if (key === 'w') return fmtNum(Math.round(v * 10) / 10) + ' ' + unit
  if (mass) return fmtNum(Math.round((unit === 'lb' ? v * LB_PER_KG : v) * 10) / 10) + ' ' + unit
  if (key === 'fat' || f?.kind === 'percent') return fmtNum(v) + ' %'
  if (f?.kind === 'kcal') return fmtNum(v) + ' kcal'
  if (f?.kind === 'years') return t('{0} yrs', fmtNum(v))
  return fmtNum(v)
}
const signed = (key, d, unit) => (d == null || d === 0 ? (d === 0 ? '±0' : null) : (d > 0 ? '+' : '−') + shown(key, Math.abs(d), unit))

/* ---------- the profile: sex, date of birth, height ---------- */
export function BodyProfileForm({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [sex, setSex] = useState(S.sex === 'male' || S.sex === 'female' ? S.sex : null)
  const [birth, setBirth] = useState(S.birthDate || (Number(S.birthYear) > 1900 ? S.birthYear + '-01-01' : ''))
  const [height, setHeight] = useState(Number(S.heightCm) > 0 ? Number(S.heightCm) : null)
  const save = () => {
    if (!sex) { toast(t('Pick your sex.')); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || birth > todayISO() || birth < '1900-01-01') { toast(t('Enter your date of birth.')); return }
    if (!(height >= 50 && height <= 260)) { toast(t('Enter your height in cm (50–260).')); return }
    update(s => { s.sex = sex; s.birthDate = birth; s.birthYear = +birth.slice(0, 4); s.heightCm = Math.round(height * 10) / 10 })
    close?.()
  }
  return <div data-body-profile>
    <h3>{t('Your body profile')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('BMI and the body module need your sex, date of birth and height. Your trainer can fill them in too.')}</div>
    <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{t('Sex')}</div>
    <Segmented className={sex ? '' : 'seg-none'} value={sex || ''} onChange={setSex} options={[{ value: 'female', label: t('Female') }, { value: 'male', label: t('Male') }]} />
    <div style={{ height: 12 }} />
    <label className="small" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>{t('Date of birth')}
      <input className="input" type="date" value={birth} max={todayISO()} min="1900-01-01" onChange={e => setBirth(e.target.value)} data-testid="body-birth" style={{ marginTop: 6 }} />
    </label>
    <label className="small" style={{ fontWeight: 600, display: 'block', marginTop: 12, marginBottom: 6 }}>{t('Height (cm)')}</label>
    <NumberField className="input" value={height} nullable onChange={setHeight} data-testid="body-height" />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save} data-testid="body-profile-save">{t('Save')}</Button>
  </div>
}
export const bodyProfileSheet = () => useUI.getState().openSheet(close => <BodyProfileForm close={close} />)

/* ---------- one measurement: weight, body fat, body composition ---------- */
export function BodyMeasurementForm({ d0 = null, close }) {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const entry0 = d0 ? (S.measurements || []).find(m => m.d === d0) : null
  const w0 = d0 ? (S.bodyweight || []).find(b => b.d === d0) : null
  const [d, setD] = useState(d0 || todayISO())
  const [at, setAt] = useState(entry0?.at || new Date().toTimeString().slice(0, 5))
  const [src, setSrc] = useState(entry0?.src || 'manual')
  const [w, setW] = useState(w0 ? Number(w0.w) : null)
  const [fat, setFat] = useState(entry0?.bodyFat ?? null)
  const [vals, setVals] = useState(() => {
    const out = {}
    for (const f of BODY_FIELDS) { const v = entry0?.body?.[f.key]; out[f.key] = v == null ? null : f.kind === 'mass' && S.unit === 'lb' ? Math.round(v * LB_PER_KG * 10) / 10 : v }
    return out
  })
  const [note, setNote] = useState(entry0?.note || '')
  const save = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > todayISO()) { toast(t('Pick a date that is not in the future.')); return }
    const body = cleanBody(Object.fromEntries(BODY_FIELDS.map(f => [f.key, vals[f.key] == null ? null : f.kind === 'mass' && S.unit === 'lb' ? vals[f.key] / LB_PER_KG : vals[f.key]])))
    const fatOk = fat == null || (fat > 0 && fat < 100)
    if (!fatOk) { toast(t('Body fat is a percentage between 0 and 100.')); return }
    if (!(w > 0) && fat == null && !body && !note.trim()) { toast(t('Enter at least one value.')); return }
    // A trainer leading this client signs the entry (lib/body.js `by`).
    const by = user?.acting?.by?.id ? { id: user.acting.by.id, name: user.acting.by.name || '' } : null
    useStore.getState().update(s => {
      if (d0 && d0 !== d) { s.bodyweight = (s.bodyweight || []).filter(b => b.d !== d0); s.measurements = (s.measurements || []).filter(m => m.d !== d0) }
      if (w > 0) {
        s.bodyweight = (s.bodyweight || []).filter(b => b.d !== d)
        addWeighIn(s, { d, at, w, t: Date.now() })
      }
      const others = (s.measurements || []).filter(m => m.d !== d)
      const prev = (s.measurements || []).find(m => m.d === d) || { d }
      const next = { ...prev, d, t: Date.now(), bodyFat: fat ?? null, note: note.trim() }
      delete next.body; delete next.src; delete next.by; delete next.at
      if (body) next.body = body
      Object.assign(next, cleanBodyMeta({ src, at, by: by || prev.by, raw: prev.raw }))
      const keep = body || fat != null || note.trim() || Object.keys(prev).some(k => !['d', 't', 'bodyFat', 'note', 'body', 'src', 'by', 'at', 'raw', 'other'].includes(k) && prev[k] != null)
      s.measurements = keep ? [...others, next] : others
      normalizeMeasurementsState(s)
    })
    toast(t('Measurement saved'))
    close?.()
  }
  const field = (key, label, value, set, hint) => <label key={key} className="body-f">
    <span className="small">{label}{hint ? <span className="muted"> · {hint}</span> : null}</span>
    <NumberField className="input" value={value} nullable onChange={set} data-testid={'body-' + key} />
  </label>
  const unitHint = f => (f.kind === 'mass' ? S.unit : f.kind === 'percent' ? '%' : f.kind === 'kcal' ? 'kcal' : f.kind === 'years' ? t('years') : null)
  return <div data-body-form>
    <h3>{d0 ? t('Edit measurement') : t('Weigh-in')}</h3>
    <div className="body-grid2">
      <label className="body-f"><span className="small">{t('Date')}</span><input className="input" type="date" value={d} max={todayISO()} onChange={e => setD(e.target.value)} /></label>
      <label className="body-f"><span className="small">{t('Time')}</span><input className="input" type="time" value={at} onChange={e => setAt(e.target.value)} /></label>
    </div>
    <div className="small" style={{ fontWeight: 600, margin: '10px 0 6px' }}>{t('Source')}</div>
    <Segmented value={src} onChange={setSrc} options={SOURCES()} />
    <div className="body-grid2" style={{ marginTop: 10 }}>
      {field('w', t('Body weight'), w, setW, S.unit)}
      {field('fat', t('Body fat'), fat, setFat, '%')}
      {BODY_FIELDS.map(f => field(f.key, t(f.label), vals[f.key], v => setVals(x => ({ ...x, [f.key]: v })), unitHint(f)))}
    </div>
    <div className="muted small" style={{ margin: '6px 0 10px' }}>{t('Only the weight is needed; fill in what your scale shows. Lean mass is worked out from weight and body fat when left empty.')}</div>
    <label className="body-f"><span className="small">{t('Note')}</span>
      <textarea className="input" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label>
    <div style={{ height: 12 }} />
    <Button variant="primary" onClick={save} data-testid="body-save">{t('Save')}</Button>
  </div>
}
export const bodyMeasurementSheet = d0 => useUI.getState().openSheet(close => <BodyMeasurementForm d0={d0} close={close} />)

function download(text, name, type) {
  if (MOBILE) { shareExport(text, name).catch(() => {}); return }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}

/* ---------- the page ---------- */
export default function Body() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const nav = useNavigate()
  const rows = useMemo(() => bodyRows(S), [S.bodyweight, S.measurements, S.heightCm, S.unit]) // eslint-disable-line react-hooks/exhaustive-deps
  const [metric, setMetric] = useState('w')
  const missing = profileMissing(S)
  const age = ageOf(S)
  const unit = S.unit === 'lb' ? 'lb' : 'kg'
  const latest = rows[0] || null
  const metrics = ['w', 'bmi', 'fat', ...BODY_FIELDS.map(f => f.key)].filter(k => rows.some(r => rowValue(r, k) != null))
  const pts = rows.filter(r => rowValue(r, metric) != null).slice().reverse().map(r => ({ t: new Date(r.d + 'T12:00:00').getTime(), d: r.d, y: metric === 'lean' || BODY_FIELDS.find(f => f.key === metric)?.kind === 'mass' ? Math.round((unit === 'lb' ? rowValue(r, metric) * LB_PER_KG : rowValue(r, metric)) * 10) / 10 : rowValue(r, metric) }))
  const remove = r => confirmSheet({
    title: t('Delete this measurement?'), message: fmtDate(r.d, true), confirmText: t('Delete'), danger: true,
    onConfirm: () => { update(s => { s.bodyweight = (s.bodyweight || []).filter(b => b.d !== r.d); s.measurements = (s.measurements || []).filter(m => m.d !== r.d) }); toast(t('Measurement deleted')) },
  })
  const add = () => (missing.length ? bodyProfileSheet() : bodyMeasurementSheet())
  const cat = latest?.bmi != null ? bmiCategory(latest.bmi) : null
  return <div className="narrow body-page" data-body-page>
    <StatsTabs current="/cialo" />
    <div className="row between" style={{ alignItems: 'center' }}>
      <h1 style={{ margin: '6px 0' }}>{t('Body')}</h1>
      <Button size="sm" variant="primary" icon="plus" onClick={add} data-testid="body-add">{t('Weigh-in')}</Button>
    </div>

    {missing.length > 0 && <div className="card body-need" data-body-need>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('First, your body profile')}</div>
      <div className="muted small" style={{ marginBottom: 10 }}>{t('BMI and the body module need your sex, date of birth and height. Your trainer can fill them in too.')}</div>
      <Button variant="tinted" onClick={bodyProfileSheet} data-testid="body-profile-open">{t('Fill in')}</Button>
    </div>}

    {missing.length === 0 && <div className="body-prof small muted">
      {S.sex === 'female' ? t('Female') : t('Male')} · {t('{0} yrs', age)} · {fmtNum(S.heightCm)} cm
      <button type="button" className="linkbtn" onClick={bodyProfileSheet} style={{ marginInlineStart: 8 }}>{t('Edit')}</button>
    </div>}

    {latest ? <div className="card body-latest" data-body-latest>
      <div className="muted small">{t('Latest')} · {fmtDate(latest.d, true)}{latest.at ? ' ' + latest.at : ''}</div>
      <div className="body-tiles">
        {['w', 'bmi', 'fat', 'lean', ...BODY_FIELDS.filter(f => f.key !== 'lean').map(f => f.key)].filter(k => rowValue(latest, k) != null || k === 'w').map(k => {
          const c = changes(rows, k)
          return <div key={k} className={'body-tile' + (k === 'bmi' ? ' bmi' : '')} data-k={k}>
            <span className="muted small">{metricLabel(k)}{k === 'lean' && !latest.body?.lean ? ' · ' + t('calculated') : ''}</span>
            <b>{c.now == null ? '–' : k === 'bmi' ? fmtNum(c.now) : shown(k, c.now, unit)}</b>
            {k === 'bmi' && cat && <span className={'body-cat is-' + cat}>{CATS()[cat]}</span>}
            {c.prev != null && <span className="small muted">{t('vs last: {0}', k === 'bmi' ? (c.prev > 0 ? '+' : '') + fmtNum(c.prev) : signed(k, c.prev, unit))}</span>}
            {c.first != null && <span className="small muted">{t('vs first: {0}', k === 'bmi' ? (c.first > 0 ? '+' : '') + fmtNum(c.first) : signed(k, c.first, unit))}</span>}
          </div>
        })}
      </div>
      {age != null && age < 18 && latest.bmi != null && <div className="small" style={{ marginTop: 8 }} data-body-minor>{t('Under 18: the adult BMI ranges do not apply. Children and teenagers are judged on age- and sex-specific percentiles.')}</div>}
      {latest.bmi == null && missing.includes('height') && <div className="small muted" style={{ marginTop: 8 }}>{t('Add your height to see your BMI.')}</div>}
    </div> : <div className="card muted">{t('No measurements yet. Add your first weigh-in.')}</div>}

    {metrics.length > 0 && <Section title={t('Chart')}>
      <div className="body-chips">{metrics.map(k => <button key={k} type="button" className={'chip' + (k === metric ? ' on' : '')} onClick={() => setMetric(k)}>{metricLabel(k)}</button>)}</div>
      <div className="chart" style={{ marginTop: 8 }}><LineChart points={pts} h={160} unit={metric === 'bmi' ? '' : pts.length ? '' : ''} /></div>
    </Section>}

    <Section title={t('History')}>
      {rows.map(r => <div key={r.d} className="body-row" data-body-row={r.d}>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{fmtDate(r.d, true)}{r.at ? ' · ' + r.at : ''}</div>
          <div className="small muted">{[r.w != null && shown('w', r.w, unit), r.bmi != null && 'BMI ' + fmtNum(r.bmi), r.fat != null && t('Body fat') + ' ' + fmtNum(r.fat) + ' %'].filter(Boolean).join(' · ') || t('Measurements')}</div>
          <div className="small dim">{[r.src !== 'manual' && SOURCES().find(x => x.value === r.src)?.label, r.by && t('Added by {0} (trainer)', r.by.name || '?'), r.note].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" className="iconbtn" aria-label={t('Edit')} onClick={() => bodyMeasurementSheet(r.d)}><Icon name="pencil" /></button>
        <button type="button" className="iconbtn" style={{ color: 'var(--red)' }} aria-label={t('Delete')} onClick={() => remove(r)}><Icon name="trash" /></button>
      </div>)}
    </Section>

    <Section>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', padding: '10px 0' }}>
        <Button size="sm" icon="ruler" onClick={() => nav('/measurements')}>{t('Circumferences')}</Button>
        <Button size="sm" icon="download" onClick={() => download(bodyCSV(S), 'habcore-gym-cialo-' + todayISO() + '.csv', 'text/csv')} data-testid="body-csv">CSV</Button>
        <Button size="sm" icon="download" onClick={() => download(bodyJSON(S), 'habcore-gym-cialo-' + todayISO() + '.json', 'application/json')} data-testid="body-json">JSON</Button>
        {SCALE_BT && <Button size="sm" icon="scale">{t('Weigh-in from the scale')}</Button>}
      </div>
    </Section>
  </div>
}
