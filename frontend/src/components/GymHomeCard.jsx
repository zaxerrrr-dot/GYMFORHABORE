// Habcore Gym (local patch 0006, 0006.2): on a trainer's (or an admin's) own Home, the gym at the
// top: the clients led most recently (live ones first, with "Dołącz do treningu"), one tap to train
// as a client (lead + start a workout), "Znajdź klienta" and "Trenuj z grupą" over the gym's WHOLE
// client list (components/GymPicker.jsx), the gym's saved groups (start in one tap, edit), "Nowy
// klient" and "Wszyscy klienci". Never for clients or ordinary profiles, never while leading
// someone (the "Prowadzisz…" bar is there then).
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { nav } from '../lib/nav.js'
import { g, gErr, gymClients, fmtDay } from '../lib/gymv2.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { savedGroup } from '../lib/gym-group.js'
import { readRecent, trainAsClient, openPicker, GymGroups, START_AFTER_KEY } from './GymPicker.jsx'

export { START_AFTER_KEY }
const SHOW = 4

/** Clients in the card's order: live first, then the ones led last, then by last workout. */
export function cardOrder(clients, recent = []) {
  const rank = c => (c.live ? 0 : 1)
  const ri = c => { const i = recent.indexOf(c.id); return i < 0 ? 1e6 : i }
  return clients.filter(c => c.canLead).slice().sort((a, b) => rank(a) - rank(b) || ri(a) - ri(b) || String(b.lastWorkout || '').localeCompare(String(a.lastWorkout || '')) || a.name.localeCompare(b.name, 'pl'))
}

export default function GymHomeCard() {
  const config = useStore(s => s.config)
  const user = useStore(s => s.user)
  const gv = config?.gymv2
  const staff = !!(gv?.on && !gv.acting && (gv.role === 'trainer' || gv.role === 'admin') && user && !user.acting)
  const [list, setList] = useState(null)
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    if (!staff) return
    let gone = false, tm = null
    const load = () => gymClients().then(r => { if (!gone) setList(r.clients || []) }).catch(() => { if (!gone) setList(l => l || []) })
    load()
    tm = setInterval(() => { if (!document.hidden) load() }, 15000)
    return () => { gone = true; clearInterval(tm) }
  }, [staff])
  if (!staff) return null
  const go = async c => {
    setBusy(c.id)
    try { await trainAsClient(c) } catch (e) { setBusy(null); useUI.getState().toast(gErr(e)) }
  }
  const all = list ? cardOrder(list, readRecent()) : []
  const shown = all.slice(0, SHOW)
  let saved = null
  try { saved = savedGroup(window.localStorage) } catch { saved = null }
  return <div className="card gh-card" data-testid="gym-home-card">
    <div className="gh-head">
      <div className="gh-title"><Icon name="clipboard" /> <span>{g('gym')}</span></div>
      <button type="button" className="gh-link" onClick={() => nav('/silownia')} data-testid="gym-home-all">{g('allClients')}{list ? ` (${all.length})` : ''}</button>
    </div>
    {!list ? <div className="muted small">{g('loading')}</div> : !shown.length ? <div className="muted small">{g('noClients')}</div>
      : shown.map(c => <div key={c.id} className={'gh-row' + (c.live ? ' live' : '')} data-testid="gym-home-client" data-name={c.name}>
        <div className="gh-who">
          <div className="gh-name">{c.live && <span className="gl-dot" aria-hidden="true" />}{c.name}</div>
          <div className="gh-sub">{c.live ? g('liveInfo', c.live.name || '–', c.live.exercises, c.live.setsDone, c.live.setsTotal) : c.lastWorkout ? g('lastW', fmtDay(c.lastWorkout)) : g('never')}</div>
        </div>
        <button type="button" className={'btn sm ' + (c.live ? 'primary' : '')} disabled={!!busy} onClick={() => go(c)} data-testid={c.live ? 'gym-home-join' : 'gym-home-train'}>
          {busy === c.id ? g('switching') : c.live ? g('liveJoinWorkout') : g('trainAs')}
        </button>
      </div>)}
    {saved && <button type="button" className="btn primary" onClick={() => nav('/grupa')} data-testid="gym-home-group-resume">{g('groupResume')} ({saved.members.map(m => m.name).join(', ')})</button>}
    {list && all.length > 0 && <div className="gh-big">
      <button type="button" className="btn" onClick={() => openPicker('one')} data-testid="gym-home-find"><Icon name="magnifier" /> <span>{g('findClient')}</span></button>
      {all.length >= 2 && <button type="button" className="btn tinted" onClick={() => openPicker('group')} data-testid="gym-home-group"><Icon name="play" /> <span>{g('trainGroupBtn')}</span></button>}
    </div>}
    {list && all.length >= 2 && <GymGroups compact />}
    <div className="gh-foot">
      <button type="button" className="btn sm" onClick={() => nav('/silownia?nowy=1')} data-testid="gym-home-new"><Icon name="plusCircle" /> {g('newClient')}</button>
      <button type="button" className="btn sm ghost" onClick={() => nav('/silownia')}>{g('allClients')}</button>
      <button type="button" className="btn sm tinted" onClick={() => nav('/grafik')} data-testid="gym-home-schedule"><Icon name="calendar" /> {t('My schedule')}</button>
    </div>
  </div>
}
