// Gym mode v2 (local patch 0003): while a trainer leads a client, a bar across the top of every
// screen says whose account this is, with the way back. The whole layout moves down under it
// (--sat, which every top inset of the app already adds, grows by the bar's height).
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { g, gErr, stopLeading } from '../lib/gymv2.js'

export default function ActingBar() {
  const user = useStore(s => s.user)
  const acting = user?.acting
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    if (!acting) return
    // --sat is the stylesheet's own expression (the larger of env() and the native inset); the
    // bar sits in it and everything else 44 px further down.
    const sat0 = getComputedStyle(root).getPropertyValue('--sat').trim() || '0px'
    root.classList.add('gv-acting')
    root.style.setProperty('--gv-sat0', sat0)
    root.style.setProperty('--sat', `calc(${sat0} + 44px)`)
    return () => { root.classList.remove('gv-acting'); root.style.removeProperty('--sat'); root.style.removeProperty('--gv-sat0') }
  }, [!!acting])
  // A greeting after an invite was taken over (views/GymClaim.jsx reloads into the account).
  useEffect(() => {
    let n = null
    try { n = sessionStorage.getItem('gymv2_welcome'); if (n) sessionStorage.removeItem('gymv2_welcome') } catch { /* none */ }
    if (n && user?.name === n) setTimeout(() => useUI.getState().toast(g('welcome', n)), 400)
  }, [user?.id])
  if (!acting) return null
  const back = async () => {
    setBusy(true)
    try { await stopLeading(useStore) } catch (e) { setBusy(false); useUI.getState().toast(gErr(e)) }
  }
  return <div className="gv-bar" role="status" data-testid="acting-bar">
    <span className="gv-bar-t">{g('leading', user.name)}</span>
    <button type="button" className="gv-bar-b" onClick={back} disabled={busy} data-testid="acting-back">{busy ? g('switching') : g('backToMine')}</button>
  </div>
}
