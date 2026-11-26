// Group training (local patch 0006): #/grupa. One trainer, 2-5 clients, a running workout each (on
// the client's own account, live: lib/gym-group.js). Tabs with the names switch between them in one
// tap; an exercise can go to several people at once (each from their own history, their weights);
// after a set, "Next: <name>" goes round the group; a rest clock per person; finish per person or all.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exercisePicker, confirmSheet } from '../sheets.jsx'
import { EXIDX } from '../lib/exercises.js'
import { exerciseNameText } from '../lib/format.js'
import { g, gErr } from '../lib/gymv2.js'
import { theGroup } from '../lib/gym-group-app.js'
import { savedGroup } from '../lib/gym-group.js'
import { nav } from '../lib/nav.js'
import Icon from '../components/Icon.jsx'

export const GROUP_START_KEY = 'gymv2_group_start'
const toast = m => useUI.getState().toast(m)
const exName = id => (EXIDX[id] ? exerciseNameText(EXIDX[id]) : String(id))
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

function Stepper({ label, value, step, min = 0, onSet, unit }) {
  return <span className="gg-step">
    <button type="button" aria-label={`${label}: ${g('less')}`} onClick={() => onSet(Math.max(min, Math.round((num(value) - step) * 100) / 100))}>−</button>
    <span className="gg-val" aria-label={label}>{value == null ? '–' : value}{unit ? <small> {unit}</small> : null}</span>
    <button type="button" aria-label={`${label}: ${g('more')}`} onClick={() => onSet(Math.round((num(value) + step) * 100) / 100)}>+</button>
  </span>
}

function MemberPanel({ G, m, members, onNext, now }) {
  const A = G.workoutOf(m)
  const [also, setAlso] = useState([])
  if (!A) return <p className="muted">{g('loading')}</p>
  const others = members.filter(x => x.id !== m.id && !x.ended)
  const restSec = num(m.doc?.restSec) || 90
  const tick = (i, j) => {
    let nowDone = false
    G.change(m.id, W => { const s = W.entries[i].sets[j]; s.done = !s.done; nowDone = s.done; if (s.done) s.at = Date.now(); else delete s.at; W.cur = i })
    if (nowDone) G.rest(m.id, restSec)
  }
  const add = () => exercisePicker(ex => {
    G.addExercise(ex.id, [m.id, ...also.filter(id => others.some(o => o.id === id))])
    toast(`„${exName(ex.id)}” → ${[m.name, ...others.filter(o => also.includes(o.id)).map(o => o.name)].join(', ')}`)
  })
  const finishOne = async () => {
    try { const how = await G.finish(m.id); toast(g(how === 'phone' ? 'savedPhone' : 'savedServer', m.name)) } catch (e) { toast(gErr(e)) }
  }
  const resting = m.rest && m.rest.until > now
  return <div className="gg-panel" data-testid="group-panel" data-name={m.name}>
    <div className="gg-meta">
      <span className={'gg-phone' + (G.clientHere(m) ? ' on' : '')}>{G.clientHere(m) ? g('phoneHere') : g('phoneAway')}</span>
      {m.rest && <span className={'gg-rest' + (resting ? '' : ' over')} data-testid="group-rest">{resting ? g('restLeft', mmss(m.rest.until - now)) : g('restOver')}</span>}
    </div>
    {!A.entries.length && <p className="muted">{g('emptyWorkout')}</p>}
    {A.entries.map((e, i) => {
      const last = G.lastOf(m.id, e.id)
      return <div key={e.lid || i} className="card gg-ex" data-testid="group-ex" data-ex={e.id}>
        <div className="gg-ex-h">
          <div><div className="gg-ex-n">{exName(e.id)}</div><div className="gg-ex-s">{last ? g('lastHint', last.w, last.r ?? '–') : g('firstTime')}</div></div>
          <button type="button" className="iconbtn" aria-label={`${m.name}: ${g('removeEx')}: ${exName(e.id)}`} onClick={() => G.change(m.id, W => { W.entries.splice(i, 1); W.cur = Math.max(0, Math.min(W.cur || 0, W.entries.length - 1)) })}><Icon name="trash" /></button>
        </div>
        {(e.sets || []).map((s, j) => {
          const L = `${m.name}: ${g('setN', j + 1)}`
          return <div key={s.sid || j} className={'gg-set' + (s.done ? ' done' : '')}>
            <span className="gg-n">{j + 1}</span>
            <Stepper label={`${L}: ${g('weightL')}`} value={s.w} step={2.5} unit="kg" onSet={v => G.change(m.id, W => { W.entries[i].sets[j].w = v; if (W.entries[i].sets[j].done) W.entries[i].sets[j].eat = Date.now() })} />
            <Stepper label={`${L}: ${g('repsL')}`} value={s.r} step={1} onSet={v => G.change(m.id, W => { W.entries[i].sets[j].r = v; if (W.entries[i].sets[j].done) W.entries[i].sets[j].eat = Date.now() })} />
            <button type="button" className={'gg-chk' + (s.done ? ' on' : '')} aria-label={`${L} ${g('doneL')}`} aria-pressed={!!s.done} onClick={() => tick(i, j)}><Icon name="check" /></button>
            <button type="button" className="gg-x" aria-label={`${L}: ${g('remove')}`} onClick={() => G.change(m.id, W => { W.entries[i].sets.splice(j, 1) })}>×</button>
          </div>
        })}
        <button type="button" className="btn sm ghost" onClick={() => G.change(m.id, W => { const ss = W.entries[i].sets; const l = ss[ss.length - 1] || {}; ss.push({ w: l.w ?? null, r: l.r ?? null, done: false }) })}>{g('addSet')}</button>
      </div>
    })}
    {others.length > 0 && <div className="gg-also">
      <span className="muted small">{g('addAlso')}</span>
      {others.map(o => <label key={o.id} className="gg-also-c"><input type="checkbox" checked={also.includes(o.id)} onChange={ev => setAlso(a => ev.target.checked ? [...a, o.id] : a.filter(x => x !== o.id))} data-testid="group-also" data-name={o.name} /> {o.name}</label>)}
    </div>}
    <div className="gg-actions">
      <button type="button" className="btn primary" onClick={add} data-testid="group-add-ex"><Icon name="plusCircle" /> {g('addEx')}</button>
      {others.length > 0 && <button type="button" className="btn" onClick={onNext} data-testid="group-next">{g('nextPerson', nextOf(members, m)?.name || '')} →</button>}
      <button type="button" className="btn ghost" onClick={finishOne} data-testid="group-finish-one">{g('finishOne', m.name)}</button>
    </div>
  </div>
}
const nextOf = (members, m) => {
  const live = members.filter(x => !x.ended)
  if (live.length < 2) return null
  const i = live.findIndex(x => x.id === m.id)
  return live[(i + 1) % live.length]
}

export default function GroupWorkout() {
  const G = theGroup()
  const user = useStore(s => s.user)
  const [, force] = useState(0)
  const [tab, setTab] = useState(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => G.subscribe(() => force(x => x + 1)), [])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    if (!user || user.acting) return
    let want = null
    try { want = JSON.parse(sessionStorage.getItem(GROUP_START_KEY) || 'null'); sessionStorage.removeItem(GROUP_START_KEY) } catch { want = null }
    const saved = savedGroup(window.localStorage)
    const list = [...(saved?.members || []), ...(Array.isArray(want) ? want : [])].filter((c, i, a) => c && a.findIndex(x => x.id === c.id) === i)
    if (!list.length) return
    setBusy(true)
    G.start(list).then(() => setBusy(false)).catch(e => { setBusy(false); toast(gErr(e)) })
  }, [user?.id])
  const members = G.members
  const cur = members.find(m => m.id === tab) || members.find(m => !m.ended) || members[0] || null
  const finishAll = () => confirmSheet({
    title: g('finishAllQ'), message: g('finishAllMsg'), confirmText: g('finishAll'),
    onConfirm: () => G.finishAll().then(() => { toast(g('groupTitle') + ': ' + g('endedTag')); nav('/home') }).catch(e => toast(gErr(e)))
  })
  return <div className="narrow gg" data-testid="group-workout">
    <div className="hdr"><div><h1>{g('groupTitle')}</h1>{busy && <div className="sub">{g('groupStarting')}</div>}</div>
      <button className="iconbtn" aria-label="Start" onClick={() => nav('/home')}><Icon name="chevronDown" /></button></div>
    {!members.length && !busy && <p className="muted">{g('groupNone')}</p>}
    {members.length > 0 && <div className="gg-tabs" role="tablist">
      {members.map(m => {
        const A = G.workoutOf(m)
        const all = A ? A.entries.reduce((n, e) => n + (e.sets || []).length, 0) : 0
        const done = A ? A.entries.reduce((n, e) => n + (e.sets || []).filter(s => s.done).length, 0) : 0
        const resting = m.rest && m.rest.until > now
        return <button key={m.id} type="button" role="tab" aria-selected={cur?.id === m.id} className={'gg-tab' + (cur?.id === m.id ? ' on' : '') + (m.ended ? ' ended' : '')} onClick={() => setTab(m.id)} data-testid="group-tab" data-name={m.name}>
          <span className="gg-tab-n">{m.name}</span>
          <span className="gg-tab-s">{m.ended ? g('endedTag') : resting ? '⏱ ' + mmss(m.rest.until - now) : `${done}/${all}`}</span>
        </button>
      })}
    </div>}
    {cur && !cur.ended && <MemberPanel key={cur.id} G={G} m={cur} members={members} now={now} onNext={() => { const n = nextOf(members, cur); if (n) setTab(n.id) }} />}
    {cur && cur.ended && <p className="muted">{cur.name}: {g('endedTag')}</p>}
    {members.some(m => !m.ended) && <button type="button" className="btn ghost dim" onClick={finishAll} data-testid="group-finish-all">{g('finishAll')}</button>}
  </div>
}
