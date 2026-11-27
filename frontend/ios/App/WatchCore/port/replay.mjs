// A test-mode file from the watch (Watch/RepSensor.swift RepSamples, "reps-<time>-<id>.csv") run
// through the JavaScript counter again: what it counts now, against what the lifter confirmed.
// For tuning the profiles (rep-counter.mjs PROFILES, RepProfiles.swift) on real sets.
//   node frontend/ios/App/WatchCore/port/replay.mjs reps-20261128-181500-0025.csv [more.csv …]
//   node frontend/ios/App/WatchCore/port/replay.mjs --lobes file.csv      (every half rep found)
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { profileOf, repCounter, v3 } from './rep-counter.mjs'

const args = process.argv.slice(2)
const lobes = args.includes('--lobes')
const files = args.filter(a => !a.startsWith('--'))
if (!files.length) { console.error('usage: node replay.mjs [--lobes] <file.csv> …'); process.exit(2) }

let right = 0, total = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8').split('\n')
  const meta = Object.fromEntries((text[0].startsWith('#') ? text[0].slice(1).trim().split(/\s+/) : []).map(kv => kv.split('=')))
  const id = meta.exId || (basename(file).match(/-(\w+)\.csv$/) || [])[1]
  const profile = profileOf(id)
  if (!profile) { console.log(`${basename(file)}: no profile for ${id}`); continue }
  const c = repCounter(profile, { scale: Number(meta.scale) || 1 })
  for (const line of text) {
    if (!line || line[0] === '#' || line.startsWith('t,')) continue
    const f = line.split(',').map(Number)
    c.add({ t: f[0], acc: v3(f[1], f[2], f[3]), gyro: v3(f[4], f[5], f[6]) })
  }
  const confirmed = Number(meta.confirmed)
  total++
  if (c.reps === confirmed) right++
  console.log(`${basename(file)}: ${id} ${profile.axis}, watch counted ${meta.counted}, lifter said ${meta.confirmed}, counted now ${c.reps}` + (c.ended ? ' (ended)' : ''))
  if (lobes) for (const l of c.lobes) console.log(`  ${l.sign > 0 ? '+' : '-'} ${l.start.toFixed(2)}-${l.end.toFixed(2)} s, peak ${l.peak.toFixed(3)}`)
}
if (total > 1) console.log(`\n${right} of ${total} sets counted as confirmed`)
