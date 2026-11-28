// Habcore Gym (kl15, local patch 0017): on top of Settings → Reminders, what reminders need. A browser
// tab cannot be woken up, so the site has to be installed (added to the Home Screen) first; then the
// browser lets it ask for notifications (iPhone: iOS 16.4 or later). Two short guides, iPhone (Safari)
// and Android (Chrome), the one for this phone open. Not shown where it already runs as an installed
// app (display-mode standalone); the phone app from Xcode says its reminders are local instead.
import { useState } from 'react'
import Icon from './Icon.jsx'
import { ShareGlyph, AddGlyph } from './InstallHint.jsx'
import { MOBILE } from '../lib/mobile.js'
import { t } from '../lib/i18n.js'

/** Whether this page runs as an installed web app (Home Screen / "Install app"). */
export function runsInstalled(win = typeof window !== 'undefined' ? window : null, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!win) return false
  if (nav?.standalone === true) return true
  try { return !!(win.matchMedia?.('(display-mode: standalone)')?.matches || win.matchMedia?.('(display-mode: fullscreen)')?.matches || win.matchMedia?.('(display-mode: minimal-ui)')?.matches) } catch { return false }
}
/** 'ios' | 'android' | 'other', for which guide opens first. */
export function phoneKind(nav = typeof navigator !== 'undefined' ? navigator : null) {
  const ua = String(nav?.userAgent || '')
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && Number(nav?.maxTouchPoints) > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

const Dots = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
const Step = ({ n, icon, title, sub }) => <li><span className="ih-n">{n}</span><span className="ih-i">{icon}</span><span><b>{title}</b>{sub && <><br /><span className="ih-sub">{sub}</span></>}</span></li>

export default function ReminderInstall({ native = MOBILE, installed = runsInstalled(), kind = phoneKind() }) {
  const [open, setOpen] = useState(kind === 'android' ? 'android' : kind === 'ios' ? 'ios' : null)
  if (native) return <div className="card ri-card" data-testid="reminder-native">
    <div className="ri-head"><Icon name="bell" /><span>{t('In this app, reminders are local notifications of your phone: they work without the internet. Allow notifications for Habcore Gym when the phone asks.')}</span></div>
  </div>
  if (installed) return null
  const guide = (id, title, steps) => <div className={'ri-guide' + (open === id ? ' open' : '')} data-testid={'ri-' + id}>
    <button type="button" className="ri-toggle" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
      <span>{title}</span><Icon name={open === id ? 'chevronUp' : 'chevronDown'} />
    </button>
    {open === id && <ol className="ih-steps">{steps}</ol>}
  </div>
  return <div className="card ri-card" data-testid="reminder-install">
    <div className="ri-head"><Icon name="bell" /><b>{t('To get reminders, install the Habcore Gym app or add this page to your phone\'s Home Screen.')}</b></div>
    <p className="small muted" style={{ margin: '6px 0 10px' }}>{t('A browser tab cannot send reminders. Once added, open Habcore Gym from its icon and allow notifications.')}</p>
    {guide('ios', t('iPhone (Safari)'), <>
      <Step n={1} icon={<ShareGlyph />} title={t('Tap Share')} sub={t('In Safari\'s bottom bar (on iOS 26 tap “⋯” first).')} />
      <Step n={2} icon={<AddGlyph />} title={t('Choose “Add to Home Screen”')} sub={t('Scroll the list down if you do not see it.')} />
      <Step n={3} icon={<span className="ih-add">{t('Add')}</span>} title={t('Tap “Add”')} />
      <Step n={4} icon={<Icon name="house" />} title={t('Open Habcore Gym from its icon')} />
      <Step n={5} icon={<Icon name="bell" />} title={t('Allow notifications')} sub={t('Settings → Reminders → switch on, then Allow. Needs iOS 16.4 or later.')} />
    </>)}
    {guide('android', t('Android (Chrome)'), <>
      <Step n={1} icon={<Dots />} title={t('Tap the menu ⋮')} sub={t('Top right in Chrome.')} />
      <Step n={2} icon={<AddGlyph />} title={t('“Install app” or “Add to Home screen”')} sub={t('Then confirm with Install or Add.')} />
      <Step n={3} icon={<Icon name="house" />} title={t('Open Habcore Gym from its icon')} />
      <Step n={4} icon={<Icon name="bell" />} title={t('Allow notifications')} sub={t('Settings → Reminders → switch on, then Allow.')} />
    </>)}
  </div>
}
