// The watch's rep counter (WatchCore/Sources/WatchCore/RepCounter.swift and RepProfiles.swift) in
// plain JavaScript, step for step, so the algorithm can be tried and tested without a Mac:
//
//   node --test "frontend/ios/App/WatchCore/port/*.test.mjs"
//   node frontend/ios/App/WatchCore/port/replay.mjs <file.csv> [exerciseId]   (a test-mode file)
//
// Change the Swift and this file together; rep-counter.test.mjs runs the same synthetic sets as
// RepCounterTests.swift and must give the same counts. Not part of the app's bundle.

export const G = 9.80665

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z })
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z)
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z)
const mul = (a, k) => v3(a.x * k, a.y * k, a.z * k)
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z
const len = a => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
const unit = a => { const l = len(a); return l > 1e-12 ? mul(a, 1 / l) : v3() }
export const vec = { add, sub, mul, dot, len, unit }

const lin = (axis, minAmp, minRep, maxRep, maxPause, endIdle = 5, oneArm = false) => ({ axis, minAmp, minRep, maxRep, maxPause, endIdle, oneArm })
const V = (minAmp, minRep, maxRep, maxPause, o = {}) => lin('vertical', minAmp, minRep, maxRep, maxPause, o.end ?? 5, !!o.oneArm)
const R = (minAmp, o = {}) => lin('rotation', minAmp, 0.8, 9, 3, 5, !!o.oneArm)

// [id, profile, English name, Polish name]: RepProfiles.swift's table, in its order.
export const PROFILES = [
  ['0025', V(0.10, 0.8, 9, 3.5), 'barbell bench press', 'wyciskanie sztangi na ławce płaskiej'],
  ['0047', V(0.10, 0.8, 9, 3.5), 'barbell incline bench press', 'wyciskanie sztangi na ławce skośnej'],
  ['0043', V(0.10, 1.0, 10, 4), 'barbell full squat', 'pełny przysiad ze sztangą'],
  ['0032', V(0.10, 1.0, 10, 4, { end: 6 }), 'barbell deadlift', 'martwy ciąg ze sztangą'],
  ['0085', V(0.09, 1.0, 10, 3.5), 'barbell romanian deadlift', 'martwy ciąg rumuński ze sztangą'],
  ['1162', V(0.10, 0.8, 9, 3.5), 'barbell standing military press', 'wyciskanie żołnierskie sztangi stojąc'],
  ['0027', V(0.10, 0.7, 7, 3), 'barbell bent over row', 'wiosłowanie sztangą w opadzie tułowia'],
  ['0031', R(0.40), 'barbell curl', 'uginanie ramion ze sztangą'],
  ['0054', V(0.08, 1.0, 10, 4), 'barbell lunge', 'wykrok ze sztangą'],
  ['0060', R(0.40), 'barbell lying triceps extension skull crusher', 'wyciskanie francuskie ze sztangą w leżeniu'],
  ['0289', V(0.10, 0.8, 9, 3.5), 'dumbbell bench press', 'wyciskanie hantli na ławce'],
  ['0314', V(0.10, 0.8, 9, 3.5), 'dumbbell incline bench press', 'wyciskanie hantli na ławce skośnej'],
  ['0405', V(0.10, 0.8, 9, 3.5), 'dumbbell seated shoulder press', 'wyciskanie hantli nad głowę w siadzie'],
  ['0308', R(0.35), 'dumbbell fly', 'rozpiętki z hantlami'],
  ['0334', R(0.40), 'dumbbell lateral raise', 'unoszenie hantli bokiem'],
  ['0294', R(0.40), 'dumbbell biceps curl', 'uginanie ramion z hantlami'],
  ['0313', R(0.40), 'dumbbell hammer curl', 'uginanie ramion chwytem młotkowym z hantlami'],
  ['0292', V(0.10, 0.7, 7, 3, { oneArm: true }), 'dumbbell one arm bent-over row', 'wiosłowanie hantlem jednorącz w opadzie tułowia'],
  ['0430', R(0.40), 'dumbbell standing triceps extension', 'prostowanie ramion z hantlami stojąc (francuskie)'],
  ['0336', V(0.08, 1.0, 10, 4), 'dumbbell lunge', 'wykrok z hantlami'],
  ['1760', V(0.10, 1.0, 10, 4), 'dumbbell goblet squat', 'przysiad goblet z hantlem'],
  ['0198', V(0.10, 0.8, 8, 3), 'cable pulldown', 'ściąganie drążka wyciągu'],
  ['0861', lin('horizontal', 0.10, 0.8, 8, 3), 'cable seated row', 'wiosłowanie na wyciągu w siadzie'],
  ['2249', R(0.35), 'cable triceps pushdown (v bar)', 'prostowanie ramion na wyciągu (uchwyt V)'],
  ['0200', R(0.35), 'cable pushdown (with rope attachment)', 'prostowanie ramion na wyciągu (lina)'],
  ['5656', lin('horizontal', 0.08, 0.8, 7, 3), 'cable standing face pull (with rope)', 'face pull na wyciągu (lina)'],
  ['0155', lin('dominant', 0.08, 0.8, 8, 3), 'cable cross-over variation', 'rozpiętki na bramie (krzyżowanie linek)'],
  ['0868', R(0.40), 'cable curl', 'uginanie ramion na wyciągu'],
  ['0178', R(0.40, { oneArm: true }), 'cable lateral raise', 'unoszenie ramienia bokiem na wyciągu'],
  ['0194', R(0.40), 'cable overhead triceps extension (rope attachment)', 'prostowanie ramion nad głową na wyciągu (lina)'],
]
export const profileOf = id => (PROFILES.find(p => p[0] === id) || [])[1] || null

/** 2nd-order Butterworth low-pass (RBJ, Q = 1/√2), direct form II transposed. */
export function biquad (fc, fs) {
  const w0 = 2 * Math.PI * Math.min(fc, fs * 0.45) / fs
  const alpha = Math.sin(w0) / (2 * Math.sqrt(0.5))
  const c = Math.cos(w0)
  const a0 = 1 + alpha
  const b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = (1 - c) / 2 / a0, a1 = -2 * c / a0, a2 = (1 - alpha) / a0
  let z1 = 0, z2 = 0, primed = false
  return x => {
    if (!primed) { primed = true; z1 = x - b0 * x; z2 = b2 * x - a2 * x }
    const y = b0 * x + z1
    z1 = b1 * x - a1 * y + z2
    z2 = b2 * x - a2 * y
    return y
  }
}
const biquad3 = (fc, fs) => { const x = biquad(fc, fs), y = biquad(fc, fs), z = biquad(fc, fs); return v => v3(x(v.x), y(v.y), z(v.z)) }

function leakyVelocity (leak = 4, mean = 8) {
  let v = v3(), m = v3()
  const step = (a, dt) => {
    const k = Math.exp(-dt / leak)
    v = add(mul(v, k), mul(a, dt))
    m = add(m, mul(sub(v, m), Math.min(1, dt / mean)))
    return sub(v, m)
  }
  step.raw = () => v
  return step
}

function principalAxis (size0, every0, flat, start) {
  const size = Math.max(4, size0), every = Math.max(1, every0)
  const buf = []
  let head = 0, n = 0
  const pa = { axis: unit(start), get ready () { return buf.length >= Math.floor(size / 3) } }
  const update = () => {
    const c = buf.length
    let mean = v3()
    for (const v of buf) mean = add(mean, v)
    mean = mul(mean, 1 / c)
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
    for (const v0 of buf) {
      const v = sub(v0, mean)
      xx += v.x * v.x; xy += v.x * v.y; xz += v.x * v.z
      yy += v.y * v.y; yz += v.y * v.z; zz += v.z * v.z
    }
    if ((xx + yy + zz) / c <= 1e-8) return
    let e = pa.axis
    if (len(e) < 0.5) e = flat ? v3(1, 0, 0) : v3(0, 0, 1)
    for (let i = 0; i < 12; i++) {
      const next = v3(xx * e.x + xy * e.y + xz * e.z, xy * e.x + yy * e.y + yz * e.z, xz * e.x + yz * e.y + zz * e.z)
      const l = len(next)
      if (!(l > 1e-15)) return
      e = mul(next, 1 / l)
    }
    if (dot(e, pa.axis) < 0) e = mul(e, -1)
    pa.axis = e
  }
  pa.add = v0 => {
    const v = flat ? v3(v0.x, v0.y, 0) : v0
    if (buf.length < size) buf.push(v); else { buf[head] = v; head = (head + 1) % size }
    n += 1
    if (n % every === 0 && pa.ready) update()
  }
  return pa
}

export const median = a => {
  if (!a.length) return null
  const s = [...a].sort((p, q) => p - q)
  return s.length % 2 === 1 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export const HYSTERESIS = 0.35, FOLLOW = 0.35, MAX_QUIET = 15, GIVE_UP = 90, WARM_UP = 0.6, OTHER_HALF = 0.2, STILL_FOR = 1.5

/**
 * The counter of one set: add({ t, acc: {x,y,z} world in g, gyro: {x,y,z} rad/s }) per sample.
 * Returns true when that sample completed a rep.
 */
export function repCounter (profile, { scale = 1, typicalPeak = null, fs = 50 } = {}) {
  const base = profile.minAmp * Math.min(2.5, Math.max(0.5, scale))
  const c = {
    profile, base, reps: 0, repEnds: [], repDurations: [], repPeaks: [], repSmall: [], lobes: [],
    threshold: Math.max(base, (typicalPeak || 0) * 0.3), ended: false, gaveUp: false, signal: 0,
  }
  const lpAcc = biquad3(2.5, fs), lpGyro = biquad3(2.5, fs)
  const vel = leakyVelocity()
  const flat = profile.axis === 'horizontal'
  const pca = principalAxis(Math.round(3 * fs), Math.max(1, Math.round(fs / 4)), flat, flat ? v3(1, 0, 0) : v3(0, 0, 1))
  let energy = 0, rotEnergy = 0, lastT = null, firstT = null, stillSince = null, lastRepAt = null
  let sign = 0, lobeStart = 0, lobePeak = 0, armedAt = null, pending = null

  const pairs = (a, b) => {
    if (a.sign === b.sign) return false
    const gap = b.start - a.end, whole = b.end - a.start
    if (!(gap <= profile.maxPause && whole >= profile.minRep && whole <= profile.maxRep)) return false
    const ratio = b.peak / Math.max(a.peak, 1e-9)
    if (!(ratio >= 1 / 8 && ratio <= 8)) return false
    if (c.repDurations.length >= 3) {
      const d = median(c.repDurations)
      if (!(whole >= d / 3 && whole <= d * 3)) return false
    }
    return true
  }
  const count = (a, b) => {
    c.reps += 1
    c.repEnds.push(b.end)
    c.repDurations.push(b.end - a.start)
    c.repPeaks.push(Math.max(a.peak, b.peak))
    c.repSmall.push(Math.min(a.peak, b.peak))
    lastRepAt = b.end
    c.threshold = Math.max(base, (median(c.repSmall.slice(-6)) || 0) * FOLLOW)
  }
  // After half a rep, its other half (often the slow eccentric) needs less: down to 20 % of the first.
  const thresholdFor = sgn => (!pending || pending.sign === sgn) ? c.threshold : Math.max(base * 0.5, Math.min(c.threshold, pending.peak * OTHER_HALF))
  let lobeLow = 0
  const detect = (x, t) => {
    if (sign === 0) {
      const sgn = x > 0 ? 1 : -1
      const h = thresholdFor(sgn)
      if (Math.abs(x) < h * HYSTERESIS) armedAt = null; else if (armedAt == null) armedAt = t
      if (Math.abs(x) >= h) { sign = sgn; lobeStart = armedAt ?? t; lobePeak = Math.abs(x); lobeLow = h * HYSTERESIS }
      return false
    }
    const low = lobeLow
    if (sign * x > lobePeak) lobePeak = sign * x
    if (!(sign * x < low)) return false
    const lobe = { sign, start: lobeStart, end: t, peak: lobePeak }
    sign = 0
    armedAt = Math.abs(x) >= low ? t : null
    if (lobe.end - lobe.start < 0.1) return false
    c.lobes.push(lobe)
    if (c.lobes.length > 400) c.lobes.splice(0, c.lobes.length - 400)
    if (pending && pairs(pending, lobe)) { const p = pending; pending = null; count(p, lobe); return true }
    // a lobe only the lowered threshold let through never waits for a half of its own
    if (lobe.peak >= c.threshold) pending = lobe
    return false
  }

  c.typicalPeak = () => median(c.repPeaks)
  c.add = s => {
    if (c.ended || c.gaveUp) return false
    let dt = 0.02
    if (lastT != null) { if (!(s.t > lastT)) return false; dt = Math.min(0.1, s.t - lastT) } else firstT = s.t
    lastT = s.t
    const a = mul(lpAcc(s.acc), G)
    const w = lpGyro(s.gyro)
    const k = Math.min(1, dt / 0.4)
    energy += (len(a) - energy) * k
    rotEnergy += (len(w) - rotEnergy) * k
    let x, speed
    if (profile.axis === 'vertical') { x = vel(v3(0, 0, a.z), dt).z; speed = Math.abs(vel.raw().z) }
    else if (profile.axis === 'horizontal' || profile.axis === 'dominant') {
      const v = vel(profile.axis === 'horizontal' ? v3(a.x, a.y, 0) : a, dt)
      pca.add(v)
      x = pca.ready ? dot(v, pca.axis) : 0
      speed = len(vel.raw())
    } else {
      pca.add(w)
      x = pca.ready ? dot(w, pca.axis) : 0
      speed = Math.abs(x)
    }
    c.signal = x
    const t = s.t
    let counted = false
    if (t - firstT >= WARM_UP) counted = detect(x, t)
    const still = energy < 0.35 && rotEnergy < 0.35 && sign === 0 && speed < base
    if (still) { if (stillSince == null) stillSince = t } else stillSince = null
    if (c.reps > 0 && lastRepAt != null) {
      const wait = Math.max(profile.endIdle, 2 * (median(c.repDurations) || 0))
      if (t - lastRepAt >= wait && stillSince != null && t - stillSince >= STILL_FOR) c.ended = true
      if (t - lastRepAt >= Math.max(MAX_QUIET, wait + 5)) c.ended = true
    } else if (t - firstT >= GIVE_UP) c.gaveUp = true
    return counted
  }
  return c
}

/** RepLearning.learn: what one corrected set teaches about an exercise. */
export function learn (m0, counted, confirmed, peak, rate = 0.3) {
  const m = { scale: 1, typical: null, ratio: null, sets: 0, ...m0 }
  if (!(confirmed > 0) || counted < 0) return m
  m.sets += 1
  if (counted > 0) { const r = confirmed / counted; m.ratio = m.ratio == null ? r : m.ratio + (r - m.ratio) * rate }
  const err = Math.max(-1, Math.min(1, (counted - confirmed) / Math.max(confirmed, 1)))
  m.scale = Math.max(0.5, Math.min(2.5, m.scale * (1 + rate * err)))
  if (peak > 0 && counted >= 3 && Math.abs(err) <= 0.2) m.typical = m.typical == null ? peak : m.typical + (peak - m.typical) * rate
  return m
}

/** RepMath: CMAttitude's rotation matrix (row-major m11…m33) applied as R·v or Rᵀ·v. */
export const times = (r, v) => v3(r[0] * v.x + r[1] * v.y + r[2] * v.z, r[3] * v.x + r[4] * v.y + r[5] * v.z, r[6] * v.x + r[7] * v.y + r[8] * v.z)
export const timesT = (r, v) => v3(r[0] * v.x + r[3] * v.y + r[6] * v.z, r[1] * v.x + r[4] * v.y + r[7] * v.z, r[2] * v.x + r[5] * v.y + r[8] * v.z)
export const transposeFits = (r, gravity) => {
  const down = v3(0, 0, -1), g = unit(gravity)
  return len(sub(timesT(r, g), down)) <= len(sub(times(r, g), down))
}
