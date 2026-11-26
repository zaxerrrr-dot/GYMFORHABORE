// Habcore Gym (local patch 0006.2): picking clients from the gym's WHOLE list, and the gym's saved
// groups. One sheet for three jobs:
//   'one'   – "Trenuj jako klient": search, one tap on a name = lead that client and start;
//   'group' – "Trenuj z grupą": tick 2–5 people (counter), start them, or "Zapisz jako grupę";
//   'edit'  – a saved group: its name, who is in it, delete it.
// At the top of the list: who trains right now and whom this device led last; then everyone A–Z.
// Groups belong to the whole gym (every trainer sees them; api/gymv2/index.js, /api/gymv2/groups).
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { nav } from '../lib/nav.js'
import { confirmSheet } from '../sheets.jsx'
import { g, gErr, gymClients, gymGroups, saveGroup, deleteGroup, startLeading, fmtDay, rememberLed } from '../lib/gymv2.js'
import { GROUP_MAX } from '../lib/gym-group.js'
import { Button, SearchField, TextField } from './ui.jsx'
import Icon from './Icon.jsx'

export const GROUP_MIN = 2
export const GROUP_START_KEY = 'gymv2_group_start'
export const START_AFTER_KEY = 'gymv2_start_after_switch'
const RECENT_KEY = 'gymv2_recent'
const toast = m => useUI.getState().toast(m)
// A group saved, changed or deleted anywhere on this device: every list of groups reads again.
export const GROUPS_EVENT = 'gymv2-groups'
export const groupsChanged = () => { try { window.dispatchEvent(new Event(GROUPS_EVENT)) } catch { /* the 30 s refresh then */ } }
export const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] } }

/** A name folded for searching: no case, no Polish marks ("Łukasz" ~ "lukasz"). */
export const fold = s => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').trim()
/** The clients whose name has every word of `q` in it (any order). */
export function filterClients(list, q) {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return list
  return list.filter(c => { const n = fold(c.name); return words.every(w => n.includes(w)) })
}
/** The picker's two parts: `top` = training now, then led last (newest first); `rest` = A–Z. */
export function pickerOrder(clients, recent = []) {
  const can = clients.filter(c => c.canLead)
  const ri = c => { const i = recent.indexOf(c.id); return i < 0 ? 1e6 : i }
  const top = can.filter(c => c.live || recent.includes(c.id))
    .sort((a, b) => (a.live ? 0 : 1) - (b.live ? 0 : 1) || ri(a) - ri(b) || a.name.localeCompare(b.name, 'pl'))
  const rest = can.filter(c => !top.includes(c)).sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  return { top, rest }
}
/** The same people, in any order. */
export const sameMembers = (a, b) => a.length === b.length && a.every(id => b.includes(id))
/** A name for a new group from its people: "Bartek + Sylwek". */
export const groupNameOf = people => people.map(p => p.name).join(' + ').slice(0, 40)

/** Starts a group workout of these clients ([{ id, name }]) on #/grupa. */
export function startGroup(people) {
  for (const p of people.slice().reverse()) rememberLed(p.id)
  try { sessionStorage.setItem(GROUP_START_KEY, JSON.stringify(people.slice(0, GROUP_MAX).map(p => ({ id: p.id, name: p.name })))) } catch { /* none */ }
  useUI.getState().closeAll?.()
  nav('/grupa')
}
/** Train as one client: lead, then the start picker (or straight onto a live workout). */
export async function trainAsClient(c) {
  const live = !!c.live
  if (!live) { try { sessionStorage.setItem(START_AFTER_KEY, '1') } catch { /* the picker is one tap away */ } }
  await startLeading(useStore, c.id, live ? '#/workout' : '#/home')
}

function PersonRow({ c, mode, on, full, busy, onTap }) {
  const sub = c.live ? g('liveInfo', c.live.name || '–', c.live.exercises, c.live.setsDone, c.live.setsTotal)
    : c.lastWorkout ? g('lastW', fmtDay(c.lastWorkout)) : g('never')
  if (mode === 'one') {
    return <button type="button" className={'gp-row tap' + (c.live ? ' live' : '')} disabled={!!busy} onClick={() => onTap(c)} data-testid="gp-person" data-name={c.name}>
      <span className="gp-who"><span className="gp-name">{c.live && <span className="gl-dot" aria-hidden="true" />}{c.name}</span><span className="gp-sub">{sub}</span></span>
      <span className="gp-go">{busy === c.id ? g('switching') : c.live ? g('liveJoinShort') : g('trainShort')}<Icon name="chevronRight" /></span>
    </button>
  }
  return <label className={'gp-row' + (on ? ' on' : '') + (c.live ? ' live' : '') + (!on && full ? ' full' : '')} data-testid="gp-person" data-name={c.name}>
    <input type="checkbox" className="gp-box" checked={on} disabled={!on && full} onChange={() => onTap(c)} data-testid="gp-pick" aria-label={c.name} />
    <span className="gp-who"><span className="gp-name">{c.live && <span className="gl-dot" aria-hidden="true" />}{c.name}</span><span className="gp-sub">{sub}</span></span>
  </label>
}

/** The sheet. `group` (mode 'edit'): the saved group; `preset`: people ticked at the start. */
export function GymPicker({ mode = 'group', group = null, preset = [], close, onChanged }) {
  const [clients, setClients] = useState(null)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(() => (group ? group.members : preset).map(p => ({ id: p.id, name: p.name })))
  const [naming, setNaming] = useState(mode === 'edit')
  const [name, setName] = useState(group?.name || '')
  const [busy, setBusy] = useState(null)
  const recent = useRef(readRecent()).current
  useEffect(() => {
    let gone = false
    gymClients().then(r => { if (!gone) setClients(r.clients || []) }).catch(e => { if (!gone) { setClients([]); toast(gErr(e)) } })
    return () => { gone = true }
  }, [])
  const { top, rest } = pickerOrder(clients || [], recent)
  const topF = filterClients(top, q), restF = filterClients(rest, q)
  const full = picked.length >= GROUP_MAX
  const isOn = c => picked.some(p => p.id === c.id)
  const tap = async c => {
    if (mode === 'one') {
      setBusy(c.id)
      try { await trainAsClient(c) } catch (e) { setBusy(null); toast(gErr(e)) }
      return
    }
    setPicked(p => p.some(x => x.id === c.id) ? p.filter(x => x.id !== c.id) : p.length >= GROUP_MAX ? (toast(g('pickMax')), p) : [...p, { id: c.id, name: c.name }])
  }
  const enough = picked.length >= GROUP_MIN
  const save = async () => {
    const n = (name.trim() || groupNameOf(picked)).slice(0, 40)
    setBusy('save')
    try {
      const r = await saveGroup({ id: group?.id, name: n, members: picked.map(p => p.id) })
      toast(g('groupSaved', r.group.name))
      groupsChanged()
      onChanged?.()
      if (mode === 'edit') close()
      else { setNaming(false); setName('') }
      return r.group
    } catch (e) { toast(gErr(e)) } finally { setBusy(null) }
  }
  const remove = () => {
    close()
    confirmSheet({
      title: g('groupDeleteQ', group.name), message: g('groupDeleteMsg'), confirmText: g('groupDelete'), danger: true,
      onConfirm: () => deleteGroup(group.id).then(() => { toast(g('groupDeleted')); groupsChanged(); onChanged?.() }).catch(e => toast(gErr(e)))
    })
  }
  const title = mode === 'one' ? g('pickOneTitle') : mode === 'edit' ? g('groupEditTitle') : g('pickGroupTitle')
  const list = (rows, head, tid) => rows.length > 0 && <div className="gp-part" data-testid={tid}>
    <div className="gp-head">{head}</div>
    {rows.map(c => <PersonRow key={c.id} c={c} mode={mode} on={isOn(c)} full={full} busy={busy} onTap={tap} />)}
  </div>
  return <div className="gp" data-testid={'gym-picker-' + mode}>
    <h3>{title}</h3>
    {mode === 'edit' && <div className="gp-name-f">
      <label className="small dim" htmlFor="gp-gname">{g('groupName')}</label>
      <TextField id="gp-gname" data-testid="gp-group-name" value={name} maxLength={40} placeholder={g('groupNameHint')} onChange={e => setName(e.target.value)} />
    </div>}
    <div className="picker-search">
      <SearchField value={q} onChange={e => setQ(e.target.value)} onClear={() => setQ('')} placeholder={g('searchName')} aria-label={g('searchName')} data-testid="gp-search" />
    </div>
    {mode !== 'one' && <div className="gp-count" role="status" data-testid="gp-count">
      <strong>{g('pickedN', picked.length)}</strong>
      <span className="dim">{full ? g('pickMax') : enough ? g('pickRange') : g('pickMin')}</span>
    </div>}
    {mode !== 'one' && picked.length > 0 && <div className="gp-chips">{picked.map(p => <button key={p.id} type="button" className="gp-chip" onClick={() => setPicked(x => x.filter(y => y.id !== p.id))} aria-label={g('remove') + ': ' + p.name}>{p.name} <Icon name="xmark" /></button>)}</div>}
    <div className="gp-list">
      {!clients ? <p className="muted">{g('loading')}</p>
        : !top.length && !rest.length ? <p className="muted">{g('noClients')}</p>
        : !topF.length && !restF.length ? <p className="muted" data-testid="gp-none">{g('pickNone', q)}</p>
        : <>{list(topF, g('pickTop'), 'gp-top')}{list(restF, g('pickAll'), 'gp-rest')}</>}
    </div>
    <div className="gp-foot">
      {mode === 'group' && <>
        <Button variant="primary" icon="play" disabled={!enough || !!busy} onClick={() => startGroup(picked)} data-testid="gp-start">{g('groupGo', picked.length)}</Button>
        {naming ? <div className="gp-name-f">
          <label className="small dim" htmlFor="gp-gname">{g('groupName')}</label>
          <TextField id="gp-gname" data-testid="gp-group-name" autoFocus value={name} maxLength={40} placeholder={groupNameOf(picked) || g('groupNameHint')} onChange={e => setName(e.target.value)} />
          <Button icon="checkCircle" disabled={!enough || !!busy} onClick={save} data-testid="gp-save-confirm">{g('groupSaveBtn')}</Button>
        </div>
          : <Button icon="plusCircle" disabled={!enough || !!busy} onClick={() => setNaming(true)} data-testid="gp-save">{g('saveAsGroup')}</Button>}
      </>}
      {mode === 'edit' && <>
        <Button variant="primary" icon="checkCircle" disabled={!enough || !name.trim() || !!busy} onClick={save} data-testid="gp-save-confirm">{g('groupSaveChanges')}</Button>
        <Button variant="danger" icon="trash" disabled={!!busy} onClick={remove} data-testid="gp-delete">{g('groupDelete')}</Button>
      </>}
      <Button variant="ghost" className="dim" onClick={close}>{g('cancel')}</Button>
    </div>
  </div>
}

export const openPicker = (mode, opts = {}) => useUI.getState().openSheet(close => <GymPicker mode={mode} {...opts} close={close} />)

/** The gym's saved groups: start one in one tap, or edit it. Home's gym card and #/silownia. */
export function GymGroups({ compact = false }) {
  const [groups, setGroups] = useState(null)
  const load = () => gymGroups().then(r => setGroups(r.groups || [])).catch(() => setGroups(l => l || []))
  useEffect(() => {
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 30000)
    window.addEventListener(GROUPS_EVENT, load)
    return () => { clearInterval(t); window.removeEventListener(GROUPS_EVENT, load) }
  }, [])
  if (!groups) return null
  if (!groups.length) return compact ? null : <p className="muted small" data-testid="gym-groups-none">{g('noGroups')}</p>
  return <div className="gp-groups" data-testid="gym-groups">
    {compact && <div className="gp-head">{g('groups')}</div>}
    {groups.map(gr => {
      const can = gr.members.length >= GROUP_MIN
      return <div key={gr.id} className="gp-group" data-testid="gym-group" data-name={gr.name}>
        <div className="gp-who"><span className="gp-name">{gr.name}</span>
          <span className="gp-sub">{gr.members.map(m => m.name).join(', ') || '–'}{can ? '' : ' · ' + g('groupTooSmall')}</span></div>
        <div className="gp-group-b">
          <button type="button" className="btn sm primary" disabled={!can} onClick={() => startGroup(gr.members)} data-testid="gym-group-start">{g('trainGroupBtn')}</button>
          <button type="button" className="btn sm" onClick={() => openPicker('edit', { group: gr, onChanged: load })} data-testid="gym-group-edit">{g('groupEdit')}</button>
        </div>
      </div>
    })}
  </div>
}
