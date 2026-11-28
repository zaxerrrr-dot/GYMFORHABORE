// Habcore Gym's own time field (kl17). The system <input type="time"> takes its language and clock
// from the browser, not from the app: a phone set to English showed "AM/PM" and English labels in a
// Polish app. This is a button in the style of DateField that opens a sheet with the hours (0-23)
// and the minutes in steps of 5, always on a 24-hour clock.
//
// The value stays 'HH:MM', exactly what the native input gave, so callers and saved data do not
// change. onChange gets the new 'HH:MM' string.
//
//   <TimeField value={time} onChange={setTime} label={t('Time')} />
//   <TimeField compact ... />   inside a Row, in place of <input type="time" className="timef">
import { useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const pad = n => String(n).padStart(2, '0')
const nowHHMM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) }

export function TimePicker({ value, label, onPick, close }) {
  const start = HHMM.test(value || '') ? value : nowHHMM()
  const [h, setH] = useState(+start.slice(0, 2))
  const [m, setM] = useState(+start.slice(3, 5))
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5)
  // A minute off the 5-minute grid (a time typed elsewhere, "07:32") stays pickable as it is.
  if (!minutes.includes(m)) { minutes.push(m); minutes.sort((a, b) => a - b) }
  const done = (hh, mm) => { close(); onPick(pad(hh) + ':' + pad(mm)) }
  return <div className="datep timep" data-timepicker>
    {label && <div className="small muted datep-label">{label}</div>}
    <div className="timep-now" aria-live="polite" data-timep-value>{pad(h)}:{pad(m)}</div>
    <div className="timep-grid timep-h" role="group" aria-label={t('Time')}>
      {Array.from({ length: 24 }, (_, i) => <button type="button" key={i} data-hour={i}
        className={'cal-d' + (i === h ? ' sel' : '')} aria-pressed={i === h}
        onClick={() => setH(i)}><span>{pad(i)}</span></button>)}
    </div>
    <div className="timep-grid timep-m" role="group" aria-label={pad(h) + ':mm'}>
      {minutes.map(i => <button type="button" key={i} data-minute={i}
        className={'cal-d' + (i === m ? ' sel' : '')} aria-pressed={i === m}
        aria-label={pad(h) + ':' + pad(i)}
        onClick={() => { setM(i); done(h, i) }}><span>:{pad(i)}</span></button>)}
    </div>
    <div className="row timep-acts">
      <Button variant="ghost" onClick={() => { const n = nowHHMM(); done(+n.slice(0, 2), +n.slice(3, 5)) }}>{t('Now')}</Button>
      <Button variant="primary" onClick={() => done(h, m)} data-timep-done>{t('Done')}</Button>
    </div>
  </div>
}

export function timePickerSheet(opts) {
  return useUI.getState().openSheet(close => <TimePicker {...opts} close={close} />)
}

export default function TimeField({ value, onChange, label, compact = true, className = '', ...rest }) {
  const ok = HHMM.test(value || '')
  const text = ok ? value : '--:--'
  return (
    <button type="button" value={value || ''} data-timefield {...rest}
      className={(compact ? 'timef' : 'field') + ' datef timefield ' + className}
      aria-haspopup="dialog" aria-label={(rest['aria-label'] || label) ? (rest['aria-label'] || label) + ': ' + text : text}
      onClick={() => timePickerSheet({ value, label: label || rest['aria-label'], onPick: onChange })}>
      {ok ? <time dateTime={value}>{text}</time> : <span className="datef-ph">{text}</span>}
    </button>
  )
}
