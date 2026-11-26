// Live joint training (local patch 0006): one line under the workout's header while the workout is
// shared live, saying with whom (the client sees the trainer, the trainer sees whether the client's
// phone is there) and whether changes are still waiting to go.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { liveStatus } from '../lib/gym-live-app.js'
import { g } from '../lib/gymv2.js'

export default function LiveLine() {
  const acting = useStore(s => !!s.user?.acting)
  const [st, setSt] = useState(() => liveStatus())
  useEffect(() => { const t = setInterval(() => setSt(liveStatus()), 1500); return () => clearInterval(t) }, [])
  if (!st) return null
  const trainer = st.peers?.trainer
  const trainerHere = trainer && st.peers?.now && st.peers.now - trainer.at < 90000
  const away = acting && !st.clientPresent
  const who = acting ? (st.clientPresent ? '' : g('liveClientAway')) : trainerHere ? g('liveWith', trainer.name) : ''
  return <div className={'gl-line' + (away ? ' away' : '')} data-testid="live-line" data-pending={st.pending}>
    <span className="gl-dot" aria-hidden="true" /><span className="gl-live-tag">{g('liveBadge')}</span>{who ? <span>· {who}</span> : null}{st.pending ? <span>· ⟳ {st.pending}</span> : null}
  </div>
}
