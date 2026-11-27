// Gym mode v2 (local patch 0003): #/zaproszenie?c=… — the client takes over the account a trainer
// made for them: a password (and an e-mail if they like), and the account is theirs with its whole
// history. Shown whether or not someone is signed in on this device.
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { Section, Button, TextField, Check } from '../components/ui.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import { g, gErr, fmtDay, lookInvite, claimInvite } from '../lib/gymv2.js'
import { LegalChecks, legalOn, legalBody, legalMissing } from '../lib/legal.jsx'

export default function GymClaim() {
  const loc = useLocation()
  const c = new URLSearchParams(loc.search).get('c') || ''
  const user = useStore(s => s.user)
  const [inv, setInv] = useState(null)
  const [bad, setBad] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [email, setEmail] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  // Habcore Gym (patch 0013): the client accepts the Terms and the health-data consent here.
  const config = useStore(s => s.config)
  const asks = legalOn(config)
  const [legal, setLegal] = useState({ terms: false, health: false })
  useEffect(() => { if (!c) { setBad(true); return } lookInvite(c).then(setInv).catch(() => setBad(true)) }, [c])
  const pl = g('gym') === 'Siłownia'
  const submit = async e => {
    e?.preventDefault?.()
    if (!ok || busy) return
    if (pw !== pw2) { setErr(g('pwMismatch')); return }
    if (asks && !legalBody(config, legal)) { setErr(legalMissing()); return }
    setBusy(true); setErr(null)
    try {
      await claimInvite(c, pw, email.trim() || undefined, { v: inv.consent.v, hash: inv.consent.hash }, asks ? legalBody(config, legal) : null)
      // The session cookie is the client's now: the app starts again as that account.
      try { sessionStorage.setItem('gymv2_welcome', inv.name) } catch { /* only the greeting */ }
      location.hash = '#/home'
      location.reload()
    } catch (e2) { setBusy(false); setErr(gErr(e2)) }
  }
  return <div className="narrow gv gv-claim">
    <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 12px' }}><BrandLogo /></div>
    {bad && <div className="card" role="alert" data-testid="claim-bad">{g('linkBad')}</div>}
    {!bad && !inv && <p className="muted">{g('loading')}</p>}
    {inv && <>
      <h1 style={{ fontSize: 24, margin: '8px 0' }}>{g('claimTitle', inv.gym)}</h1>
      <p style={{ lineHeight: 1.5 }}>{g('claimLead', inv.name)}</p>
      <p className="dim small">{g('login', inv.name)} · {g('validTo', fmtDay(new Date(inv.expires).toISOString()))}</p>
      {user && <div className="card">{g('signedInAs', user.name)}</div>}
      <div className="gv-claim-form">
        <input type="text" name="username" autoComplete="username" value={inv.name} readOnly hidden />
        <TextField type="password" name="new-password" autoComplete="new-password" placeholder={g('pw')} value={pw} onChange={e => setPw(e.target.value)} data-testid="claim-pw" />
        <TextField type="password" autoComplete="new-password" placeholder={g('pw2')} value={pw2} onChange={e => setPw2(e.target.value)} data-testid="claim-pw2" />
        <TextField type="email" autoComplete="email" placeholder={g('email')} value={email} onChange={e => setEmail(e.target.value)} data-testid="claim-email" />
        <Section title={g('consentHead')}>
          <div className="gv-consent"><p>{pl ? inv.consent.pl : inv.consent.en}</p></div>
        </Section>
        {asks && <LegalChecks value={legal} onChange={setLegal} />}
        <div className="gv-agree" data-testid="claim-agree"><Check checked={ok} onChange={setOk} label={g('agree')} /> <span onClick={() => setOk(!ok)}>{g('agree')}</span></div>
        {err && <p role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
        <Button variant="primary" type="button" onClick={submit} disabled={busy || !ok || !pw || !pw2}>{g('claim')}</Button>
      </div>
    </>}
  </div>
}
