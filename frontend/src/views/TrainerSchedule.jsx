// Habcore Gym (kl16, local patch 0018): "Mój grafik", #/grafik. A trainer's planned sessions with
// every client of the gym, a day or a week at a time (api GET /api/gymv2/schedule). Sessions that
// overlap are marked, never refused: a trainer may lead several people at once. "Zaplanuj" picks a
// client and opens the form; the trainer's own calendar feed (only first names and plans) is one
// tap away.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO, isoOf, weekStartOf, weekDayOffset, fmtDate } from '../lib/format.js'
import { mySchedule, addDays, overlapping, dayShort } from '../lib/sessions.js'
import { gymClients } from '../lib/gymv2.js'
import { filterClients } from '../components/GymPicker.jsx'
import { SessionRows, sessionSheet, planFor } from '../components/Sessions.jsx'
import { calendarSheet } from '../components/CalendarFeed.jsx'
import { Button, Segmented, Switch, Row, SearchField } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { pathBefore } from '../lib/nav.js'

const openSheet = (render, opts) => useUI.getState().openSheet(render, opts)
const toast = m => { try { useUI.getState().toast(m) } catch { /* none */ } }

function weekStart(iso, ws) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - weekDayOffset(d.getDay(), ws))
  return isoOf(d)
}

/** Which client to plan for: the gym's clients, with a search. */
function ClientPick({ close, onPick }) {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { gymClients().then(r => setList((r.clients || []).filter(c => c.canLead))).catch(() => setList([])) }, [])
  const shown = list ? filterClients(list, q) : []
  return <>
    <h3>{t('Plan a session for…')}</h3>
    {list && list.length > 5 && <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search')} aria-label={t('Search')} />}
    {!list ? <p className="muted">{t('Loading…')}</p> : !shown.length ? <p className="muted">{t('No clients.')}</p>
      : shown.map(c => <Row key={c.id} icon="person" iconTint="var(--blue)" title={c.name} accessory="chevron" onClick={() => { close(); onPick(c) }} />)}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </>
}

export default function TrainerSchedule() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const ws = weekStartOf(S)
  const [view, setView] = useState('week')
  const [day, setDay] = useState(todayISO())
  const [all, setAll] = useState(false)
  const [data, setData] = useState(null)
  const from = view === 'day' ? day : weekStart(day, ws)
  const to = view === 'day' ? day : addDays(from, 6)
  const load = () => mySchedule({ from, to, all }).then(setData).catch(e => { setData({ sessions: [], error: true }); toast(e?.body?.code === 'not-trainer' ? t('Only for trainers.') : t('Could not load the schedule.')) })
  useEffect(() => { load() }, [from, to, all]) // eslint-disable-line react-hooks/exhaustive-deps
  const live = useMemo(() => (data?.sessions || []).filter(s => !s.cx), [data])
  // Clashes among the shown sessions of one trainer (with "all", per trainer).
  const clash = useMemo(() => {
    const out = new Set()
    for (const s of live) if (overlapping(live.filter(x => (x.tr?.id || '') === (s.tr?.id || '')), s).length) out.add(s.id)
    return out
  }, [live])
  const byDay = useMemo(() => {
    const m = new Map()
    for (let i = 0; i < (view === 'day' ? 1 : 7); i++) m.set(addDays(from, i), [])
    for (const s of data?.sessions || []) if (m.has(s.d) && (!s.cx || Date.now() - s.cx < 2 * 86400000)) m.get(s.d).push(s)
    return m
  }, [data, from, view])
  const step = n => setDay(d => addDays(d, n * (view === 'day' ? 1 : 7)))
  const open = s => sessionSheet(s, { staff: { client: s.client }, onChanged: load })
  const plan = d => openSheet(close => <ClientPick close={close} onPick={c => planFor(c, { d: d && d >= todayISO() ? d : todayISO(), onSaved: load })} />)
  const label = view === 'day' ? fmtDate(day, true) : `${dayShort(from)} – ${dayShort(to)}`
  const hasBack = (window.history.state?.idx || 0) > 0
  return <div className="narrow sched" data-testid="trainer-schedule">
    <div className="hdr">
      <button className="iconbtn" onClick={() => (hasBack ? nav(-1) : nav('/silownia', { replace: true }))} data-back={(hasBack ? pathBefore() : null) || '/silownia'} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>{t('My schedule')}</h1>
        <div className="sub">{data ? tn('{0} planned session', '{0} planned sessions', live.length) : t('Loading…')}</div></div>
      <button className="iconbtn" onClick={() => calendarSheet(null, { feed: 'trainer' })} aria-label={t('Calendar feed')} title={t('Calendar feed')} data-testid="sched-feed"><Icon name="calendar" /></button>
    </div>
    <Segmented value={view} onChange={setView} options={[{ value: 'day', label: t('Day') }, { value: 'week', label: t('Week') }]} />
    <div className="row between sched-nav">
      <button className="iconbtn" onClick={() => step(-1)} aria-label={view === 'day' ? t('Previous day') : t('Previous week')}><Icon name="chevronLeft" /></button>
      <button type="button" className="sched-lbl" onClick={() => setDay(todayISO())}>{label}</button>
      <button className="iconbtn" onClick={() => step(1)} aria-label={view === 'day' ? t('Next day') : t('Next week')}><Icon name="chevronRight" /></button>
    </div>
    <div className="row between" style={{ margin: '4px 0 10px', gap: 8 }}>
      <Button variant="primary" size="sm" icon="plus" onClick={() => plan(view === 'day' ? day : todayISO())} data-testid="sched-plan">{t('Plan a session')}</Button>
      <label className="row small" style={{ gap: 8 }}><span>{t('All trainers')}</span><Switch checked={all} onChange={setAll} aria-label={t('All trainers')} /></label>
    </div>
    {clash.size > 0 && <p className="small sess-warn" data-testid="sched-clash"><Icon name="warning" /> {t('Some sessions overlap. That is allowed: you can lead several people at once.')}</p>}
    {!data ? <p className="muted">{t('Loading…')}</p> : [...byDay].map(([d, list]) => <div key={d} className={'sched-day' + (d === todayISO() ? ' today' : '')} data-testid="sched-day">
      <div className="row between sched-day-h">
        <b>{view === 'day' ? t('Planned sessions') : dayShort(d)}{d === todayISO() ? ' · ' + t('Today') : ''}</b>
        {d >= todayISO() && <button type="button" className="wf-link small" onClick={() => plan(d)} aria-label={t('Plan a session') + ' ' + dayShort(d)}><Icon name="plus" /></button>}
      </div>
      {list.length ? <SessionRows list={list} showClient onOpen={open} overlaps={clash} /> : <div className="muted small sched-none">{t('Nothing planned.')}</div>}
    </div>)}
  </div>
}
