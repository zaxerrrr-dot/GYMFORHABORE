// Habcore Gym (kl14, local patch 0016): a client's workouts in the trainer's gym panel, without leading
// them: the same feed the client has (components/WorkoutFeed.jsx), a month calendar whose days list
// that day's workouts, and each workout's summary with its notes thread, written through
// /api/gymv2/client/note (api/gymv2/index.js) so the client gets a push.
import { useEffect, useMemo, useState } from 'react'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtDur, fmtVol, todayISO, isoOf, weekStartOf, weekOrder, DAYS, MONTHS_LONG } from '../lib/format.js'
import { setLabel, workoutDay } from '../lib/history.js'
import { hasCompletedWork } from '../lib/workout-model.js'
import { EXIDX } from '../lib/exercises.js'
import { exerciseNameText } from '../lib/format.js'
import { previousSame, compareWorkouts, cardFacts } from '../lib/workout-feed.js'
import { startLeading } from '../lib/gymv2.js'
import { clientSessions } from '../lib/sessions.js'
import { Button } from './ui.jsx'
import Icon from './Icon.jsx'
import { WorkoutFeedList, WorkoutCard, NotesThread, CompareBlock, ledLabel } from './WorkoutFeed.jsx'

const openSheet = (render, opts) => useUI.getState().openSheet(render, opts)
const toastMsg = m => { try { useUI.getState().toast(m) } catch { /* none */ } }
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })
export const clientWorkouts = (id, off = 0, n = 30) => api('/api/gymv2/client/workouts?id=' + encodeURIComponent(id) + '&off=' + off + '&n=' + n)
export const clientNote = body => post('/api/gymv2/client/note', body)

function useClientFeed(c) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = async (off = 0) => {
    setBusy(true)
    try {
      const r = await clientWorkouts(c.id, off, 30)
      setData(d => (off && d ? { ...r, workouts: [...d.workouts, ...r.workouts] } : r))
    } catch (e) { toastMsg(t('Could not load the workouts.')); if (!off) setData({ workouts: [], total: 0, days: [], routines: [], customEx: [] }) }
    finally { setBusy(false) }
  }
  useEffect(() => { load(0) }, [c.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const replace = w => setData(d => d && { ...d, workouts: d.workouts.map(x => (String(x.id) === String(w.id) ? w : x)) })
  return { data, busy, load, replace }
}
const stateOf = data => Object.assign(JSON.parse(JSON.stringify(DEF)), { unit: data?.unit || 'kg', weekStart: data?.weekStart ?? DEF.weekStart, workouts: data?.workouts || [], routines: data?.routines || [] })

/** The sheet: a client's calendar and feed. `openWid`: open that workout once it is loaded (a push). */
export function ClientFeedSheet({ c, close, openWid = null }) {
  const { data, busy, load, replace } = useClientFeed(c)
  const S = useMemo(() => stateOf(data), [data])
  const custom = useMemo(() => new Map((data?.customEx || []).map(e => [e.id, e.name])), [data])
  const nameOf = id => (EXIDX[id] ? exerciseNameText(EXIDX[id]) : custom.get(id) || String(id || ''))
  const planName = id => (data?.routines || []).find(r => r.id === id)?.name || id
  const open = w => openSheet(cl => <ClientWorkoutSheet c={c} w={w} S={S} nameOf={nameOf} close={cl} onSaved={replace} />)
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (opened || !openWid || !data) return
    setOpened(true)
    const w = data.workouts.find(x => String(x.id) === String(openWid))
    if (w) open(w)
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = useMemo(() => new Set(data?.days || []), [data])
  // The client's sessions planned by a trainer (kl17): a hollow ring on days not trained yet.
  const [planned, setPlanned] = useState(() => new Set())
  useEffect(() => { clientSessions(c.id).then(r => setPlanned(new Set((r?.sessions || []).filter(s => !s.cx).map(s => s.d)))).catch(() => {}) }, [c.id])
  const onDay = iso => openSheet(cl => <ClientDaySheet c={c} iso={iso} S={S} nameOf={nameOf} close={cl} onOpen={w => { cl(); open(w) }} />)
  return <>
    <h3>{t('Workouts')}: {c.name}</h3>
    {!data ? <p className="muted">{t('Loading…')}</p> : <>
      <MonthDays days={days} planned={planned} S={S} onDay={onDay} />
      <WorkoutFeedList workouts={data.workouts} S={S} nameOf={nameOf} planName={planName} onOpen={open}
        total={data.total} onMore={() => { if (!busy) load(data.workouts.length) }}
        empty={<p className="muted">{t('No workouts yet.')}</p>} />
    </>}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>OK</Button>
  </>
}

/** A small month calendar: a dot on every trained day; any day opens that day. */
export function MonthDays({ days, S, onDay, planned = null }) {
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const y = cur.getFullYear(), mo = cur.getMonth()
  const ws = weekStartOf(S)
  const first = new Date(y, mo, 1)
  const lead = (first.getDay() - ws + 7) % 7
  const n = new Date(y, mo + 1, 0).getDate()
  const today = todayISO()
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(<span key={'b' + i} />)
  for (let d = 1; d <= n; d++) {
    const iso = isoOf(new Date(y, mo, d))
    cells.push(<button key={iso} type="button" className={(days.has(iso) ? 'has' : planned?.has(iso) ? 'sess' : '') + (iso === today ? ' today' : '')} onClick={() => onDay(iso)} aria-label={fmtDate(iso, true)} data-testid="wf-cal-day">{d}</button>)
  }
  return <div data-testid="wf-cal">
    <div className="row between" style={{ alignItems: 'center' }}>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo - 1, 1))} aria-label={t('Previous month')}><Icon name="chevronLeft" /></button>
      <b>{t(MONTHS_LONG[mo])} {y}</b>
      <button className="iconbtn" onClick={() => setCur(new Date(y, mo + 1, 1))} aria-label={t('Next month')}><Icon name="chevronRight" /></button>
    </div>
    <div className="wf-day-cal">{weekOrder(ws).map(d => <span key={'h' + d} className="h">{t(DAYS[d])}</span>)}{cells}</div>
  </div>
}

/** One day of a client in the panel: that day's workouts, and leading the client to add one there. */
function ClientDaySheet({ c, iso, S, nameOf, close, onOpen }) {
  const ws = S.workouts.filter(w => workoutDay(w) === iso)
  const [busy, setBusy] = useState(false)
  const lead = async () => {
    setBusy(true)
    try { await startLeading(useStore, c.id, '#/home?day=' + iso) } catch (e) { setBusy(false); toastMsg(String(e?.message || e)) }
  }
  const label = iso < todayISO() ? t('Lead {0} and add a workout on this day', c.name) : iso === todayISO() ? t('Lead {0} and start a workout', c.name) : t('Lead {0} and plan this day', c.name)
  return <>
    <h3>{fmtDate(iso, true)} · {c.name}</h3>
    {ws.length ? <><h4 className="sec" style={{ marginTop: 0 }}>{t('Workouts this day')}</h4>
      {ws.map(w => <WorkoutCard key={w.id} w={w} S={S} nameOf={nameOf} onOpen={onOpen} />)}</>
      : <p className="muted">{t('No workout on this day.')}</p>}
    <Button variant="primary" icon="play" disabled={busy || !c.canLead} onClick={lead} data-testid="wf-day-lead">{label}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>OK</Button>
  </>
}

/** A client's workout in the panel: what was done, against last time, and the notes thread. */
function ClientWorkoutSheet({ c, w: w0, S, nameOf, close, onSaved }) {
  const me = useStore(s => s.user)
  const [w, setW] = useState(w0)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const f = cardFacts(w, S)
  const cmp = compareWorkouts(w, previousSame(S.workouts, w), S)
  const send = async body => {
    setBusy(true)
    try { const r = await clientNote({ id: c.id, wid: w.id, ...body }); setW(r.workout); onSaved(r.workout) }
    catch (e) { toastMsg(t('Could not save the note.')) }
    finally { setBusy(false) }
  }
  return <>
    <h3>{w.name || t('Workout')}</h3>
    <div className="muted small">{[fmtDate(f.day, true), f.ms >= 60000 ? fmtDur(f.ms) : null, f.vol > 0 ? fmtVol(f.vol, S.unit) : null, tn('{0} set', '{0} sets', f.sets)].filter(Boolean).join(' · ')}</div>
    {f.led && <div className="wf-led small" style={{ marginTop: 4 }}><Icon name="person" />{ledLabel(f.led)}</div>}
    <div className="list" style={{ margin: '12px 0' }}>{(w.entries || []).map((e, i) => <div key={i} className="item">
      <div className="grow"><div className="tt">{nameOf(e.id)}{(w.prs || []).includes(e.id) && <span className="pr" style={{ marginInlineStart: 6 }}><Icon name="trophy" />PR</span>}</div>
        <div className="ss">{(e.sets || []).filter(hasCompletedWork).map(s => setLabel(e.id, s, e.target)).join(' · ') || t('no sets')}</div></div>
    </div>)}</div>
    <CompareBlock cmp={cmp} S={S} nameOf={nameOf} onOpenPrev={() => { close(); openSheet(cl => <ClientWorkoutSheet c={c} w={cmp.prev} S={S} nameOf={nameOf} close={cl} onSaved={onSaved} />) }} />
    <NotesThread w={w} me={me?.id} owner={{ id: c.id, name: c.name }} draft={draft} setDraft={setDraft} busy={busy}
      onAdd={text => send({ text })} onEdit={(nid, text) => send({ nid, text })} onDelete={nid => send({ nid, del: true })} />
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>OK</Button>
  </>
}
