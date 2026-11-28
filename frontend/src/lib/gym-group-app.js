// Group training (local patch 0006): lib/gym-group.js with the app's own builders (an exercise as
// the client's app would add it, a finished workout as Finish builds it) and lib/api.js.
import { createGroup } from './gym-group.js'
import { api } from './api.js'
import { DEF, useStore } from '../store/useStore.js'
import { freestyleConfig, pickedExerciseConfig, workoutVolume } from './history.js'
import { sessionHistory } from './backfill.js'
import { buildSessionEntry } from './session-start.js'
import { buildCompletedWorkout } from './finish-workout.js'
import { todayISO } from './format.js'
import { getLang } from './i18n-core.js'

const clone = v => JSON.parse(JSON.stringify(v))
const asState = doc => Object.assign(clone(DEF), doc || {})
const request = (method, path, body, opts = {}) => api(path, { method, ...(body != null ? { body: JSON.stringify(body) } : {}), ...(opts.timeout ? { timeout: opts.timeout } : {}) })

export const groupBuild = {
  header: () => ({
    d: todayISO(), start: Date.now(), routineIds: [], bw: null,
    name: String(getLang() || '').startsWith('pl') ? 'Trening z trenerem' : 'Workout with trainer',
    workoutView: 'cards',
  }),
  // As Workout.jsx addExercise does it in a freestyle session: the client's last session of it.
  entry: (doc, exId) => {
    const S = asState(doc)
    const picked = pickedExerciseConfig(exId, undefined, S)
    const cfg = freestyleConfig(sessionHistory(S), { id: exId, ...picked }) || picked
    return { id: exId, ...buildSessionEntry(S, exId, cfg, null, null) }
  },
  finished: (A, end) => {
    const w = buildCompletedWorkout(A, { end })
    w.vol = workoutVolume(w)
    // Habcore Gym (kl14): the trainer running the group, for the client's feed and notes.
    const me = useStore.getState().user
    if (me?.id) w.led = { kind: 'group', id: String(me.id), name: String(me.name || '') }
    return w
  },
}

let group = null
export function theGroup() {
  if (!group) {
    let storage = null
    try { storage = window.localStorage } catch { storage = null }
    group = createGroup({ request, storage, build: groupBuild })
  }
  return group
}
