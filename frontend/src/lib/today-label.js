// Habcore Gym (kl15.1): what Home's "Today" row and the Start screen say after a per-date choice.
// Until now any entry in S.dayPlan for today read "· rescheduled", also when you simply picked a
// session for today (Choose a different workout, the day sheet). A pick is now just the day's
// session. Only a session that really moved here from an earlier day of this week (planned there,
// not done there) says so, with the day; a pick that replaced a different planned session says
// what it replaced, quietly. Nothing at all when the plan had nothing (a rest day, no weekly plan).
import { effectiveRoutineIds } from './history.js'
import { workoutDay } from './history.js'
import { startOfWeek, weekStartOf, isoOf, todayISO } from './format.js'

/** { kind: 'moved', from: iso } | { kind: 'instead', ids: [...] } | null for day `iso`. */
export function dayChoiceNote(S, iso = todayISO()) {
  const ov = S?.dayPlan?.[iso]
  if (ov === undefined || ov === 'rest') return null
  const chosen = effectiveRoutineIds(S, iso)
  if (!chosen.length) return null
  const { [iso]: _o, ...rest } = S.dayPlan
  const plain = { ...S, dayPlan: rest }
  const planned = effectiveRoutineIds(plain, iso)
  if (planned.length && chosen.every(id => planned.includes(id))) return null
  // Moved: planned for an earlier day of this week, which then got no workout.
  const trained = new Set((S.workouts || []).map(workoutDay))
  const first = isoOf(startOfWeek(iso, weekStartOf(S)))
  for (let d = new Date(iso + 'T12:00:00'); ;) {
    d.setDate(d.getDate() - 1)
    const day = isoOf(d)
    if (day < first) break
    if (trained.has(day)) continue
    if (effectiveRoutineIds(plain, day).some(id => chosen.includes(id))) return { kind: 'moved', from: day }
  }
  return planned.length ? { kind: 'instead', ids: planned } : null
}
