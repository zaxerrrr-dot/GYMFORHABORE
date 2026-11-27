// "Lost access?" on the sign-in screen (#584): what to do when no device signs you in any more.
// In order of how often each one is the answer: a synced passkey, another device that is still
// signed in, a recovery code from the trainer (Habcore Gym, patch 0012: the server command is not
// shown to members any more; trainers make the code in the admin dashboard). "I have a code" opens the same redemption a device link has
// (Passkeys.jsx): a recovery code is redeemed exactly like one. The phone app cannot make a
// passkey for the server, so there the code goes into a browser first and the app is paired again.
import { useState } from 'react'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { appRecover } from '../lib/remote.js'
import { askAddDeviceData } from '../sheets.jsx'
import { MIN_PASSWORD, passwordError } from './PasswordAuth.jsx'
import { t } from '../lib/i18n.js'
import { MOBILE } from '../lib/mobile.js'
import { openDeviceLinkRedeem } from './Passkeys.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// Habcore Gym (kl12): in the phone app a code sets a new password (POST /api/app/recover) and signs
// the app in; there is no passkey to make there.
const APP_STEPS = () => [
  ['person', t('Ask your trainer'), t('Your trainer at Habcore Gym can make you a recovery code. Enter it with “I have a code” and pick a new password.')],
  ['qr', t('Another device still signed in?'), t('On that one, open Settings → Account → Add another device, then enter its code here with “I have a code”.')],
]

function AppCodeForm({ close }) {
  const [code, setCode] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const submit = async ev => {
    ev.preventDefault()
    if (busy) return
    const bad = !code.trim() ? t('Enter the code.')
      : [...next].length < MIN_PASSWORD ? t('Use at least {0} characters.', MIN_PASSWORD)
      : next !== again ? t('The two passwords are not the same.') : null
    if (bad) { setErr(bad); return }
    setBusy(true); setErr(null)
    try {
      const u = await appRecover(code.trim(), next)
      close()
      await useStore.getState().appSignedIn(u, askAddDeviceData)
      useUI.getState().toast(t('Welcome back, {0}', u.name))
    } catch (e) { setErr(e?.code === 'link-invalid' ? t('That code is wrong, used or expired.') : passwordError(e)) }
    finally { setBusy(false) }
  }
  return <form onSubmit={submit} noValidate data-testid="app-recover">
    <input className="input" placeholder={t('Code')} value={code} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
      onChange={e => setCode(e.target.value.toUpperCase())} style={{ letterSpacing: '.14em', fontWeight: 600, textAlign: 'center' }} />
    <div style={{ height: 10 }} />
    <input className="input" type="password" name="new-password" autoComplete="new-password" placeholder={t('New password')} value={next} onChange={e => setNext(e.target.value)} />
    <div style={{ height: 10 }} />
    <input className="input" type="password" autoComplete="new-password" placeholder={t('New password again')} value={again} onChange={e => setAgain(e.target.value)} />
    {err && <div className="small" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}>{err}</div>}
    <div style={{ height: 12 }} />
    <Button variant="primary" type="submit" disabled={busy}>{t('Set the password and sign in')}</Button>
  </form>
}

const STEPS = () => [
  ['fingerprint', t('Your passkey may be synced'), t('Passkeys kept in iCloud Keychain, Google Password Manager or a password manager are on your other devices too. Try “Sign in with passkey” there.')],
  ['qr', t('Another device still signed in?'), t('On that one, open Settings → Account → Add another device, then enter its code here with “I have a code”.')],
  ['person', t('Ask your trainer'), t('Your trainer at Habcore Gym can make you a recovery code. Enter it with “I have a code”, and this device gets a new passkey.')],
]

export function LostAccessSheet({ close }) {
  const [form, setForm] = useState(false)
  if (MOBILE) return <>
    <h3>{t('Lost access?')}</h3>
    <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.5 }}>{t('No panic: your training is safe on the server. One of these gets you back in.')}</div>
    <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
      {APP_STEPS().map(([icon, title, body]) => <div key={title} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--acc-ink)', fontSize: 'var(--fs-title3)', marginTop: 1 }}><Icon name={icon} /></span>
        <div><div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div><div className="small muted" style={{ lineHeight: 1.45, overflowWrap: 'anywhere' }}>{body}</div></div>
      </div>)}
    </div>
    {form ? <AppCodeForm close={close} /> : <Button variant="primary" icon="qr" onClick={() => setForm(true)} data-testid="lost-have-code">{t('I have a code')}</Button>}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Done')}</Button>
  </>
  return <>
    <h3>{t('Lost access?')}</h3>
    <div className="muted small" style={{ marginBottom: 14, lineHeight: 1.5 }}>{t('No panic: your training is safe on the server. One of these gets you back in.')}</div>
    <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
      {STEPS().map(([icon, title, body]) => <div key={title} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--acc-ink)', fontSize: 'var(--fs-title3)', marginTop: 1 }}><Icon name={icon} /></span>
        <div><div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div><div className="small muted" style={{ lineHeight: 1.45, overflowWrap: 'anywhere' }}>{body}</div></div>
      </div>)}
    </div>
    <Button variant="primary" icon="qr" onClick={() => { close(); openDeviceLinkRedeem() }}>{t('I have a code')}</Button><div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>{t('Done')}</Button>
  </>
}

export const openLostAccess = () => useUI.getState().openSheet(close => <LostAccessSheet close={close} />)
