import { useMemo } from 'react'
import { t, tn } from '../lib/i18n.js'
import { fmtNum, fmtDur, fmtDate, todayISO, isoOf, weekKey, weekStartOf, DAYS } from '../lib/format.js'
import { streakInfo } from '../lib/streak.js'
import { workoutDay, workoutDuration, sessionVolume } from '../lib/history.js'
import { useUI } from '../store/useUI.js'
import { StreakFlame, Freezes } from './Streak.jsx'
import { SeasonDeco } from './Seasonal.jsx'
import { weekMarkLabel } from './StreakCalendar.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

/* Habcore Gym (patch 0014, kl12): the week streak as a "Passa" card (Polish: "passa", a run of
   good weeks; English keeps "streak"). The big number with the right word for it, a strip of the
   last weeks (trained / excused or frozen / this week outlined / missed), this week Mon to Sun
   with a dot per day trained and its totals, the best run under it. A tap opens the details: the
   weeks one by one, the record, the workouts in all. The walk is lib/streak.js, unchanged. */

export const WEEKS_SHOWN = 10

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }

/** "Streak: 3 weeks" with the plural the language wants (PL: 1 tydzień, 2–4 tygodnie, 5+ tygodni). */
export const passaTitle = n => tn('Streak: {0} week', 'Streak: {0} weeks', n)

/**
 * The numbers the card shows: the streak info, the last `count` weeks oldest first as
 * { wk, s } (s: 'on' | 'frozen' | 'excused' | 'open' | 'missed'), this week's days (7 ISO dates
 * with `done`), and this week's workouts, time and volume.
 */
export function passaData (S, today = todayISO(), count = WEEKS_SHOWN) {
  const log = new Map()
  const info = streakInfo(S, today, log)
  const ws = weekStartOf(S)
  const thisWk = weekKey(today, ws)
  const weeks = []
  for (let i = count - 1; i >= 0; i--) {
    const wk = addDays(thisWk, -7 * i)
    const e = log.get(wk)
    const s = !e ? (wk === thisWk ? 'open' : 'missed') : e.s === 'broke' ? 'missed' : e.s
    weeks.push({ wk, s: wk === thisWk && s !== 'on' ? 'open' : s, tag: e?.tag || null })
  }
  const list = Array.isArray(S?.workouts) ? S.workouts : []
  const inWeek = list.filter(w => { const d = workoutDay(w); return d && weekKey(d, ws) === thisWk })
  const daysDone = new Set(inWeek.map(workoutDay))
  const days = Array.from({ length: 7 }, (_, i) => { const d = addDays(thisWk, i); return { d, done: daysDone.has(d), today: d === today } })
  const ms = inWeek.reduce((n, w) => n + workoutDuration(w), 0)
  const vol = inWeek.reduce((n, w) => n + sessionVolume(w, S), 0)
  return { info, weeks, days, week: { count: inWeek.length, ms, vol }, total: list.length, thisWk }
}

// The week row's day names in the app's language, the same short names as Home's week ("Pn Wt Śr"),
// never the browser's: toLocaleDateString(undefined) drew "M T W T F S S" in a Polish app.
const DAY_FMT = d => t(DAYS[new Date(d + 'T12:00:00').getDay()])

/** "2 workouts · 1h 35m · 12 400 kg": only what there is. */
export function weekLine (week, unit = 'kg') {
  const parts = [tn('{0} workout', '{0} workouts', week.count)]
  if (week.ms >= 60000) parts.push(fmtDur(week.ms))
  if (week.vol > 0) parts.push(fmtNum(Math.round(week.vol)) + ' ' + unit)
  return parts.join(' · ')
}

function WeekStrip ({ weeks }) {
  return <div className="passa-strip" role="img" aria-label={t('The last {0} weeks', weeks.length)}>
    {weeks.map(w => <span key={w.wk} className={'passa-wk is-' + w.s} title={t('Week of {0}', fmtDate(w.wk)) + ': ' + weekMarkLabel(w.s)} />)}
  </div>
}

/** Home's card. `onOpen` opens the details (passaSheet), `children` go under it (the party, weekly sets). */
export function PassaCard ({ S, onOpen, tally = null, children }) {
  const today = todayISO()
  const data = useMemo(() => passaData(S, today), [S.workouts, S.streakRule, S.notes, S.weekStart, S.unit, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const { info, weeks, days, week } = data
  return <div className="card tap-host streak-card passa-card" data-passa>
    <SeasonDeco spot="home-streak" />
    <button type="button" className="passa-main" onClick={onOpen} aria-haspopup="dialog">
      <span className="passa-top">
        <span className="streak-flame-wrap passa-flame"><StreakFlame lit={info.current > 0} /><SeasonDeco spot="streak-flame" /></span>
        <span className="passa-n" data-passa-title>{passaTitle(info.current)}</span>
        <Icon name="chevronRight" className="chev" />
      </span>
      <WeekStrip weeks={weeks} />
      <span className="passa-week">
        <span className="passa-days" aria-label={t('This week')}>
          {days.map(d => <span key={d.d} className={'passa-day' + (d.done ? ' done' : '') + (d.today ? ' today' : '')}>
            <span className="passa-dl">{DAY_FMT(d.d)}</span><span className="passa-dot" aria-hidden="true" />
          </span>)}
        </span>
        {/* "2 / 4" first where the week has a plan (lib/queue.js weekTally: coach sessions count
            wherever in the calendar they fell), then what was done. */}
        <span className="passa-wl small" data-passa-week>{t('This week')}: {tally?.planned ? tally.done + ' / ' + tally.planned + ' · ' : ''}{weekLine(week, S.unit)}</span>
      </span>
      {info.best > 0 && <span className="passa-best small muted">{t('Best streak: {0} wk', info.best)}{info.max ? <> · <Freezes n={info.freezes} max={info.max} /></> : null}</span>}
    </button>
    {children}
  </div>
}

/** The details: the record, the workouts in all, the freezes, and the last weeks one by one. */
export function PassaSheet ({ S, close, onCalendar, onHelp }) {
  const data = passaData(S, todayISO(), 16)
  const { info, total } = data
  const list = Array.isArray(S?.workouts) ? S.workouts : []
  const ws = weekStartOf(S)
  const perWeek = new Map()
  let first = null   // the first trained week: the weeks before it are not "missed", there was nothing yet
  for (const w of list) { const d = workoutDay(w); if (d) { const k = weekKey(d, ws); perWeek.set(k, (perWeek.get(k) || 0) + 1); if (!first || k < first) first = k } }
  return <div data-passa-sheet>
    <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 'var(--fs-title1)' }}><StreakFlame lit={info.current > 0} /></span>
      <h3 style={{ margin: 0, flex: 1 }}>{passaTitle(info.current)}</h3>
      <button type="button" className="iconbtn" aria-label={t('How your streak works')} onClick={() => { close(); onHelp?.() }}><Icon name="info" /></button>
    </div>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('Weeks in a row with at least one workout.')}</div>
    <div className="passa-stats">
      <div><b>{tn('{0} week', '{0} weeks', info.best)}</b><span className="muted small">{t('Best streak')}</span></div>
      <div><b>{fmtNum(total)}</b><span className="muted small">{t('Workouts in all')}</span></div>
      {info.max > 0 && <div><b>{info.freezes} / {info.max}</b><span className="muted small">{t('Streak freezes')}</span></div>}
    </div>
    <div className="passa-hist">
      {data.weeks.filter(w => !first || w.wk >= first).reverse().map(w => <div key={w.wk} className="passa-hrow">
        <span className={'passa-wk is-' + w.s} aria-hidden="true" />
        <span className="grow">{t('Week of {0}', fmtDate(w.wk))}</span>
        <span className="muted small">{weekMarkLabel(w.s)}{perWeek.get(w.wk) ? ' · ' + tn('{0} workout', '{0} workouts', perWeek.get(w.wk)) : ''}</span>
      </div>)}
    </div>
    <div style={{ height: 12 }} />
    <Button icon="calendar" onClick={() => { close(); onCalendar?.() }}>{t('Open the calendar')}</Button>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Done')}</Button>
  </div>
}

export const passaSheet = (S, opts = {}) => useUI.getState().openSheet(close => <PassaSheet S={S} close={close} {...opts} />)
