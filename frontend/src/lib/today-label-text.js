// Habcore Gym (kl15.1): lib/today-label.js in words, for Home and the Start screen.
import { dayChoiceNote } from './today-label.js'
import { t } from './i18n.js'
import { fmtDate, todayISO } from './format.js'
import { deriveSessionName } from './session-merge.js'

export function dayChoiceText(S, iso = todayISO()) {
  const n = dayChoiceNote(S, iso)
  if (!n) return ''
  if (n.kind === 'moved') return t('Moved from {0}', fmtDate(n.from, true))
  const names = n.ids.map(id => S.routines.find(r => r.id === id)?.name).filter(Boolean)
  return names.length ? t('Instead of {0}', deriveSessionName(names)) : ''
}
