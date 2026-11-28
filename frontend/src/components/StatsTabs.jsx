import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { isOn } from '../lib/modules.js'
import { t } from '../lib/i18n.js'

/* Habcore Gym (kl13/kl14): the switch at the top of Stats and its sister pages, so "Ciało" (the
   body module) and "Treningi" (the workout feed) are one tap from the Stats tab. */
export default function StatsTabs({ current }) {
  const loc = { pathname: current }
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const tabs = [
    { path: '/stats', label: t('Stats') },
    ...(TRENINGI ? [{ path: '/treningi', label: t('Workouts') }] : []),
    ...(isOn(S, 'body') ? [{ path: '/cialo', label: t('Body') }] : []),
  ]
  if (tabs.length < 2) return null
  return <nav className="stats-tabs" aria-label={t('Stats')} data-stats-tabs>
    {tabs.map(x => <button key={x.path} type="button" className={loc.pathname === x.path ? 'on' : ''} aria-current={loc.pathname === x.path ? 'page' : undefined}
      onClick={() => { if (loc.pathname !== x.path) nav(x.path, { replace: true }) }}>{x.label}</button>)}
  </nav>
}
// kl14 (patch 0016): the workout feed is on.
export const TRENINGI = true
