// Habcore Gym (kl14, local patch 0016): the workout feed ("Treningi") and a workout's notes thread.
// The cards and the list take the workouts and a state-like `S` (units, the week's first day), so
// the client's own app (views/Workouts.jsx) and the trainer's gym panel (views/Gym.jsx, a client's
// workouts from the server) show the same feed.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import BodyMap from './BodyMap.jsx'
import { Button, SearchField, MenuButton, Segmented } from './ui.jsx'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtDur, fmtVol, fmtNum, exerciseNameText } from '../lib/format.js'
import { EXIDX } from '../lib/exercises.js'
import { loadOfWorkouts } from '../lib/muscles.js'
import { feedFilter, feedGroups, cardFacts, topExercises, filterChoices, FEED_PAGE, PERIODS } from '../lib/workout-feed.js'
import { notesOf, mayChange, WORKOUT_NOTE_MAX } from '../lib/workout-notes.js'

const timeOf = ms => { try { return ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' } catch { return '' } }
const whenOf = ms => { try { return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

export const feedNameOf = id => (EXIDX[id] ? exerciseNameText(EXIDX[id]) : String(id || ''))

export function ledLabel(led) {
  if (!led) return ''
  if (led.kind === 'group') return led.name ? t('Group workout · {0}', led.name) : t('Group workout')
  if (led.kind === 'joint') return led.name ? t('Joint workout · {0}', led.name) : t('Joint workout')
  if (led.kind === 'live') return led.name ? t('Live with {0}', led.name) : t('Live with trainer')
  return led.name ? t('Led by {0} (trainer)', led.name) : t('Led by your trainer')
}

/** One workout as a card: when, what, who led it, the numbers, the muscles or the exercises, PRs, notes. */
export function WorkoutCard({ w, S, nameOf, onOpen, body }) {
  const f = cardFacts(w, S)
  const load = useMemo(() => loadOfWorkouts([w]), [w])
  const hasMap = Object.values(load).some(v => v > 0)
  const top = topExercises(w, 3)
  const stats = [
    f.ms >= 60000 && [t('Time'), fmtDur(f.ms)],
    f.vol > 0 && [t('Volume'), fmtVol(f.vol, S.unit || 'kg')],
    [t('Sets / reps'), f.sets + ' / ' + fmtNum(f.reps)],
    [t('Exercises'), String(f.exercises)],
    f.hr && [t('Avg heart rate'), f.hr + ' bpm'],
    f.kcal && [t('Calories'), f.kcal + ' kcal'],
  ].filter(Boolean)
  return <article className="card wf-card" data-testid="wf-card" data-id={w.id}>
    <button type="button" className="wf-open" onClick={() => onOpen(w)} aria-label={(w.name || t('Workout')) + ', ' + fmtDate(f.day, true)}>
      <div className="wf-head">
        <div className="grow">
          <div className="wf-when small dim">{fmtDate(f.day, true)}{w.start ? ' · ' + timeOf(w.start) : ''}</div>
          <div className="wf-name">{w.name || t('Workout')}</div>
          {f.led && <div className="wf-led small"><Icon name="person" />{ledLabel(f.led)}</div>}
        </div>
        {hasMap && <span className="wf-map" aria-hidden="true"><BodyMap className="bm-mini" load={load} body={body} /></span>}
      </div>
      <div className="wf-stats">{stats.map(([k, v]) => <div key={k}><span className="wf-k">{k}</span><span className="wf-v">{v}</span></div>)}</div>
      {top.ids.length > 0 && <div className="wf-ex small muted">{top.ids.map(nameOf).join(' · ')}{top.more > 0 ? ' ' + t('+{0}', top.more) : ''}</div>}
      {(f.prs > 0 || f.notes > 0) && <div className="wf-foot small">
        {f.prs > 0 && <span className="pr"><Icon name="trophy" />{f.prs} PR</span>}
        {f.notes > 0 && <span className="wf-notes"><Icon name="chat" />{tn('{0} note', '{0} notes', f.notes)}</span>}
      </div>}
    </button>
  </article>
}

/**
 * The feed: search, period / exercise / plan filters, week or month groups with their totals, and
 * the cards, FEED_PAGE at a time (more as the end comes into view, and a "Show more" button).
 * `total`/`onMore`: a feed read from the server in pages (the gym panel) asks for the next page.
 */
export function WorkoutFeedList({ workouts, S, nameOf, planName = id => id, onOpen, body, total = null, onMore = null, empty = null }) {
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('all')
  const [ex, setEx] = useState('')
  const [plan, setPlan] = useState('')
  const [by, setBy] = useState('week')
  const [shown, setShown] = useState(FEED_PAGE)
  const end = useRef(null)
  const choices = useMemo(() => filterChoices(workouts), [workouts])
  const items = useMemo(() => feedFilter(workouts, { period, ex, plan, q }, { nameOf }), [workouts, period, ex, plan, q, nameOf])
  useEffect(() => setShown(FEED_PAGE), [period, ex, plan, q])
  const page = items.slice(0, shown)
  const groups = useMemo(() => feedGroups(page, S, by), [page, S, by])
  const more = items.length > shown || (onMore && total != null && workouts.length < total)
  const grow = () => { if (items.length > shown) setShown(n => n + FEED_PAGE); else if (onMore) onMore() }
  useEffect(() => {
    if (!more) return
    const IO = typeof window !== 'undefined' ? window.IntersectionObserver : undefined
    if (typeof IO !== 'function' || !end.current) return
    const io = new IO(es => { if (es.some(e => e.isIntersecting)) grow() }, { rootMargin: '0px 0px 900px 0px' })
    io.observe(end.current)
    return () => io.disconnect()
  })
  const periodOpts = PERIODS.map(p => ({ value: p, label: p === 'all' ? t('All time') : p === '365' ? t('Last 12 months') : t('Last {0} days', p) }))
  const exOpts = [{ value: '', label: t('All exercises') }, ...choices.ex.map(id => ({ value: id, label: nameOf(id) }))]
  const planOpts = [{ value: '', label: t('All plans') }, ...choices.plan.map(id => ({ value: id, label: planName(id) }))]
  const filtered = !!(q || ex || plan || period !== 'all')
  if (!workouts.length) return empty
  return <div className="wf" data-testid="wf-feed">
    <div className="wf-search"><SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={t('Search workouts, exercises, notes')} aria-label={t('Search workouts, exercises, notes')} data-testid="wf-search" /></div>
    <div className="wf-filters">
      <MenuButton title={t('Period')} value={period} options={periodOpts} onChange={setPeriod} />
      {choices.ex.length > 0 && <MenuButton title={t('Exercise')} value={ex} options={exOpts} onChange={setEx} />}
      {choices.plan.length > 0 && <MenuButton title={t('Plan')} value={plan} options={planOpts} onChange={setPlan} />}
      {filtered && <Button size="sm" variant="ghost" onClick={() => { setQ(''); setEx(''); setPlan(''); setPeriod('all') }}>{t('Clear')}</Button>}
    </div>
    <Segmented className="wf-by" value={by} onChange={setBy} options={[{ value: 'week', label: t('Weeks') }, { value: 'month', label: t('Months') }]} />
    {!items.length && <p className="muted" style={{ textAlign: 'center', margin: '24px 0' }}>{t('No workouts match.')}</p>}
    {groups.map(gr => <section key={gr.key} className="wf-group" data-testid="wf-group">
      <h4 className="sec wf-gh"><span>{by === 'month' ? fmtMonth(gr.from) : fmtDate(gr.from) + ' – ' + fmtDate(gr.to)}</span>
        <span className="small dim">{[tn('{0} workout', '{0} workouts', gr.n), gr.ms >= 60000 ? fmtDur(gr.ms) : null, gr.vol > 0 ? fmtVol(gr.vol, S.unit || 'kg') : null, tn('{0} set', '{0} sets', gr.sets)].filter(Boolean).join(' · ')}</span></h4>
      {gr.items.map(w => <WorkoutCard key={w.id || w.start} w={w} S={S} nameOf={nameOf} onOpen={onOpen} body={body} />)}
    </section>)}
    {more && <>
      <div ref={end} aria-hidden="true" style={{ height: 1 }} />
      <Button variant="tinted" onClick={grow} data-testid="wf-more">{t('Show more')}</Button>
    </>}
  </div>
}
const fmtMonth = iso => { try { const s = new Date(iso + 'T12:00:00').toLocaleDateString([], { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1) } catch { return iso.slice(0, 7) } }

/**
 * A workout's notes as a thread: each note with its author ("Trainer" for a trainer), when, and Edit /
 * Delete on one's own; a box to write the next one. `me` is the id of whoever writes here.
 * onAdd(text) / onEdit(id, text) / onDelete(id) do the writing (the app's store, or the gym panel's API).
 * `draft` + `setDraft` let the caller keep (and save) what is typed when the sheet closes.
 */
export function NotesThread({ w, me, owner = null, onAdd, onEdit, onDelete, draft, setDraft, textareaRef, onFocus, busy = false }) {
  const notes = notesOf(w, owner)
  const [editing, setEditing] = useState(null)
  const [text, setText] = useState('')
  const send = () => { const v = String(draft || '').trim(); if (!v || busy) return; onAdd(v); setDraft('') }
  return <div className="wf-thread" data-testid="wf-thread">
    <h4 className="sec" style={{ marginTop: 6 }}>{t('Notes')}{notes.length ? ` (${notes.length})` : ''}</h4>
    {notes.length === 0 && <p className="small dim" style={{ margin: '0 0 8px' }}>{t('No notes yet. Write how it went; your trainer can answer here.')}</p>}
    {notes.map(n => {
      const trainer = n.by?.role === 'trainer'
      const mine = n.by ? mayChange(n, me) : !owner || owner.id === me
      return <div key={n.id} className={'wf-note' + (trainer ? ' trainer' : '') + (mine ? ' mine' : '')} data-testid="wf-note">
        <div className="wf-note-h small">
          <b>{n.by?.name || owner?.name || t('You')}</b>{trainer && <span className="wf-role">{t('Trainer')}</span>}
          <span className="dim">{whenOf(n.e || n.at)}{n.e ? ' · ' + t('edited') : ''}</span>
        </div>
        {editing === n.id
          ? <div className="wf-note-edit">
            <textarea className="input" rows={2} maxLength={WORKOUT_NOTE_MAX} value={text} onChange={e => setText(e.target.value)} />
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <Button size="sm" variant="primary" disabled={busy} onClick={() => { onEdit(n.id, text); setEditing(null) }}>{t('Save')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>{t('Cancel')}</Button>
            </div>
          </div>
          : <div className="wf-note-t">{n.text}</div>}
        {mine && editing !== n.id && <div className="wf-note-a small">
          <button type="button" className="wf-link" onClick={() => { setEditing(n.id); setText(n.text) }}>{t('Edit')}</button>
          <button type="button" className="wf-link danger" onClick={() => onDelete(n.id)}>{t('Delete')}</button>
        </div>}
      </div>
    })}
    <div className="wf-compose">
      <textarea ref={textareaRef} className="input" rows={2} maxLength={WORKOUT_NOTE_MAX} value={draft} data-tour="wd-note"
        placeholder={notes.length ? t('Write a note…') : t('How the session went as a whole.')}
        onFocus={onFocus} onChange={e => setDraft(e.target.value)} />
      <Button size="sm" variant="primary" icon="plus" disabled={busy || !String(draft || '').trim()} onClick={send} data-testid="wf-send">{t('Add note')}</Button>
    </div>
  </div>
}

/** "Compared with last time": the totals' changes and the exercises that went up or down. */
export function CompareBlock({ cmp, S, nameOf, onOpenPrev }) {
  if (!cmp) return null
  const sign = (v, f) => (v > 0 ? '+' : v < 0 ? '−' : '±') + f(Math.abs(v))
  const cls = v => (v > 0 ? 'up' : v < 0 ? 'down' : '')
  const rows = [
    [t('Volume'), cmp.vol, v => fmtVol(v, S.unit || 'kg')],
    [t('Sets'), cmp.sets, v => String(v)],
    [t('Reps'), cmp.reps, v => fmtNum(v)],
    [t('Time'), cmp.ms, v => fmtDur(v)],
  ]
  return <div className="wf-cmp" data-testid="wf-compare">
    <h4 className="sec" style={{ marginTop: 6 }}>{t('Compared with last time')}</h4>
    <button type="button" className="wf-link small" onClick={onOpenPrev}>{t('Last time: {0}', fmtDate(cmp.day, true))}</button>
    <div className="wf-stats" style={{ marginTop: 6 }}>{rows.map(([k, v, f]) => <div key={k}><span className="wf-k">{k}</span><span className={'wf-v ' + cls(v)}>{sign(v, f)}</span></div>)}</div>
    {cmp.ex.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>
      {cmp.ex.filter(x => x.now !== x.was).slice(0, 6).map((x, i) => <Fragment key={x.id}>{i > 0 && ' · '}<span className={cls(x.now - x.was)}>{nameOf(x.id)} {fmtNum(x.was)}→{fmtNum(x.now)}</span></Fragment>)}
      {cmp.ex.every(x => x.now === x.was) && t('The same heaviest sets as last time.')}
    </div>}
  </div>
}
