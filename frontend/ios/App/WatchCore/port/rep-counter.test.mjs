// The Swift tests (RepCounterTests.swift) on the JavaScript port, with the same synthetic sets.
//   node --test "frontend/ios/App/WatchCore/port/*.test.mjs"
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROFILES, profileOf, learn, biquad, transposeFits, times, timesT, v3 } from './rep-counter.mjs'
import { synth } from './synth.mjs'

const bench = profileOf('0025'), squat = profileOf('0043'), dead = profileOf('0032'), curl = profileOf('0294')
const raise = profileOf('0334'), pushdown = profileOf('2249'), facePull = profileOf('5656'), cross = profileOf('0155')

test('thirty exercises, each with a profile', () => {
  assert.equal(PROFILES.length, 30)
  assert.equal(new Set(PROFILES.map(p => p[0])).size, 30)
  assert.equal(profileOf('0739'), null)
  assert.equal(profileOf('0292').oneArm, true)
})

test('bench press with an unrack and a re-rack', () => {
  const s = synth(7)
  s.hold(2)
  s.dir = v3(1, 0, 0.15); s.move(0.3, 1.0)
  s.dir = v3(0, 0, 1)
  s.hold(1)
  s.reps(10, { range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true })
  s.dir = v3(-1, 0, 0.15); s.move(0.0, 1.0)
  s.hold(3)
  assert.equal(s.count(bench).reps, 10)
})

test('slow squats with a pause at the bottom', () => {
  const s = synth(3)
  s.hold(2); s.reps(8, { range: 0.5, up: 1.6, down: 2.5, bottom: 0.6, eccentricFirst: true }); s.hold(2)
  assert.equal(s.count(squat).reps, 8)
})

test('fast reps', () => {
  const s = synth(4)
  s.hold(1.5); s.reps(12, { range: 0.35, up: 0.5, down: 0.55, top: 0.1, bottom: 0.1, eccentricFirst: true }); s.hold(2)
  assert.equal(s.count(bench).reps, 12)
})

test('deadlifts from the floor with a stop between reps', () => {
  const s = synth(5)
  s.hold(2); s.reps(6, { range: 0.5, up: 1.2, down: 1.4, top: 0.8, bottom: 2.5 }); s.hold(2)
  assert.equal(s.count(dead).reps, 6)
})

test('a rest-pause in the middle does not end the set', () => {
  const s = synth(6)
  s.hold(2)
  s.reps(5, { range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true })
  s.hold(4)
  s.reps(5, { range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true })
  s.hold(1)
  const c = s.count(bench)
  assert.equal(c.reps, 10)
  assert.equal(c.ended, false)
})

test('tremor and noise are no reps', () => {
  const s = synth(8)
  s.noise = 0.03; s.tremor = 0.08
  s.hold(1.5); s.reps(10, { range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true }); s.hold(2)
  assert.equal(s.count(bench).reps, 10)
  const still = synth(9)
  still.noise = 0.03; still.tremor = 0.1
  still.hold(30)
  assert.equal(still.count(bench).reps, 0)
  assert.equal(still.count(curl).reps, 0)
})

test('the set ends after five still seconds', () => {
  const s = synth(10)
  s.hold(1.5); s.reps(6, { range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true }); s.hold(3)
  assert.equal(s.count(bench).ended, false)
  s.hold(3)
  const c = s.count(bench)
  assert.equal(c.ended, true)
  assert.equal(c.reps, 6)
})

test('a half rep at the end is not counted', () => {
  const s = synth(11)
  s.hold(1.5); s.reps(7, { range: 0.4, up: 1.0, down: 1.2, eccentricFirst: true })
  s.move(-0.4, 1.2)
  s.hold(3)
  assert.equal(s.count(bench).reps, 7)
})

test('tempo changes within the set', () => {
  const s = synth(12)
  s.hold(1.5)
  for (const [up, down] of [[2.0, 3.0], [1.6, 2.4], [1.2, 1.8], [0.9, 1.2], [0.8, 1.0], [0.8, 1.0], [1.4, 1.2], [2.2, 1.2]]) {
    s.reps(1, { range: 0.45, up, down, eccentricFirst: true })
  }
  s.hold(2)
  assert.equal(s.count(squat).reps, 8)
})

test('a slow eccentric and a fast concentric', () => {
  const s = synth(32)
  s.hold(1.5); s.reps(8, { range: 0.45, up: 0.7, down: 3.0, eccentricFirst: true }); s.hold(2)
  assert.equal(s.count(bench).reps, 8)
  const c = synth(33)
  c.rotation = true
  c.hold(1.5); c.reps(8, { range: 2.0, up: 0.6, down: 2.8 }); c.hold(2)
  assert.equal(c.count(curl).reps, 8)
})

test('many noisy sets all count right', () => {
  const wrong = []
  for (let seed = 40; seed < 60; seed++) {
    const s = synth(seed)
    s.noise = 0.03; s.tremor = 0.05
    s.hold(1.5); s.reps(10, { range: 0.4, up: 1.0, down: 1.5, eccentricFirst: true }); s.hold(2)
    if (s.count(bench).reps !== 10) wrong.push(`bench ${seed}: ${s.count(bench).reps}`)
    const c = synth(seed)
    c.rotation = true; c.noise = 0.03; c.tremor = 0.05
    c.hold(1.5); c.reps(10, { range: 2.0, up: 1.0, down: 1.5 }); c.hold(2)
    if (c.count(curl).reps !== 10) wrong.push(`curl ${seed}: ${c.count(curl).reps}`)
  }
  assert.deepEqual(wrong, [])
})

test('a small sensor bias does not matter', () => {
  for (const bias of [-0.004, 0.004]) {
    const s = synth(34)
    s.bias = bias
    s.hold(1.5); s.reps(10, { range: 0.4, up: 1.0, down: 1.5, eccentricFirst: true }); s.hold(2)
    assert.equal(s.count(bench).reps, 10, `bias ${bias}`)
    const q = synth(35)
    q.bias = bias
    q.hold(30)
    assert.equal(q.count(bench).reps, 0, `bias ${bias}, standing still`)
  }
})

test('curls as the wrist turns', () => {
  const s = synth(13)
  s.rotation = true
  s.hold(1.5); s.reps(10, { range: 2.2, up: 1.0, down: 1.4, top: 0.3, bottom: 0.4 }); s.hold(2)
  assert.equal(s.count(curl).reps, 10)
})

test('lateral raises and pushdowns', () => {
  const s = synth(14)
  s.rotation = true
  s.hold(1.5); s.reps(12, { range: 1.4, up: 1.0, down: 1.3 }); s.hold(2)
  assert.equal(s.count(raise).reps, 12)
  const p = synth(15)
  p.rotation = true
  p.hold(1.5); p.reps(15, { range: 1.0, up: 0.7, down: 1.0, top: 0.2, bottom: 0.2 }); p.hold(2)
  assert.equal(p.count(pushdown).reps, 15)
})

test('face pulls along a horizontal line, cross-overs along a slanted one', () => {
  const s = synth(16)
  s.dir = v3(Math.cos(0.5), Math.sin(0.5), 0.1)
  s.hold(2); s.reps(12, { range: 0.35, up: 0.9, down: 1.1 }); s.hold(2)
  assert.equal(s.count(facePull).reps, 12)
  const c = synth(17)
  c.dir = v3(0.6, 0.3, -0.75)
  c.hold(2); c.reps(10, { range: 0.4, up: 1.0, down: 1.2 }); c.hold(2)
  assert.equal(c.count(cross).reps, 10)
})

test('different tempos across sets', () => {
  ;[0.6, 1.0, 1.5, 2.5].forEach((tempo, i) => {
    const s = synth(20 + i)
    s.hold(1.5); s.reps(8, { range: 0.45, up: tempo, down: tempo * 1.3, eccentricFirst: true }); s.hold(2)
    assert.equal(s.count(bench).reps, 8, `tempo ${tempo}`)
  })
})

test('nothing for ninety seconds gives up', () => {
  const s = synth(30)
  s.noise = 0.01
  s.hold(91)
  const c = s.count(bench)
  assert.equal(c.gaveUp, true)
  assert.equal(c.reps, 0)
})

test('learning moves the threshold gently', () => {
  let m = {}
  m = learn(m, 13, 10, 0.5)
  assert.ok(m.scale > 1 && m.scale < 1.1)
  assert.equal(m.sets, 1)
  assert.equal(m.typical, null)
  const up = m.scale
  m = learn(m, 7, 10, 0.5)
  assert.ok(m.scale < up)
  m = learn(m, 10, 10, 0.6)
  assert.ok(Math.abs(m.typical - 0.6) < 1e-9)
  const r1 = 10 / 13, r2 = r1 + (10 / 7 - r1) * 0.3, r3 = r2 + (1 - r2) * 0.3
  assert.ok(Math.abs(m.ratio - r3) < 1e-9)
  let far = {}
  for (let i = 0; i < 50; i++) far = learn(far, 30, 5, null)
  assert.equal(far.scale, 2.5)
  assert.deepEqual(learn(far, 10, 0, null), far)
})

test('a higher scale ignores smaller moves', () => {
  const s = synth(31)
  s.noise = 0.005
  s.hold(1.5); s.reps(8, { range: 0.1, up: 1.0, down: 1.0, eccentricFirst: true }); s.hold(2)
  assert.equal(s.count(bench).reps, 8)
  assert.equal(s.count(bench, { scale: 2 }).reps, 0)
})

test('the world frame from the attitude', () => {
  const r = [1, 0, 0, 0, 0, -1, 0, 1, 0]
  const g = v3(0, -1, 0)
  const fits = transposeFits(r, g)
  assert.ok(Math.abs((fits ? timesT : times)(r, g).z + 1) < 1e-9)
  assert.ok(Math.abs((fits ? times : timesT)(r, g).z - 1) < 1e-9)
})

test('the low-pass passes slow and stops fast', () => {
  const peak = hz => { const lp = biquad(2.5, 50); let m = 0; for (let i = 0; i < 500; i++) { const y = lp(Math.sin(2 * Math.PI * hz * i / 50)); if (i > 100) m = Math.max(m, Math.abs(y)) } return m }
  assert.ok(peak(0.5) > 0.95)
  assert.ok(peak(12) < 0.08)
})
