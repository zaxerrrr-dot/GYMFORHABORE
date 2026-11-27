// A wider run than the tests: every one of the 30 exercises, many random sets each (reps, tempo,
// pauses, noise, tremor, the first and last moves), and how often the count is exactly right.
//   node frontend/ios/App/WatchCore/port/report.mjs [sets per exercise, default 40]
import { PROFILES, v3 } from './rep-counter.mjs'
import { synth } from './synth.mjs'

const perEx = Number(process.argv[2]) || 40
let lcg = 12345
const rnd = () => { lcg = (lcg * 1103515245 + 12345) % 2147483648; return lcg / 2147483648 }
const between = (a, b) => a + (b - a) * rnd()

const rows = []
let all = 0, exact = 0, off1 = 0, absErr = 0
for (const [id, p, name] of PROFILES) {
  let ok = 0, one = 0, err = 0
  for (let k = 0; k < perEx; k++) {
    const s = synth(1000 + k * 31 + Number(id))
    s.noise = between(0.005, 0.03)
    s.tremor = rnd() < 0.3 ? between(0.02, 0.08) : 0
    const n = 5 + Math.floor(rnd() * 11)
    const up = between(0.6, 2.0), down = up * between(1.0, 2.5)
    const ecc = p.axis === 'vertical' && rnd() < 0.6
    let range
    if (p.axis === 'rotation') { s.rotation = true; range = between(1.0, 2.3) } else {
      range = between(0.25, 0.55)
      if (p.axis === 'horizontal') { const a = between(0, 6.28); s.dir = v3(Math.cos(a), Math.sin(a), between(-0.15, 0.15)) }
      if (p.axis === 'dominant') s.dir = v3(between(-1, 1), between(-1, 1), between(-1, 1))
    }
    s.hold(between(1, 3))
    // half of the sets start with a small move that is no rep (lifting the weight into place)
    if (rnd() < 0.5 && !s.rotation) { const d = s.dir; s.dir = v3(1, 0, 0.2); s.move(0.15, 0.8); s.dir = d; s.hold(0.8) }
    const pauseAt = rnd() < 0.3 ? Math.floor(rnd() * n) : -1
    for (let i = 0; i < n; i++) {
      s.reps(1, { range, up: up * between(0.85, 1.25), down: down * between(0.85, 1.25), top: between(0.1, 0.8), bottom: between(0.1, 0.8), eccentricFirst: ecc })
      if (i === pauseAt) s.hold(between(2, 4))
    }
    s.hold(between(1, 3))
    const c = s.count(p).reps
    all++
    if (c === n) { ok++; exact++ } else if (Math.abs(c - n) === 1) { one++; off1++ }
    err += Math.abs(c - n); absErr += Math.abs(c - n)
  }
  rows.push(`${id}  ${p.axis.padEnd(10)}  ${String(Math.round(100 * ok / perEx)).padStart(3)} %  ±1: ${String(Math.round(100 * (ok + one) / perEx)).padStart(3)} %  avg err ${(err / perEx).toFixed(2)}  ${name}`)
}
console.log(`sets per exercise: ${perEx}`)
console.log(rows.join('\n'))
console.log(`\nall: ${all} sets, exact ${(100 * exact / all).toFixed(1)} %, within ±1 ${(100 * (exact + off1) / all).toFixed(1)} %, mean abs error ${(absErr / all).toFixed(3)} reps`)
