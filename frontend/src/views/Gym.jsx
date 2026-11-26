// Gym mode v2 (local patch 0003, api/gymv2/index.js): Settings → Account → Gym, and #/silownia.
//   trainer / admin: every client of the gym with "Lead as client", a new client account, the
//                    invite link for an account a trainer made, the change log, the gym code;
//   admin:           also who is a trainer, and the gym's name;
//   member:          which gym, who the trainers are, leave the gym;
//   anyone else:     join with the gym's code, after reading what the consent means.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { confirmSheet } from '../sheets.jsx'
import { Section, Row, Button, TextField, Switch, Check } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { pathBefore } from '../lib/nav.js'
import {
  g, gErr, fmtDay, fmtWhen, gymStatus, gymClients, createClient, makeInvite, gymCode, newGymCode, joinGym, leaveGym,
  gymUsers, setTrainer, setGymName, clientLog, inviteLink, joinLink, startLeading, logLine
} from '../lib/gymv2.js'

const toast = m => useUI.getState().toast(m)
const openSheet = f => useUI.getState().openSheet(f)
const isPl = () => g('gym') === 'Siłownia'

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(g('copied')) }
  catch { window.prompt(g('copy'), text) }
}
async function shareText(text) {
  if (navigator.share) { try { await navigator.share({ text }); return } catch { /* closed */ } }
  copyText(text)
}

function LinkSheet({ title, lead, link, close }) {
  return <>
    <h3>{title}</h3>
    <p className="muted" style={{ lineHeight: 1.5 }}>{lead}</p>
    <div className="card" style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: 13, userSelect: 'all' }} data-testid="gym-link">{link}</div>
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <Button variant="primary" icon="share" onClick={() => shareText(link)}>{g('share')}</Button>
      <Button icon="link" onClick={() => copyText(link)}>{g('copy')}</Button>
    </div>
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>OK</Button>
  </>
}

function LogSheet({ client, close }) {
  const [log, setLog] = useState(null)
  useEffect(() => { clientLog(client.id).then(r => setLog(r.log || [])).catch(e => { setLog([]); toast(gErr(e)) }) }, [client.id])
  return <>
    <h3>{g('history')}: {client.name}</h3>
    {!log ? <p className="muted">{g('loading')}</p> : !log.length ? <p className="muted">{g('noHistory')}</p>
      : <div className="gv-log">{log.map((e, i) => <div key={i} className="gv-log-row"><span className="dim small">{fmtWhen(e.at)}</span><span>{logLine(e)}</span></div>)}</div>}
    <div style={{ height: 8 }} />
    <Button variant="ghost" className="dim" onClick={close}>OK</Button>
  </>
}

function ClientRow({ c, onInvite, onLog }) {
  const [busy, setBusy] = useState(false)
  const lead = async () => {
    setBusy(true)
    try { await startLeading(useStore, c.id) } catch (e) { setBusy(false); toast(gErr(e)) }
  }
  const sub = [
    c.virtual ? g('virtual') : g('own'),
    c.workouts ? g('workoutsN', c.workouts) : g('never'),
    c.lastWorkout ? g('lastW', fmtDay(c.lastWorkout)) : null,
    c.virtual && c.invite ? g('inviteOpen', fmtDay(new Date(c.invite.expires).toISOString())) : null
  ].filter(Boolean).join(' · ')
  return <div className="gv-client" data-testid="gym-client" data-name={c.name}>
    <Row icon="person" iconTint={c.virtual ? 'var(--orange)' : 'var(--blue)'} title={c.name} subtitle={sub} />
    <div className="gv-actions">
      <Button variant="primary" size="sm" icon="play" disabled={busy || !c.canLead} onClick={lead}>{busy ? g('switching') : g('lead')}</Button>
      {c.virtual && <Button size="sm" icon="envelope" onClick={() => onInvite(c)}>{g('invite')}</Button>}
      <Button size="sm" icon="history" onClick={() => onLog(c)}>{g('history')}</Button>
    </div>
  </div>
}

function StaffView({ st, reload }) {
  const [clients, setClients] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState(undefined)
  const load = () => gymClients().then(r => setClients(r.clients || [])).catch(e => toast(gErr(e)))
  useEffect(() => { load(); gymCode().then(r => setCode(r.code)).catch(() => setCode(null)) }, [])
  const add = async e => {
    e?.preventDefault?.()
    const n = name.trim(); if (!n) return
    setBusy(true)
    try { const r = await createClient(n); setName(''); toast(g('created', r.client.name)); load() }
    catch (err) { toast(gErr(err)) }
    finally { setBusy(false) }
  }
  const invite = async c => {
    try {
      const r = await makeInvite(c.id)
      openSheet(close => <LinkSheet title={g('invite') + ': ' + c.name} lead={g('inviteHow', fmtDay(new Date(r.expires).toISOString()))} link={inviteLink(r.token)} close={close} />)
      load()
    } catch (e) { toast(gErr(e)) }
  }
  const remake = () => confirmSheet({
    title: g('newCode'), message: g('codeFoot'), confirmText: g('makeCode'),
    onConfirm: () => newGymCode().then(r => setCode(r.code)).catch(e => toast(gErr(e)))
  })
  return <>
    <Section title={g('clients') + (clients ? ` (${clients.length})` : '')} footer={g('clientsFoot')}>
      {!clients ? <Row title={g('loading')} /> : !clients.length ? <Row title={g('noClients')} />
        : clients.map(c => <ClientRow key={c.id} c={c} onInvite={invite} onLog={c => openSheet(close => <LogSheet client={c} close={close} />)} />)}
    </Section>
    <Section title={g('newClient')} footer={g('newClientFoot')}>
      <form onSubmit={add} className="gv-form">
        <TextField data-testid="gym-new-name" placeholder={g('clientName')} value={name} maxLength={40} onChange={e => setName(e.target.value)} />
        <Button variant="primary" icon="plus" type="submit" disabled={busy || !name.trim()}>{g('create')}</Button>
      </form>
    </Section>
    <Section title={g('code')} footer={g('codeFoot')}>
      {code === undefined ? <Row title={g('loading')} /> : code
        ? <>
          <Row icon="key" iconTint="var(--indigo)" title={<span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '.06em' }} data-testid="gym-code">{code.code}</span>} subtitle={g('validTo', fmtDay(new Date(code.expires).toISOString()))} />
          <Row icon="link" iconTint="var(--blue)" title={g('codeLink')} accessory="chevron" onClick={() => openSheet(close => <LinkSheet title={g('codeLink')} lead={g('codeFoot')} link={joinLink(code.code)} close={close} />)} />
          <Row icon="reset" iconTint="var(--orange)" title={g('newCode')} onClick={remake} />
        </>
        : <Row icon="key" iconTint="var(--indigo)" title={g('noCode')} subtitle={g('makeCode')} accessory="chevron" onClick={() => newGymCode().then(r => setCode(r.code)).catch(e => toast(gErr(e)))} />}
    </Section>
    {st.admin && <AdminSection st={st} reload={reload} />}
  </>
}

function AdminSection({ st, reload }) {
  const [users, setUsers] = useState(null)
  const [gymName, setGName] = useState(st.name || '')
  const me = useStore(s => s.user)
  const load = () => gymUsers().then(r => setUsers(r.users || [])).catch(e => toast(gErr(e)))
  useEffect(() => { load() }, [])
  const flip = async (u, on) => {
    try { await setTrainer(u.id, on); load(); reload() } catch (e) { toast(gErr(e)) }
  }
  const people = (users || []).filter(u => !u.virtual && !u.disabled)
  return <>
    <Section title={g('trainers')} footer={g('trainersFoot')}>
      {!users ? <Row title={g('loading')} /> : people.map(u => <Row key={u.id} icon={u.admin ? 'crown' : u.trainer ? 'clipboard' : 'person'}
        iconTint={u.admin ? 'var(--indigo)' : u.trainer ? 'var(--orange)' : 'var(--label-3)'} title={u.name}
        subtitle={[u.id === me?.id ? g('you') : null, u.admin ? g('isAdmin') : null, u.member ? g('isClient') : null].filter(Boolean).join(' · ') || null}>
        {!u.admin && <span data-testid={'trainer-switch-' + u.name}><Switch checked={u.trainer} onChange={v => flip(u, v)} aria-label={g('isTrainer') + ': ' + u.name} /></span>}
      </Row>)}
    </Section>
    <Section title={g('gymName')}>
      <form className="gv-form" onSubmit={e => { e.preventDefault(); setGymName(gymName).then(() => { toast(g('saved')); reload() }).catch(err => toast(gErr(err))) }}>
        <TextField value={gymName} maxLength={60} onChange={e => setGName(e.target.value)} />
        <Button type="submit" disabled={!gymName.trim()}>{g('save')}</Button>
      </form>
    </Section>
  </>
}

function MemberView({ st, reload }) {
  const leave = () => confirmSheet({
    title: g('leaveQ'), message: g('leaveMsg'), confirmText: g('leave'), danger: true,
    onConfirm: () => leaveGym().then(() => { toast(g('left')); reload() }).catch(e => toast(gErr(e)))
  })
  return <>
    <Section title={g('memberTitle', st.name)} footer={isPl() ? st.consent.pl : st.consent.en}>
      <Row icon="checkCircle" iconTint="var(--green)" title={g('memberSub')} subtitle={st.member?.since ? fmtDay(st.member.since) : null} />
      <Row icon="clipboard" iconTint="var(--orange)" title={g('trainersList', st.trainers.map(t => t.name).join(', ') || '–')} />
    </Section>
    <Section>
      <Row icon="signOut" iconTint="var(--red)" title={g('leave')} danger onClick={leave} />
    </Section>
  </>
}

function JoinView({ st, reload, preset }) {
  const [code, setCode] = useState(preset || '')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const join = async e => {
    e?.preventDefault?.()
    if (!ok || busy) return
    setBusy(true)
    try { await joinGym(code.trim(), { v: st.consent.v, hash: st.consent.hash }); toast(g('joined')); reload() }
    catch (err) { toast(gErr(err)) }
    finally { setBusy(false) }
  }
  return <Section title={g('joinTitle') + ': ' + st.name}>
    <div className="gv-consent">
      <strong>{g('consentHead')}</strong>
      <p data-testid="gym-consent">{isPl() ? st.consent.pl : st.consent.en}</p>
      {st.trainers.length > 0 && <p className="dim small">{g('trainersList', st.trainers.map(t => t.name).join(', '))}</p>}
    </div>
    <div className="gv-form gv-join">
      <TextField data-testid="gym-join-code" placeholder={g('joinCode')} value={code} autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={e => setCode(e.target.value)} />
      <div className="gv-agree" data-testid="gym-agree"><Check checked={ok} onChange={setOk} label={g('agree')} /> <span onClick={() => setOk(!ok)}>{g('agree')}</span></div>
      <Button variant="primary" type="button" onClick={join} disabled={busy || !ok || !code.trim()}>{g('join')}</Button>
    </div>
  </Section>
}

export default function Gym() {
  const nav = useNavigate()
  const loc = useLocation()
  const [st, setSt] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => gymStatus().then(s => { setSt(s); setErr(null) }).catch(e => setErr(gErr(e)))
  useEffect(() => { load() }, [])
  const preset = new URLSearchParams(loc.search).get('kod') || ''
  const hasBack = (window.history.state?.idx || 0) > 0
  return <div className="narrow gv">
    <div className="hdr">
      <button className="iconbtn" data-back={(hasBack ? pathBefore() : null) || '/settings/account'}
        onClick={() => hasBack ? nav(-1) : nav('/settings/account', { replace: true })} aria-label={g('back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginInlineStart: 12 }}><h1 style={{ margin: 0 }}>{st?.name || g('gym')}</h1>
        <div className="sub">{st ? (st.role === 'admin' ? 'Admin' : st.role === 'trainer' ? g('isTrainer') : st.role === 'member' ? g('isClient') : g('joinTitle')) : g('loading')}</div></div>
      <button className="iconbtn" onClick={load} aria-label="refresh"><Icon name="reset" /></button>
    </div>
    {err && <div className="card" role="alert">{err}</div>}
    {st?.acting && <div className="card">{g('actingNoAccount')}</div>}
    {st && !st.acting && (st.role === 'admin' || st.role === 'trainer') && <StaffView st={st} reload={load} />}
    {st && !st.acting && st.role === 'member' && <MemberView st={st} reload={load} />}
    {st && !st.acting && st.role === 'none' && <JoinView st={st} reload={load} preset={preset} />}
  </div>
}
