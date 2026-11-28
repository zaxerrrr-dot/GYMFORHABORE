// Habcore Gym (local patch 0006): on an iPhone or iPad in a browser (not the installed web app, not
// the native app), after signing in, a short sheet shows how to add the site to the Home Screen:
// Share -> Add to Home Screen -> Add, with an arrow towards Safari's Share button (the bottom bar on
// an iPhone, the top bar on an iPad). In Chrome, Firefox or Edge on iOS (16.4+ can add from there
// too) it says where their Share is, or to open the page in Safari.
// "Rozumiem" hides it for 7 days, "Nie pokazuj więcej" for good (localStorage; private mode or
// blocked storage only means it may show again).
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { MOBILE } from '../lib/mobile.js'
import { getLang } from '../lib/i18n-core.js'

const KEY = 'hc_install_hint'
export const AGAIN_MS = 7 * 86400000

const T = {
  title: ['Dodaj Habcore Gym do ekranu początkowego', 'Add Habcore Gym to your Home Screen'],
  lead: ['Otworzy się wtedy jak aplikacja: na pełnym ekranie, z własną ikoną i bez paska adresu.', 'It then opens like an app: full screen, with its own icon and no address bar.'],
  s1: ['Dotknij przycisku Udostępnij', 'Tap the Share button'],
  s1iphone: ['na dolnym pasku Safari (w iOS 26 najpierw „⋯”).', 'in Safari\'s bottom bar (on iOS 26 tap “⋯” first).'],
  s1ipad: ['na górnym pasku Safari, obok adresu.', 'in Safari\'s top bar, next to the address.'],
  s2: ['Wybierz „Do ekranu początkowego”', 'Choose “Add to Home Screen”'],
  s2sub: ['Przewiń listę w dół, jeśli nie widzisz tej opcji.', 'Scroll the list down if you do not see it.'],
  s3: ['Dotknij „Dodaj”', 'Tap “Add”'],
  s3sub: ['Ikona Habcore Gym pojawi się na ekranie początkowym.', 'The Habcore Gym icon appears on your Home Screen.'],
  other: ['Ta przeglądarka:', 'This browser:'],
  otherHow: ['dotknij Udostępnij na pasku adresu (iOS 16.4 lub nowszy), a potem „Do ekranu początkowego”. Jeśli nie ma tej opcji, otwórz tę stronę w Safari.', 'tap Share in the address bar (iOS 16.4 or later), then “Add to Home Screen”. If it is not there, open this page in Safari.'],
  add: ['Dodaj', 'Add'],
  ok: ['Rozumiem', 'Got it'],
  never: ['Nie pokazuj więcej', 'Don\'t show again'],
}
const tr = k => (String(getLang() || '').toLowerCase().startsWith('pl') ? T[k][0] : T[k][1])

/** What kind of device and browser this is, for the hint: null when it is not for it. */
export function installKind(nav = typeof navigator !== 'undefined' ? navigator : null, win = typeof window !== 'undefined' ? window : null) {
  if (!nav || !win) return null
  const ua = String(nav.userAgent || '')
  const ipadOs = /Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1     // iPadOS asks for the desktop site
  const iphone = /iPhone|iPod/.test(ua)
  const ipad = /iPad/.test(ua) || ipadOs
  if (!iphone && !ipad) return null
  let standalone = nav.standalone === true
  try { standalone = standalone || win.matchMedia?.('(display-mode: standalone)')?.matches || win.matchMedia?.('(display-mode: fullscreen)')?.matches } catch { /* old Safari */ }
  if (standalone) return null
  const other = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\//.test(ua) ? (/CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : 'other') : null
  return { device: ipad ? 'ipad' : 'iphone', browser: other || 'safari' }
}

function hidden(now = Date.now()) {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'never') return true
    const at = Number(v)
    return at > 0 && now - at < AGAIN_MS
  } catch { return false }
}
const remember = v => { try { localStorage.setItem(KEY, v) } catch { /* shows again next time */ } }

export const ShareGlyph = ({ size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
  <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16" /><path d="M12 3v12" /><path d="M8.5 6.5 12 3l3.5 3.5" />
</svg>
export const AddGlyph = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8.5v7M8.5 12h7" /></svg>

export default function InstallHint() {
  const user = useStore(s => s.user)
  const ready = useStore(s => s.ready)
  const [kind, setKind] = useState(null)
  useEffect(() => {
    if (MOBILE || !user || ready === false) return
    const k = installKind()
    if (!k || hidden()) return
    // Never over something else: the first-run tour's question, an open sheet. It waits its turn.
    let t = null
    const tryShow = () => {
      const busy = (useUI.getState().sheets || []).length > 0 || !!document.querySelector('.tour')
      if (busy) { t = setTimeout(tryShow, 2000); return }
      setKind(k)
    }
    t = setTimeout(tryShow, 1500)
    return () => clearTimeout(t)
  }, [!!user, ready])
  if (!kind) return null
  const close = v => { remember(v); setKind(null) }
  const ipad = kind.device === 'ipad'
  return <div className="ih-wrap" role="dialog" aria-modal="true" aria-labelledby="ih-title" data-testid="install-hint">
    <div className="ih-scrim" onClick={() => close(String(Date.now()))} />
    <div className={'ih-sheet' + (ipad ? ' ipad' : '')}>
      <div className="ih-grab" aria-hidden="true" />
      <h3 id="ih-title" className="ih-title">{tr('title')}</h3>
      <p className="ih-lead">{tr('lead')}</p>
      {kind.browser !== 'safari' && <p className="ih-other"><b>{kind.browser === 'other' ? tr('other') : kind.browser + ':'}</b> {tr('otherHow')}</p>}
      <ol className="ih-steps">
        <li><span className="ih-n">1</span><span className="ih-i"><ShareGlyph /></span><span><b>{tr('s1')}</b><br /><span className="ih-sub">{ipad ? tr('s1ipad') : tr('s1iphone')}</span></span></li>
        <li><span className="ih-n">2</span><span className="ih-i"><AddGlyph /></span><span><b>{tr('s2')}</b><br /><span className="ih-sub">{tr('s2sub')}</span></span></li>
        <li><span className="ih-n">3</span><span className="ih-i ih-add">{tr('add')}</span><span><b>{tr('s3')}</b><br /><span className="ih-sub">{tr('s3sub')}</span></span></li>
      </ol>
      <div className="ih-btns">
        <button type="button" className="btn primary" onClick={() => close(String(Date.now()))} data-testid="install-hint-ok">{tr('ok')}</button>
        <button type="button" className="btn ghost dim" onClick={() => close('never')} data-testid="install-hint-never">{tr('never')}</button>
      </div>
    </div>
    {kind.browser === 'safari' && <div className={'ih-arrow' + (ipad ? ' ipad' : '')} aria-hidden="true">
      <ShareGlyph size={26} />
      <svg width="34" height="44" viewBox="0 0 34 44" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3v36" /><path d="M5 27l12 12 12-12" /></svg>
    </div>}
  </div>
}
