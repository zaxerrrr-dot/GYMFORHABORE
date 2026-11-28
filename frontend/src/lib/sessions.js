// Habcore Gym (kl16, local patch 0018): sessions a trainer plans for a client at a time of day.
// The rules are lib/sessions-core.js (shared with the server); this is the app's side: the gym
// panel's routes (api/gymv2/index.js), what the store holds, and how a session reads on screen.
import { api } from './api.js'
import { t } from './i18n.js'
import { dateLocale } from './i18n.js'
import { useStore } from '../store/useStore.js'
import { mergeSessions, sessionsOf, sessionStart, sessionEnd, hhmmPlus, upcoming, liveOn, SESS_DUR } from './sessions-core.js'

export * from './sessions-core.js'

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) })
export const clientSessions = id => api('/api/gymv2/client/sessions?id=' + encodeURIComponent(id))
export const mySchedule = ({ from = '', to = '', all = false } = {}) => api('/api/gymv2/schedule?' + new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(all ? { all: '1' } : {}) }))

/**
 * One change through the server (it writes the client's document and tells the client). While
 * leading that client, what came back goes into this device's copy at once, so the screen does
 * not wait for the next sync.
 */
export async function sessionOp(body) {
  const r = await post('/api/gymv2/client/session', body)
  const st = useStore.getState()
  if (st.user?.acting && st.user.id === body.id && Array.isArray(r.sessions)) {
    st.update(s => { s.sessions = mergeSessions(s.sessions, r.sessions) })
  }
  return r
}

/** The signed-in person's own sessions (a client's, or the led client's while leading). */
export const mySessions = S => sessionsOf(S)
export const sessionsOnDay = (S, iso) => liveOn(sessionsOf(S), iso)
export const nextSessions = (S, n = 3, now = Date.now()) => upcoming(sessionsOf(S), now, n)

/** "18:00–19:00" */
export const timeRange = s => `${s.t}–${hhmmPlus(s.t, Number(s.dur) || SESS_DUR)}`
/** "wt, 2 gru" */
export function dayShort(iso) {
  try { return new Date(iso + 'T12:00:00').toLocaleDateString(dateLocale(), { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}
/** "Trening z Anną" / "Trening" */
export const sessionTitle = s => (s.tr?.name ? t('Workout with {0}', s.tr.name) : t('Planned workout'))
export const isPast = (s, now = Date.now()) => sessionEnd(s) <= now
export const isNow = (s, now = Date.now()) => sessionStart(s) <= now && sessionEnd(s) > now
/** A workout logged on the session's day counts as the session done. */
export const doneFor = (S, s) => (Array.isArray(S?.workouts) ? S.workouts : []).some(w => w && w.d === s.d)
/** The session's plan, if the client still has it. */
export const routineOf = (S, s) => (s.rid ? (Array.isArray(S?.routines) ? S.routines : []).find(r => r && r.id === s.rid) || null : null)
/** Changed by the trainer in the last two days (a "changed" tag on the card). */
export const recentlyChanged = (s, now = Date.now()) => (Number(s.seq) || 0) > 0 && now - (Number(s.mod) || 0) < 2 * 86400000
