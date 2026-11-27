// Synthetic wrist signals: RepSynth in RepCounterTests.swift, number for number (the same
// generator, the same seeds), so the JavaScript port and the Swift counter can be compared.
import { G, v3, vec, repCounter } from './rep-counter.mjs'

const MASK = (1n << 64n) - 1n

export function synth (seed = 1) {
  let s = BigInt(seed)
  let t = 0, pos = 0
  const o = { fs: 50, samples: [], dir: v3(0, 0, 1), rotation: false, radius: 0.3, noise: 0.02, gyroNoise: 0.03, bias: 0, tremor: 0, tremorHz: 9 }
  const rand = () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & MASK
    return Number(s >> 11n) / 2 ** 53
  }
  const gauss = () => {
    const u = Math.max(1e-12, rand()), v = rand()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const emit = (p, v, a) => {
    let accW, gyro = v3()
    if (o.rotation) {
      const tangential = o.radius * a, centripetal = o.radius * v * v
      accW = vec.mul(v3(tangential * Math.cos(p) - centripetal * Math.sin(p), 0, tangential * Math.sin(p) + centripetal * Math.cos(p)), 1 / G)
      gyro = v3(0, v, 0)
    } else {
      accW = vec.mul(vec.unit(o.dir), a / G)
    }
    const trem = o.tremor * Math.sin(2 * Math.PI * o.tremorHz * t)
    // the same order of draws as Swift: x, y, z of the accelerometer, then of the gyroscope
    const nx = gauss(), ny = gauss(), nz = gauss()
    accW = vec.add(accW, v3(o.noise * nx + trem, o.noise * ny, o.noise * nz + trem + o.bias))
    const gx = gauss(), gy = gauss(), gz = gauss()
    gyro = vec.add(gyro, v3(o.gyroNoise * gx + o.tremor * 2 * trem, o.gyroNoise * gy, o.gyroNoise * gz))
    o.samples.push({ t, acc: accW, gyro })
    t += 1 / o.fs
  }
  o.move = (to, secs) => {
    const n = Math.max(1, Math.round(secs * o.fs))
    const from = pos
    for (let i = 0; i < n; i++) {
      const tau = (i + 0.5) / n
      const A = to - from, w = Math.PI / secs
      emit(from + A * (1 - Math.cos(Math.PI * tau)) / 2, A * w / 2 * Math.sin(Math.PI * tau), A * w * w / 2 * Math.cos(Math.PI * tau))
    }
    pos = to
  }
  o.hold = secs => o.move(pos, secs)
  o.reps = (n, { range, up, down, top = 0.3, bottom = 0.2, eccentricFirst = false }) => {
    for (let i = 0; i < n; i++) {
      if (eccentricFirst) { o.move(pos - range, down); o.hold(bottom); o.move(pos + range, up); o.hold(top) }
      else { o.move(pos + range, up); o.hold(top); o.move(pos - range, down); o.hold(bottom) }
    }
  }
  o.count = (profile, opts) => { const c = repCounter(profile, opts); for (const x of o.samples) c.add(x); return c }
  return o
}
