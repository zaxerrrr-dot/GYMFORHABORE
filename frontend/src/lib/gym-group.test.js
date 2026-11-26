// @vitest-environment happy-dom
/* Group training (local patch 0006): one trainer's device runs three clients' workouts at once
   (lib/gym-group.js with the app's own builders, gym-group-app.js) on the server's real channel code
   (api/gymv2/live.js, in this process). Checked: each client gets their own workout on their own
   account, the same exercise added for two people carries each one's own last weight, a change for
   one never shows in another's, a client's phone (lib/gym-live.js) picks up its workout and its
   tick reaches the trainer, and the end: phone there -> the phone saves; no phone -> saved for them. */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('./api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: vi.fn() }) } }))

import { createGroup } from './gym-group.js'
import { groupBuild } from './gym-group-app.js'
import { createLiveClient } from './gym-live.js'
import { createLive } from '../../../api/gymv2/live.js'

const clone = v => JSON.parse(JSON.stringify(v))
const day = (d, entries) => ({ id: 'w' + d, d: '2026-11-' + d, start: Date.UTC(2026, 10, +d, 17), end: Date.UTC(2026, 10, +d, 18), entries })
// Their history: Sylwester squats 100 kg, Anna 50 kg, Bartosz never did.
const docs = {
  SYL: { unit: 'kg', routines: [], workouts: [day('20', [{ id: '0043', sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }])] },
  ANN: { unit: 'kg', routines: [], workouts: [day('21', [{ id: '0043', sets: [{ w: 50, r: 10, done: true }] }])] },
  BAR: null,
}
const names = { SYL: 'Sylwester', ANN: 'Anna', BAR: 'Bartosz' }

let dir, server, now, saved
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-group-'))
  now = Date.UTC(2026, 10, 26, 17, 0, 0)
  server = createLive({ dataDir: dir, now: () => now })
  saved = {}
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

// The trainer's device: only the clients it may lead (as the server's canLead says).
const mayLead = new Set(['SYL', 'ANN', 'BAR'])
const trainer = { id: 'TR1', name: 'Tomasz' }
async function trainerRequest(method, p, body) {
  const u = new URL(p, 'http://x'), q = u.searchParams
  const as = body?.as || q.get('as') || q.get('id') || body?.id
  const deny = () => { const e = new Error('no'); e.status = 403; e.data = { code: 'not-allowed' }; throw e }
  if (u.pathname === '/api/gymv2/group/client') { if (!mayLead.has(as)) deny(); return { client: { id: as, name: names[as] }, state: clone(docs[as] || {}), now } }
  if (u.pathname === '/api/live' && method === 'GET') { if (!mayLead.has(as)) deny(); server.seen(as, q.get('dev'), trainer); return server.answer(as, q.get('wid') || '', q.has('since') ? +q.get('since') : null) }
  if (u.pathname === '/api/live/ops') { if (!mayLead.has(as)) deny(); try { return server.push(as, { ...body, actor: trainer }) } catch (e) { const err = new Error(e.message); err.status = e.status; err.data = { code: e.code, ...(e.extra || {}) }; throw err } }
  if (u.pathname === '/api/live/end') { if (!mayLead.has(as)) deny(); return server.end(as, { ...body, actor: trainer }) }
  if (u.pathname === '/api/gymv2/group/save') { if (!mayLead.has(as)) deny(); saved[as] = [...(saved[as] || []), clone(body.workout)]; server.savedInState(as, { workouts: saved[as] }); return { ok: true, saved: true } }
  if (u.pathname === '/api/gymv2/group/poll') {
    const answers = {}
    for (const part of q.get('c').split(',')) { const [id, wid, seq] = part.split(':'); if (!mayLead.has(id)) deny(); answers[id] = server.answer(id, wid, seq === '' ? null : +seq) }
    return { answers, now }
  }
  throw new Error('no route ' + p)
}
const storage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) } }
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)) }
const poll = async G => { const r = await trainerRequest('GET', '/api/gymv2/group/poll?c=' + G.members.map(m => `${m.id}:${m.wid}:${m.seq}`).join(',')); for (const m of G.members) G.members.find(x => x.id === m.id) && r.answers[m.id]?.live && (m.peers = r.answers[m.id].live.peers); return r }

// The client's phone (Sylwester), the app's own live client.
function phone() {
  let state = { S: { workouts: [], active: null, unit: 'kg' }, user: { id: 'SYL' }, config: { gymv2: { on: true, live: true, role: 'member' } }, ready: true }
  const subs = []
  const timers = { setTimeout: fn => { setTimeout(fn, 0); return 1 }, clearTimeout: () => {} }
  const request = async (method, p, body) => {
    const u = new URL(p, 'http://x'), q = u.searchParams
    if (u.pathname === '/api/live/ops') return server.push('SYL', { ...body, actor: null })
    if (u.pathname === '/api/live/end') return server.end('SYL', { ...body, actor: null })
    server.seen('SYL', q.get('dev'), null)
    return server.answer('SYL', q.get('wid') || '', q.has('since') ? +q.get('since') : null)
  }
  const dev = { get: () => state, events: [] }
  dev.update = fn => { const prev = state; const S = clone(state.S); fn(S); state = { ...state, S }; for (const f of subs) f(state, prev) }
  dev.client = createLiveClient({ get: dev.get, update: fn => dev.update(fn), request, now: () => now, storage: storage(), timers, hooks: { adopted: () => dev.events.push('adopted'), finish: () => { dev.events.push('finish'); const A = state.S.active; dev.update(S => { S.workouts.push({ ...A, end: now }); S.active = null }) } } })
  subs.push((s, p) => dev.client.onStore(s, p))
  dev.pull = async () => { const st = dev.client.state; dev.client.receive(await request('GET', `/api/live?dev=${dev.client.dev}${st.attached ? `&wid=${st.wid}&since=${st.seq}` : ''}`)); await settle() }
  return dev
}

describe('group training (three clients, one trainer)', () => {
  it('own workouts, own weights, nothing crosses, the phone sees its own live, the end per person', async () => {
    const G = createGroup({ request: trainerRequest, storage: storage(), now: () => now, build: groupBuild })
    G.stop()
    const syl = phone()
    await G.start([{ id: 'SYL', name: 'Sylwester' }, { id: 'ANN', name: 'Anna' }, { id: 'BAR', name: 'Bartosz' }])
    G.stop()
    await settle()
    expect(G.members.map(m => m.name)).toEqual(['Sylwester', 'Anna', 'Bartosz'])
    expect(new Set(G.members.map(m => m.wid)).size).toBe(3)
    for (const id of ['SYL', 'ANN', 'BAR']) expect(server._load(id).wid).toBe(G.members.find(m => m.id === id).wid)

    // The same exercise (squat 0043) for Sylwester and Anna: each with their own last weight.
    G.addExercise('0043', ['SYL', 'ANN'])
    // A different one for Bartosz.
    G.addExercise('0025', ['BAR'])
    await settle()
    const w = id => G.workoutOf(G.members.find(m => m.id === id))
    expect(w('SYL').entries.map(e => e.id)).toEqual(['0043'])
    expect(w('ANN').entries.map(e => e.id)).toEqual(['0043'])
    expect(w('BAR').entries.map(e => e.id)).toEqual(['0025'])
    expect(w('SYL').entries[0].sets[0].w).toBe(100)
    expect(w('ANN').entries[0].sets[0].w).toBe(50)
    expect(G.lastOf('SYL', '0043')).toMatchObject({ w: 100 })
    expect(G.lastOf('BAR', '0025')).toBe(null)

    // Anna's weight changed: Sylwester's and Bartosz's untouched, on the server too.
    G.change('ANN', A => { A.entries[0].sets[0].w = 52.5 })
    await settle()
    const onServer = id => (await_render(server._load(id)))
    expect(onServer('ANN').entries[0].sets[0].w).toBe(52.5)
    expect(onServer('SYL').entries[0].sets[0].w).toBe(100)
    expect(onServer('BAR').entries[0].id).toBe('0025')

    // Sylwester's phone picks up his workout (not Anna's) and ticks a set; the trainer sees it.
    await syl.pull()
    expect(syl.events).toContain('adopted')
    expect(syl.get().S.active.id).toBe(G.members[0].wid)
    expect(syl.get().S.active.entries[0].sets[0].w).toBe(100)
    now += 1000
    syl.update(S => { Object.assign(S.active.entries[0].sets[0], { done: true, at: now }) })
    syl.client.diffNow(); await syl.client.flush(); await settle()
    const r = await poll(G)
    for (const m of G.members) { const a = r.answers[m.id]?.live; if (a) { if (a.ops) { const { applyOps } = await import('../../../api/gymv2/live-core.js'); applyOps(m.el, a.ops); m.seq = a.seq } } }
    expect(w('SYL').entries[0].sets[0].done).toBe(true)
    expect(w('ANN').entries[0].sets[0].done).toBe(false)

    // A client the trainer may not lead: refused by the server's check, nothing started.
    mayLead.delete('BAR')
    G.change('BAR', A => { A.entries[0].sets[0].w = 1 })
    await settle()
    expect(G.members.find(m => m.id === 'BAR').error).toBe('forbidden')
    expect(onServer('BAR').entries[0].sets[0].w).not.toBe(1)
    mayLead.add('BAR')

    // The end: Sylwester's phone is there -> it saves; Anna has no phone -> saved for her.
    await syl.pull()
    expect(await G.finish('SYL')).toBe('phone')
    await syl.pull()
    expect(syl.events).toContain('finish')
    expect(syl.get().S.workouts.length).toBe(1)
    now += 1000; G.change('ANN', A => { Object.assign(A.entries[0].sets[0], { done: true, at: now }) }); await settle()
    expect(await G.finish('ANN')).toBe('server')
    expect(saved.ANN.length).toBe(1)
    expect(saved.ANN[0].entries[0].sets[0].w).toBe(52.5)
    expect(saved.SYL).toBeUndefined()
    expect(server._load('ANN').ended.how).toBe('saved')
    expect(server._load('BAR').ended).toBe(null)
  })
})

import * as liveCore from '../../../api/gymv2/live-core.js'
function await_render(doc) { return liveCore.render(doc.el, doc.wid) }
