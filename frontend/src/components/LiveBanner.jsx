// Live joint training (local patch 0006): a trainer (not leading anyone right now) sees which of the
// gym's clients is training at this moment, with one tap into that workout: "Prowadź jako klient"
// and straight onto the client's running workout (lib/gym-live.js picks it up after the switch).
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { g, gErr, liveNow, startLeading } from '../lib/gymv2.js'

const POLL_MS = 15000

export default function LiveBanner() {
  const config = useStore(s => s.config)
  const user = useStore(s => s.user)
  const gv = config?.gymv2
  const staff = !!(gv?.on && gv.live && !gv.acting && (gv.role === 'trainer' || gv.role === 'admin') && user && !user.acting)
  const [list, setList] = useState([])
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    if (!staff) { setList([]); return }
    let gone = false, tm = null
    const tick = async () => {
      if (gone) return
      if (typeof document === 'undefined' || !document.hidden) {
        try { const r = await liveNow(); if (!gone) setList(Array.isArray(r.live) ? r.live : []) } catch { /* next time */ }
      }
      tm = setTimeout(tick, POLL_MS)
    }
    tick()
    const vis = () => { if (!document.hidden) { clearTimeout(tm); tick() } }
    document.addEventListener('visibilitychange', vis)
    return () => { gone = true; clearTimeout(tm); document.removeEventListener('visibilitychange', vis) }
  }, [staff])
  if (!staff || !list.length) return null
  const join = async c => {
    setBusy(c.id)
    try { await startLeading(useStore, c.id, '#/workout') } catch (e) { setBusy(null); useUI.getState().toast(gErr(e)) }
  }
  return <div className="gl-banner" role="status" data-testid="live-banner">
    {list.slice(0, 3).map(c => <div key={c.id} className="gl-banner-row">
      <span className="gl-dot" aria-hidden="true" />
      <span className="gl-banner-t"><b>{g('liveNow', c.name)}</b><br /><span className="gl-banner-s">{g('liveInfo', c.live.name || '–', c.live.exercises, c.live.setsDone, c.live.setsTotal)}</span></span>
      <button type="button" className="gl-banner-b" disabled={!!busy} onClick={() => join(c)} data-testid="live-join">{busy === c.id ? g('switching') : g('liveJoinShort')}</button>
    </div>)}
  </div>
}
