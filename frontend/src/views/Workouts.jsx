// Habcore Gym (kl14, local patch 0016): "Treningi", the workout feed (components/WorkoutFeed.jsx), one tap
// from Stats (components/StatsTabs.jsx). `#/treningi?w=<id>` (a note's push) opens that workout.
import { useCallback, useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { t, tn } from '../lib/i18n.js'
import { workoutDetailSheet, logPastWorkoutSheet, calendarSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import EmptyState from '../components/EmptyState.jsx'
import StatsTabs from '../components/StatsTabs.jsx'
import { WorkoutFeedList, feedNameOf } from '../components/WorkoutFeed.jsx'

export function openFromHash(S) {
  const m = /[?&]w=([^&]+)/.exec(location.hash || '')
  if (!m) return false
  const id = decodeURIComponent(m[1])
  const w = (S.workouts || []).find(x => String(x.id) === id)
  if (w) workoutDetailSheet(w)
  try { history.replaceState(null, '', location.pathname + location.search + '#/treningi') } catch { /* fine */ }
  return !!w
}

export default function Workouts() {
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const planName = useCallback(id => (S.routines.find(r => r.id === id) || {}).name || t('Deleted plan'), [S.routines])
  useEffect(() => { openFromHash(useStore.getState().S) }, [])
  return <>
    <StatsTabs current="/treningi" />
    <div className="row between" style={{ alignItems: 'center' }}>
      <div><h1 style={{ margin: '6px 0 0' }}>{t('Workouts')}</h1><div className="sub small dim">{tn('{0} workout', '{0} workouts', S.workouts.length)}</div></div>
      <div className="row" style={{ gap: 8 }}>
        <button className="iconbtn" onClick={() => calendarSheet()} aria-label={t('Calendar')} title={t('Calendar')}><Icon name="calendar" /></button>
        <Button size="sm" variant="primary" icon="plus" onClick={() => logPastWorkoutSheet()} data-testid="wf-add">{t('Log a past workout')}</Button>
      </div>
    </div>
    <div style={{ height: 10 }} />
    <WorkoutFeedList workouts={S.workouts} S={S} nameOf={feedNameOf} planName={planName} body={S.body}
      onOpen={w => workoutDetailSheet(w)} me={user?.id}
      empty={<EmptyState icon="history" text={t('No workouts yet. Your first one will land here.')}>
        <Button variant="tinted" icon="plus" onClick={() => logPastWorkoutSheet()}>{t('Log a past workout')}</Button>
      </EmptyState>} />
  </>
}
