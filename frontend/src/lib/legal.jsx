// Habcore Gym (local patch 0013, kl11): the Terms (Regulamin) and the Privacy policy, and the
// explicit consent to process health data (GDPR art. 9(2)(a)). The server's side is api/legal.js
// (LEGAL=on, GET /api/config -> legal.v, the profile's legal_ok, POST /api/account/legal).
//
// The documents are plain pages beside the app (frontend/public/regulamin.html, prywatnosc.html,
// terms.html, privacy.html), served at <app>/regulamin and so on without signing in. Polish is the
// binding text; every other UI language opens the English one.
import { useState } from 'react'
import { t } from './i18n.js'
import { getLang } from './i18n-core.js'
import { MOBILE } from './mobile.js'
import { appBase } from './app-base.js'
import { useStore } from '../store/useStore.js'
import { api } from './api.js'
import { Button, Check } from '../components/ui.jsx'
import BrandLogo from '../components/BrandLogo.jsx'

// The Habcore server the phone app's links point at (the web app links to its own address, so a
// new domain needs nothing here). One place to change when the server moves: the build variable
// VITE_HABCORE_SERVER, or this default.
export const HABCORE_SERVER = ((import.meta.env || {}).VITE_HABCORE_SERVER || 'https://sv.metin2sp.pl/opengym').replace(/\/+$/, '')

const isPl = () => String(getLang() || '').toLowerCase().startsWith('pl')
const base = () => {
  if (MOBILE) return HABCORE_SERVER + '/'
  try { return location.origin + appBase() } catch { return './' }
}
/** The address of a document in the reader's language (Polish, or English for everyone else). */
export function legalUrl(kind) {
  const page = kind === 'terms' ? (isPl() ? 'regulamin' : 'terms') : (isPl() ? 'prywatnosc' : 'privacy')
  return base() + page
}
export const legalOn = config => !!config?.legal?.v
/** What the server takes as an acceptance (api/legal.js legalAccepted). */
export const legalBody = (config, ok) => ok.terms && ok.health ? { v: config.legal.v, terms: true, health: true } : null

const linkStyle = { color: 'var(--acc-ink)', textDecoration: 'underline' }
export const LegalLink = ({ kind, children }) =>
  <a href={legalUrl(kind)} target="_blank" rel="noopener" style={linkStyle} onClick={e => e.stopPropagation()}>{children || (kind === 'terms' ? t('Terms') : t('Privacy policy'))}</a>

/** "Regulamin · Polityka prywatności", small, under the sign-in screen and wherever it is asked. */
export function LegalLinks({ style }) {
  return <div className="dim small" style={{ lineHeight: 1.6, ...style }} data-testid="legal-links">
    <LegalLink kind="terms" /> · <LegalLink kind="privacy" />
  </div>
}

/** The two boxes every new profile ticks: the Terms and Privacy policy, and the health data. */
export function LegalChecks({ value, onChange }) {
  const set = k => v => onChange({ ...value, [k]: v })
  const row = { display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'start', lineHeight: 1.45 }
  return <div style={{ display: 'grid', gap: 12, margin: '14px 0 4px' }} data-testid="legal-checks">
    <div style={row} data-testid="legal-terms">
      <Check checked={!!value.terms} onChange={set('terms')} label={t('I accept the Terms and the Privacy policy.')} />
      <span className="small" onClick={() => set('terms')(!value.terms)}>
        {t('I accept the Terms and the Privacy policy.')}{' '}
        (<LegalLink kind="terms" />, <LegalLink kind="privacy" />)
      </span>
    </div>
    <div style={row} data-testid="legal-health">
      <Check checked={!!value.health} onChange={set('health')} label={t('I explicitly consent to the processing of my health data.')} />
      <span className="small" onClick={() => set('health')(!value.health)}>
        {t('I explicitly consent to Habcore Gym processing my health data (workouts, body weight and measurements, heart rate, progress photos) to run the app. I can withdraw it by deleting my account.')}{' '}
        (<LegalLink kind="privacy" />)
      </span>
    </div>
  </div>
}
export const legalMissing = () => t('Tick both boxes to continue.')

/** A profile from before the documents (or before their current version) accepts once, at its
 *  next sign-in, before anything else of the app. Never while a trainer leads a client. */
export function LegalAccept() {
  const config = useStore(s => s.config)
  const setUser = useStore(s => s.setUser)
  const user = useStore(s => s.user)
  const [ok, setOk] = useState({ terms: false, health: false })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const accept = async () => {
    const legal = legalBody(config, ok)
    if (!legal) { setErr(legalMissing()); return }
    setBusy(true); setErr(null)
    try {
      const r = await api('/api/account/legal', { method: 'POST', body: JSON.stringify({ legal }) })
      setUser({ ...user, ...r.user })
    } catch (e) { setErr(e?.message || t('Something went wrong')) }
    finally { setBusy(false) }
  }
  return <div className="narrow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh' }} data-testid="legal-accept">
    <h1 style={{ margin: '0 0 10px', display: 'flex', justifyContent: 'center' }}><BrandLogo size={30} /></h1>
    <h3 style={{ textAlign: 'center' }}>{t('Terms and privacy')}</h3>
    <div className="muted small" style={{ lineHeight: 1.5 }}>{t('Habcore Gym now has Terms and a Privacy policy. Please read them and accept to keep using the app. Your data stays as it is.')}</div>
    <LegalChecks value={ok} onChange={setOk} />
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 10 }}>{err}</div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={accept} disabled={busy} data-testid="legal-accept-btn">{t('Accept and continue')}</Button>
    <LegalLinks style={{ marginTop: 14, textAlign: 'center' }} />
  </div>
}
export const needsLegal = (config, user) => legalOn(config) && !!user && user.legal_ok === false && !user.acting
