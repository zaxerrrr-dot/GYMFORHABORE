// Habcore Gym (kl16, local patch 0018): sessions a trainer plans for a client at a time of day.
//   SessionForm      the trainer's form: day, time, length, plan, note, who leads, repeat;
//   SessionSheet     one session: what and when; the client starts it, the trainer moves or cancels it
//                    (this one or the whole series from it on);
//   SessionRows      a list of sessions by time (Home, the day sheet, Plan, "Mój grafik");
//   UpcomingSessions Home's card: today's and the next sessions, one tap to start;
//   DaySessions      the day sheet's block (kl14): that day's sessions and, leading a client, "Zaplanuj".
// The server writes the client's document (api/gymv2/index.js) and tells the client (push); the
// rules are lib/sessions-core.js.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn } from '../lib/i18n.js'
import { todayISO, DAYS, weekOrder, weekStartOf, fmtDate } from '../lib/format.js'
import {
  clientSessions, sessionOp, sessionsOf, sessionStart, timeRange, dayShort, sessionTitle, isPast, isNow, doneFor,
  routineOf, recentlyChanged, upcoming, liveOn, SESS_DUR, SERIES_MAX_WEEKS, seriesDates, addDays, validDay, validTime,
} from '../lib/sessions.js'
import { confirmSheet, menuSheet, startFlow } from '../sheets.jsx'
import { startOrPreview } from './StartSheets.jsx'
import { Button, Section, Row, Switch, TextArea, Segmented } from './ui.jsx'
import Icon from './Icon.jsx'

const openSheet = (render, opts) => useUI.getState().openSheet(render, opts)
const toast = m => { try { useUI.getState().toast(m) } catch { /* none */ } }
const errText = e => {
  const c = e?.body?.code || e?.code
  return c === 'not-synced' ? t('This client has not synced yet.') : c === 'not-allowed' || c === 'acting-forbidden' ? t('You cannot plan for this client.') : t('Could not save the session.')
}
const DURS = [30, 45, 60, 75, 90, 120]

/** While leading a client: that client, to plan for. */
export function useLeading() {
  const user = useStore(s => s.user)
  return user?.acting?.by ? { id: user.id, name: user.name || '', by: user.acting.by } : null
}

/** Opens the form for `client` (loads their plans and the gym's trainers first). */
export async function planFor(client, { d = '', s0 = null, scope = 'one', onSaved } = {}) {
  let info
  try { info = await clientSessions(client.id) } catch (e) { toast(errText(e)); return }
  openSheet(close => <SessionForm client={client} routines={info.routines || []} trainers={info.trainers || []} d0={d} s0={s0} scope={scope} close={close}
    onSaved={r => { onSaved?.(r) }} />)
}

/** The trainer's form. `s0`: the session being changed (`scope` 'one' | 'series'). */
export function SessionForm({ client, routines, trainers, d0 = '', s0 = null, scope = 'one', close, onSaved }) {
  const me = useStore(s => s.user)
  const myId = me?.acting?.by?.id || me?.id
  const [d, setD] = useState(s0?.d || d0 || todayISO())
  const [tm, setT] = useState(s0?.t || '18:00')
  const [dur, setDur] = useState(s0?.dur || SESS_DUR)
  const [rid, setRid] = useState(s0?.rid || '')
  const [note, setNote] = useState(s0?.note || '')
  const [tr, setTr] = useState(s0?.tr?.id || myId || '')
  const [rep, setRep] = useState(false)
  const wd0 = new Date((d || todayISO()) + 'T12:00:00').getDay()
  const [days, setDays] = useState(() => new Set([wd0]))
  // The repeat's weekday follows the day picked until the trainer picks weekdays themselves.
  const [daysTouched, setTouched] = useState(false)
  useEffect(() => { if (!daysTouched) setDays(new Set([wd0])) }, [wd0, daysTouched])
  const [mode, setMode] = useState('weeks')
  const [weeks, setWeeks] = useState(8)
  const [until, setUntil] = useState(() => addDays(d || todayISO(), 8 * 7 - 1))
  const [busy, setBusy] = useState(false)
  const series = !!s0 && scope === 'series'
  const dates = useMemo(() => (rep && !s0 ? seriesDates({ d, days: [...days], ...(mode === 'until' ? { until } : { weeks }) }) : []), [rep, s0, d, days, mode, until, weeks])
  const ws = weekStartOf(useStore.getState().S)
  const ok = validDay(d) && validTime(tm) && (!rep || dates.length > 0)
  const save = async () => {
    if (!ok || busy) return
    setBusy(true)
    const r0 = routines.find(r => r.id === rid)
    const t0 = trainers.find(x => x.id === tr)
    const body = {
      id: client.id, op: s0 ? 'edit' : 'add', ...(s0 ? { sess: s0.id, scope } : {}),
      ...(series ? {} : { d }), t: tm, dur: Number(dur) || SESS_DUR, rid: rid || '', rname: r0?.name || '', note: note.trim(),
      ...(t0 ? { tr: { id: t0.id, name: t0.name } } : {}),
      ...(rep && !s0 ? { rep: { days: [...days], ...(mode === 'until' ? { until } : { weeks: Number(weeks) || 1 }) } } : {}),
    }
    try {
      const r = await sessionOp(body)
      close()
      toast(s0 ? t('Session changed. {0} will get a notification.', client.name) : tn('{0} session planned for {1}.', '{0} sessions planned for {1}.', r.changed?.length || 1, client.name))
      if (r.overlaps?.length) overlapSheet(r.overlaps)
      onSaved?.(r)
    } catch (e) { toast(errText(e)) }
    finally { setBusy(false) }
  }
  return <div className="sess-form" data-testid="sess-form">
    <h3>{s0 ? (series ? t('Change the series') : t('Change the session')) : t('Plan a session')}: {client.name}</h3>
    {series && <p className="muted small">{t('Changes this session and the ones after it. The day stays; to move one day, change only that session.')}</p>}
    <Section>
      {!series && <Row icon="calendar" iconTint="var(--orange)" title={t('Day')}>
        <input type="date" className="timef" value={d} onChange={e => setD(e.target.value)} data-testid="sess-day" aria-label={t('Day')} />
      </Row>}
      <Row icon="clock" iconTint="var(--purple)" title={t('Start time')}>
        <input type="time" className="timef" value={tm} onChange={e => setT(e.target.value)} data-testid="sess-time" aria-label={t('Start time')} />
      </Row>
      <Row icon="timer" iconTint="var(--blue)" title={t('Length')}>
        <select className="timef" value={DURS.includes(Number(dur)) ? String(dur) : 'x'} onChange={e => setDur(e.target.value === 'x' ? dur : Number(e.target.value))} aria-label={t('Length')} data-testid="sess-dur">
          {DURS.map(m => <option key={m} value={m}>{t('{0} min', m)}</option>)}
          {!DURS.includes(Number(dur)) && <option value="x">{t('{0} min', dur)}</option>}
        </select>
      </Row>
      <Row icon="list" iconTint="var(--acc)" title={t('Plan')}>
        <select className="timef" value={rid} onChange={e => setRid(e.target.value)} aria-label={t('Plan')} data-testid="sess-plan">
          <option value="">{t('No plan (freestyle)')}</option>
          {routines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Row>
      {trainers.length > 1 && <Row icon="person" iconTint="var(--orange)" title={t('Trainer')}>
        <select className="timef" value={tr} onChange={e => setTr(e.target.value)} aria-label={t('Trainer')} data-testid="sess-trainer">
          {trainers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Row>}
    </Section>
    <TextArea placeholder={t('Note for the client (optional)')} value={note} maxLength={1000} rows={2} onChange={e => setNote(e.target.value)} data-testid="sess-note" />
    {!s0 && <Section footer={rep ? (dates.length ? tn('{0} session, the last on {1}.', '{0} sessions, the last on {1}.', dates.length, fmtDate(dates[dates.length - 1], true)) : t('No day in that range.')) : null}>
      <Row icon="reset" iconTint="var(--green)" title={t('Repeat every week')}>
        <Switch checked={rep} onChange={setRep} aria-label={t('Repeat every week')} data-testid="sess-repeat" />
      </Row>
      {rep && <div className="sess-days" data-testid="sess-days">{weekOrder(ws).map(w => <button key={w} type="button" className={'chip' + (days.has(w) ? ' on' : '')} aria-pressed={days.has(w)}
        onClick={() => setTouched(true) || setDays(p => { const n = new Set(p); if (n.has(w)) n.delete(w); else n.add(w); return n })}>{t(DAYS[w])}</button>)}</div>}
      {rep && <div className="sess-until">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'weeks', label: t('For weeks') }, { value: 'until', label: t('Until a day') }]} />
        {mode === 'weeks'
          ? <label className="row" style={{ gap: 8, marginTop: 8 }}><span>{t('Weeks')}</span><input type="number" min="1" max={SERIES_MAX_WEEKS} className="timef" style={{ width: 80 }} value={weeks} onChange={e => setWeeks(Math.max(1, Math.min(SERIES_MAX_WEEKS, Number(e.target.value) || 1)))} data-testid="sess-weeks" /></label>
          : <label className="row" style={{ gap: 8, marginTop: 8 }}><span>{t('Last day')}</span><input type="date" className="timef" min={d} value={until} onChange={e => setUntil(e.target.value)} data-testid="sess-until" /></label>}
      </div>}
    </Section>}
    <Button variant="primary" icon="checkCircle" disabled={!ok || busy} onClick={save} data-testid="sess-save">{s0 ? t('Save') : t('Plan')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Cancel')}</Button>
  </div>
}

/** After a save: what else the trainer has at that time. Only a warning. */
export function overlapSheet(list) {
  openSheet(close => <>
    <h3><Icon name="warning" /> {t('Overlaps with your other sessions')}</h3>
    <p className="muted small">{t('Saved anyway: you can lead several people at once.')}</p>
    {list.map(o => <Row key={o.id} icon="person" iconTint="var(--orange)" title={o.client?.name || '?'} subtitle={`${dayShort(o.d)} · ${timeRange(o)}${o.rname ? ' · ' + o.rname : ''}`} />)}
    <div style={{ height: 8 }} />
    <Button variant="plain" onClick={close}>OK</Button>
  </>)
}

/** "Only this one" or "This and the following ones", for a session of a series. */
function askScope(s, title, fn) {
  if (!s.sid) return fn('one')
  menuSheet({
    title,
    items: [
      { icon: 'calendar', label: t('Only this session'), onClick: () => fn('one') },
      { icon: 'reset', label: t('This and all following in the series'), onClick: () => fn('series') },
    ],
  })
}
/** Move or cancel, for a trainer. `client` { id, name }; `after(r)` with the server's answer. */
export function editSession(client, s, after) {
  askScope(s, t('Change which sessions?'), scope => planFor(client, { s0: s, scope, onSaved: after }))
}
export function cancelSession(client, s, after) {
  askScope(s, t('Cancel which sessions?'), scope => confirmSheet({
    title: scope === 'series' ? t('Cancel this and the following sessions?') : t('Cancel this session?'),
    message: t('{0} gets a notification, and the session leaves their calendar.', client.name),
    confirmText: t('Cancel the session'), cancelText: t('Keep it'), danger: true,
    onConfirm: () => sessionOp({ id: client.id, op: 'cancel', sess: s.id, scope }).then(r => { toast(t('Session cancelled.')); after?.(r) }).catch(e => toast(errText(e))),
  }))
}

/** Starts the session's workout: its plan, or a freestyle one. */
export function startSession(S, s) {
  const r = routineOf(S, s)
  if (S?.active) { toast(t('A workout is already running.')); return }
  if (r) startOrPreview([r.id]); else startFlow([])
}

/** One session. `staff` { client } for a trainer (in the panel or leading); `S` the client's document (start). */
export function SessionSheet({ s, S = null, staff = null, close, onChanged }) {
  const done = S ? doneFor(S, s) : false
  const plan = S ? routineOf(S, s)?.name || s.rname : s.rname
  const canStart = !!S && !s.cx && !isPast(s) && !done && (!staff || staff.leading)
  return <div data-testid="sess-sheet">
    <h3>{sessionTitle(s)}</h3>
    <div className="sess-when"><Icon name="clock" /> <b>{fmtDate(s.d, true)}</b> · {timeRange(s)}</div>
    {s.cx ? <p className="sess-tag cx">{t('Cancelled')}</p> : done ? <p className="sess-tag done">{t('Session done')}</p> : isNow(s) ? <p className="sess-tag now">{t('Now')}</p> : recentlyChanged(s) ? <p className="sess-tag ch">{t('Changed by the trainer')}</p> : null}
    <Section>
      {staff?.client && <Row icon="person" iconTint="var(--blue)" title={staff.client.name} subtitle={t('Client')} />}
      <Row icon="list" iconTint="var(--acc)" title={plan || t('No plan (freestyle)')} subtitle={t('Plan')} />
      {s.tr?.name && <Row icon="clipboard" iconTint="var(--orange)" title={s.tr.name} subtitle={t('Trainer')} />}
      <Row icon="pin" iconTint="var(--green)" title="Habcore, ul. Mickiewicza 25J" subtitle="42-360 Poraj" />
    </Section>
    {s.note && <div className="card sess-note"><div className="small dim">{t('Note from the trainer')}</div><div>{s.note}</div></div>}
    {s.sid && s.rep && <p className="muted small">{t('Part of a weekly series.')}</p>}
    {canStart && <Button variant="primary" icon="play" onClick={() => { close(); startSession(S, s) }} data-testid="sess-start">{t('Start this workout')}</Button>}
    {staff?.client && !s.cx && !isPast(s) && <div className="sess-acts">
      <Button icon="pencil" onClick={() => { close(); editSession(staff.client, s, onChanged) }} data-testid="sess-edit">{t('Change')}</Button>
      <Button icon="trash" className="danger" onClick={() => { close(); cancelSession(staff.client, s, onChanged) }} data-testid="sess-cancel">{t('Cancel the session')}</Button>
    </div>}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>OK</Button>
  </div>
}
export const sessionSheet = (s, opts = {}) => openSheet(close => <SessionSheet s={s} close={close} {...opts} />)

/** Sessions by time. `clientOf(s)` names a client (the trainer's lists); `overlap` marks clashes. */
export function SessionRows({ list, onOpen, S = null, showClient = false, overlaps = null }) {
  return <div className="sess-rows" data-testid="sess-rows">{list.map(s => {
    const done = S ? doneFor(S, s) : false
    const clash = overlaps?.has(s.id)
    return <button key={s.id} type="button" className={'sess-row' + (s.cx ? ' cx' : '') + (isNow(s) ? ' now' : '')} onClick={() => onOpen(s)} data-testid="sess-row">
      <span className="sess-time"><b>{s.t}</b><span>{timeRange(s).split('–')[1]}</span></span>
      <span className="sess-main">
        <span className="sess-ttl">{showClient ? s.client?.name || '?' : sessionTitle(s)}</span>
        <span className="sess-sub">{[showClient && s.tr?.name ? s.tr.name : null, s.rname || (S && routineOf(S, s)?.name) || null].filter(Boolean).join(' · ') || t('No plan (freestyle)')}</span>
      </span>
      {s.cx ? <span className="sess-tag cx">{t('Cancelled')}</span> : done ? <span className="sess-tag done">{t('Session done')}</span>
        : clash ? <span className="sess-tag warn" title={t('Overlaps with another session')}><Icon name="warning" /></span>
        : recentlyChanged(s) && !showClient ? <span className="sess-tag ch">{t('Changed')}</span> : null}
    </button>
  })}</div>
}

/** Home: today's and the next sessions. Leading a client, "Zaplanuj" too. */
export function UpcomingSessions({ S }) {
  const lead = useLeading()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(i) }, [])
  const list = useMemo(() => upcoming(sessionsOf(S), now, 3), [S.sessions, now]) // eslint-disable-line react-hooks/exhaustive-deps
  // A push about a session (#/home?sess=<id>) opens it.
  useEffect(() => {
    const m = /[?&]sess=([^&]+)/.exec(location.hash || '')
    if (!m) return
    try { history.replaceState(null, '', location.pathname + location.search + '#/home') } catch { /* fine */ }
    const s = sessionsOf(useStore.getState().S).find(x => x.id === decodeURIComponent(m[1]))
    if (s) sessionSheet(s, { S: useStore.getState().S, staff: lead ? { client: lead, leading: true } : null })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length && !lead) return null
  const today = todayISO()
  const open = s => sessionSheet(s, { S, staff: lead ? { client: lead, leading: true } : null })
  return <div className="card sess-card" data-testid="home-sessions">
    <div className="row between" style={{ alignItems: 'baseline' }}>
      <h2 style={{ margin: 0 }}>{t('Planned with your trainer')}</h2>
      {lead && <button type="button" className="wf-link small" onClick={() => planFor(lead)} data-testid="sess-plan-lead">{t('Plan a session')}</button>}
    </div>
    {!list.length ? <p className="muted small">{t('Nothing planned at a set time.')}</p> : <>
      {list.map(s => <div key={s.id} className="sess-day-lbl small dim">{s.d === today ? t('Today') : s.d === addDays(today, 1) ? t('Tomorrow') : dayShort(s.d)}<SessionRows list={[s]} S={S} onOpen={open} /></div>)}
    </>}
    {list.length > 0 && !lead && list[0].d === today && !S.active && !doneFor(S, list[0]) && <Button variant="primary" size="sm" icon="play" onClick={() => startSession(S, list[0])} data-testid="sess-start-home">{t('Start this workout')}</Button>}
  </div>
}

/** The day sheet's block (sheets.jsx DayOverride): that day's sessions; leading a client, plan one. */
export function DaySessions({ S, iso, close }) {
  const lead = useLeading()
  const list = sessionsOf(S).filter(s => s.d === iso && (!s.cx || Date.now() - s.cx < 2 * 86400000))
  if (!list.length && !lead) return null
  return <div data-testid="day-sessions">
    <h4 className="sec" style={{ marginTop: 0 }}>{t('Planned with your trainer')}</h4>
    {list.length ? <SessionRows list={list} S={S} onOpen={s => sessionSheet(s, { S, staff: lead ? { client: lead, leading: true } : null })} /> : null}
    {lead && iso >= todayISO() && <Button size="sm" icon="plus" onClick={() => { close?.(); planFor(lead, { d: iso }) }} data-testid="day-sess-plan">{t('Plan a session at a set time')}</Button>}
  </div>
}

/** Plan → Schedule: the next two weeks of sessions. */
export function PlanSessions({ S }) {
  const list = useMemo(() => sessionsOf(S).filter(s => !s.cx && s.d >= todayISO() && s.d <= addDays(todayISO(), 13)), [S.sessions]) // eslint-disable-line react-hooks/exhaustive-deps
  const lead = useLeading()
  if (!list.length) return null
  const byDay = new Map()
  for (const s of list) { if (!byDay.has(s.d)) byDay.set(s.d, []); byDay.get(s.d).push(s) }
  return <Section title={t('Planned with your trainer')} footer={t('Times are set by your trainer. They also show in your calendar feed.')}>
    <div className="sess-plan" data-testid="plan-sessions">{[...byDay].map(([d, ss]) => <div key={d}>
      <div className="sess-day-lbl small dim">{dayShort(d)}</div>
      <SessionRows list={ss} S={S} onOpen={s => sessionSheet(s, { S, staff: lead ? { client: lead, leading: true } : null })} />
    </div>)}</div>
  </Section>
}

/** The gym panel: one client's sessions (from today on), with "Zaplanuj". */
export function ClientSessionsSheet({ c, close }) {
  const [data, setData] = useState(null)
  const load = () => clientSessions(c.id).then(setData).catch(e => { toast(errText(e)); setData({ sessions: [] }) })
  useEffect(() => { load() }, [c.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const list = (data?.sessions || []).filter(s => s.d >= addDays(todayISO(), -7) && (!s.cx || Date.now() - s.cx < 2 * 86400000))
  return <div data-testid="client-sessions">
    <h3>{t('Planned sessions')}: {c.name}</h3>
    {!data ? <p className="muted">{t('Loading…')}</p> : !list.length ? <p className="muted">{t('Nothing planned at a set time.')}</p>
      : <SessionRows list={list} onOpen={s => sessionSheet(s, { staff: { client: c }, onChanged: load })} />}
    <Button variant="primary" icon="plus" disabled={!c.canLead} onClick={() => planFor(c, { onSaved: load })} data-testid="client-sess-plan">{t('Plan a session')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>OK</Button>
  </div>
}
export { liveOn, sessionStart }
