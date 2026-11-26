// Live joint training (local patch 0006): the app's side of lib/gym-live.js — the store, the
// network (lib/api.js: the pairing token and a trainer's act token in the phone app, cookies in a
// browser), Server-Sent Events in a browser, and what the person sees (toasts, the workout screen).
import { createLiveClient } from './gym-live.js'
import { api, appBase } from './api.js'
import { MOBILE } from './mobile.js'
import { g } from './gymv2.js'

let client = null

const request = (method, path, body, opts = {}) => api(path, { method, ...(body != null ? { body: JSON.stringify(body) } : {}), ...(opts.timeout ? { timeout: opts.timeout } : {}) })

// A browser keeps one stream open (the cookie carries the session and a trainer's act cookie). The
// phone app sends its tokens as headers, which EventSource cannot: it long-polls (gym-live.js loop).
function sse(dev, onAnswer, onFail) {
  if (MOBILE || typeof EventSource !== 'function') return null
  let es
  try { es = new EventSource(appBase().replace(/\/$/, '') + '/api/live/stream?dev=' + encodeURIComponent(dev), { withCredentials: true }) } catch { return null }
  const take = ev => { try { onAnswer(JSON.parse(ev.data)) } catch { /* a broken event: the next one */ } }
  es.addEventListener('hello', take)
  es.addEventListener('live', take)
  es.addEventListener('none', ev => { try { onAnswer({ live: null, now: JSON.parse(ev.data).now }) } catch { /* none */ } })
  es.onerror = () => { if (es.readyState === 2) onFail() }
  return { close: () => es.close() }
}

/**
 * Starts the channel for this app (App.jsx, once). `finish` is sheets.jsx finishWorkoutNow,
 * `toWorkout` opens the workout screen, `toHome` leaves it.
 */
export function initGymLive({ useStore, useUI, finish, toWorkout, toHome }) {
  if (client) return client
  const toast = m => { try { useUI.getState().toast(m) } catch { /* no UI */ } }
  let storage = null
  try { storage = window.localStorage } catch { storage = null }
  client = createLiveClient({
    get: () => useStore.getState(),
    update: (fn, push) => useStore.getState().update(fn, push),
    request,
    storage,
    stream: sse,
    hooks: {
      toast: (kind, info) => {
        if (kind === 'other-live') toast(g('liveOther'))
        else if (kind === 'left') toast(g('liveLeft'))
        else if (kind === 'finish-sent') { toast(g('liveFinishSent')); toHome?.() }
        void info
      },
      adopted: () => {
        const acting = !!useStore.getState().user?.acting
        toast(g(acting ? 'liveJoined' : 'liveStarted'))
        toWorkout?.()
      },
      ended: e => {
        try { useUI.getState().stopRest(); useUI.getState().stopWork?.() } catch { /* none running */ }
        toast(g('liveEnded', g(e?.how === 'discarded' ? 'liveEndedDiscarded' : 'liveEndedSaved')))
        toHome?.()
      },
      // A trainer's Finish: this phone finishes the workout as if Finish was tapped here, so the
      // workout (and Apple Health, and the watch) is saved where it always is.
      finish: () => { try { finish?.() } catch (e) { console.error('live finish', e) } }
    }
  })
  useStore.subscribe((s, prev) => client.onStore(s, prev))
  client.onStore(useStore.getState(), useStore.getState())
  try {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { client.kick(); client.flush() } })
    window.addEventListener('online', () => { client.kick(); client.flush() })
  } catch { /* no DOM */ }
  client.loop()
  return client
}

/** sheets.jsx doFinishWorkout asks first: true when the client's phone saves this workout. */
export const liveFinishGate = () => (client ? client.finishGate() : false)
/** Gym screen "Dołącz" after leaving a client's workout. */
export const liveRejoin = wid => client?.rejoin(wid)
/** For the workout screen's "na żywo" line: who else is on it, or null. */
export function liveStatus() {
  const st = client?.state
  if (!st || !st.attached) return null
  return { wid: st.wid, peers: st.peers, clientPresent: client.clientPresent(), pending: st.pending.length }
}
