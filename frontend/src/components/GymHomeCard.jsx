// Habcore Gym (local patch 0006): on a trainer's (or an admin's) own Home, the gym at the top: the
// clients led most recently (live ones first, with "Dołącz do treningu"), one tap to train as a
// client (lead + start a workout), "Nowy klient" and "Wszyscy klienci". Never for clients or
// ordinary profiles, never while leading someone (the "Prowadzisz…" bar is there then).
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { nav } from '../lib/nav.js'
import { g, gErr, gymClients, startLeading, fmtDay } from '../lib/gymv2.js'
import Icon from './Icon.jsx'
import { savedGroup, GROUP_MAX } from '../lib/gym-group.js'

const GROUP_START_KEY = 'gymv2_group_start'

const RECENT_KEY = 'gymv2_recent'
const SHOW = 4
export const START_AFTER_KEY = 'gymv2_start_after_switch'
const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] } }

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
  const [pick, setPick] = useState([])
  useEffect(() => {
    if (!staff) return
    let gone = false, tm = null
    const load = () => gymClients().then(r => { if (!gone) setList(r.clients || []) }).catch(() => { if (!gone) setList(l => l || []) })
    load()
    tm = setInterval(() => { if (!document.hidden) load() }, 15000)
    return () => { gone = true; clearInterval(tm) }
  }, [staff])
  if (!staff) return null
  const go = async (c, live) => {
    setBusy(c.id)
    try {
      // Train as the client: lead, then (after the switch) the start picker opens; a client with a
      // live workout: straight onto it.
      if (!live) { try { sessionStorage.setItem(START_AFTER_KEY, '1') } catch { /* the picker is one tap away */ } }
      await startLeading(useStore, c.id, live ? '#/workout' : '#/home')
    } catch (e) { setBusy(null); useUI.getState().toast(gErr(e)) }
  }
  const shown = list ? cardOrder(list, readRecent()).slice(0, SHOW) : []
  let saved = null
  try { saved = savedGroup(window.localStorage) } catch { saved = null }
  const toggle = c => setPick(p => p.some(x => x.id === c.id) ? p.filter(x => x.id !== c.id) : p.length >= GROUP_MAX ? p : [...p, { id: c.id, name: c.name }])
  const group = () => { try { sessionStorage.setItem(GROUP_START_KEY, JSON.stringify(pick)) } catch { /* none */ } nav('/grupa') }
  return <div className="card gh-card" data-testid="gym-home-card">
    <div className="gh-head">
      <div className="gh-title"><Icon name="clipboard" /> <span>{g('gym')}</span></div>
      <button type="button" className="gh-link" onClick={() => nav('/silownia')} data-testid="gym-home-all">{g('allClients')}</button>
    </div>
    {!list ? <div className="muted small">{g('loading')}</div> : !shown.length ? <div className="muted small">{g('noClients')}</div>
      : shown.map(c => <div key={c.id} className={'gh-row' + (c.live ? ' live' : '')} data-testid="gym-home-client" data-name={c.name}>
        <input type="checkbox" className="gh-pick" aria-label={g('groupTitle') + ': ' + c.name} checked={pick.some(x => x.id === c.id)} onChange={() => toggle(c)} data-testid="gym-home-pick" />
        <div className="gh-who">
          <div className="gh-name">{c.live && <span className="gl-dot" aria-hidden="true" />}{c.name}</div>
          <div className="gh-sub">{c.live ? g('liveInfo', c.live.name || '–', c.live.exercises, c.live.setsDone, c.live.setsTotal) : c.lastWorkout ? g('lastW', fmtDay(c.lastWorkout)) : g('never')}</div>
        </div>
        <button type="button" className={'btn sm ' + (c.live ? 'primary' : '')} disabled={!!busy} onClick={() => go(c, !!c.live)} data-testid={c.live ? 'gym-home-join' : 'gym-home-train'}>
          {busy === c.id ? g('switching') : c.live ? g('liveJoinWorkout') : g('trainAs')}
        </button>
      </div>)}
    {saved && <button type="button" className="btn primary" onClick={() => nav('/grupa')} data-testid="gym-home-group-resume">{g('groupResume')} ({saved.members.map(m => m.name).join(', ')})</button>}
    {pick.length >= 2 ? <button type="button" className="btn primary" onClick={group} data-testid="gym-home-group">{g('groupStart', pick.map(p => p.name).join(', '))}</button>
      : shown.length >= 2 && <div className="muted small">{g('groupPickHint')}</div>}
    <div className="gh-foot">
      <button type="button" className="btn sm" onClick={() => nav('/silownia?nowy=1')} data-testid="gym-home-new"><Icon name="plusCircle" /> {g('newClient')}</button>
      <button type="button" className="btn sm ghost" onClick={() => nav('/silownia')}>{g('allClients')}</button>
    </div>
  </div>
}
