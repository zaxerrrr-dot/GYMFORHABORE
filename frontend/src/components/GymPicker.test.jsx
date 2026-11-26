// @vitest-environment happy-dom
// Habcore Gym (local patch 0006.2): the client picker shows the gym's WHOLE list (who trains now
// and who was led last at the top, then A–Z), searches by name without Polish marks, counts the
// ticked people and stops at 5; "Zapisz jako grupę" saves the group; a saved group starts in one
// tap and is edited and deleted from its own sheet.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const names = ['Bartek', 'Sylwek', 'Ania', 'Łukasz', 'Ewa', 'Marek', 'Zosia', 'Kuba']
const mocks = vi.hoisted(() => ({ calls: [], groups: [], confirm: null, navs: [], toasts: [], led: [] }))
vi.mock('../lib/api.js', () => ({
  api: vi.fn(async (p, o) => {
    const body = o?.body ? JSON.parse(o.body) : null
    mocks.calls.push([p, body])
    if (p === '/api/gymv2/clients') return { clients: names.map((n, i) => ({ id: 'c' + i, name: n, canLead: true, ...(n === 'Ewa' ? { live: { name: 'Nogi', exercises: 1, setsDone: 1, setsTotal: 3 } } : {}) })).concat([{ id: 'x', name: 'Nie-prowadzony', canLead: false }]) }
    if (p === '/api/gymv2/groups' && !body) return { groups: mocks.groups }
    if (p === '/api/gymv2/groups') { const gr = { id: 'g1', name: body.name, members: body.members.map(id => ({ id, name: names[+id.slice(1)] })) }; mocks.groups = [gr]; return { group: gr } }
    if (p === '/api/gymv2/groups/update') { const gr = { ...mocks.groups[0], name: body.name, members: body.members.map(id => ({ id, name: names[+id.slice(1)] })) }; mocks.groups = [gr]; return { group: gr, changed: true } }
    if (p === '/api/gymv2/groups/delete') { mocks.groups = []; return { ok: true } }
    return {}
  }),
  appBase: () => '/', remoteAuth: () => null,
}))
vi.mock('../sheets.jsx', () => ({ confirmSheet: o => { mocks.confirm = o } }))
vi.mock('../lib/nav.js', () => ({ nav: p => mocks.navs.push(p), pathBefore: () => null }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ toast: m => mocks.toasts.push(m), openSheet: () => ({}), closeAll: () => {} }) } }))
vi.mock('../store/useStore.js', () => ({ useStore: () => null }))
vi.mock('../lib/i18n-core.js', async orig => ({ ...(await orig()), getLang: () => 'pl' }))

const { GymPicker, GymGroups, pickerOrder, filterClients, fold, sameMembers, groupNameOf } = await import('./GymPicker.jsx')
let root, host
const btn = re => [...host.querySelectorAll('button')].find(b => re.test(b.textContent.trim()))
const people = sel => [...host.querySelectorAll(sel + ' [data-testid=gp-person]')].map(x => x.dataset.name)
const pick = n => act(() => host.querySelector(`[data-testid=gp-person][data-name="${n}"] input`).click())
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve() }) }
const type = (el, v) => act(() => { const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) })
beforeEach(() => {
  Object.assign(mocks, { calls: [], groups: [], confirm: null, navs: [], toasts: [] })
  localStorage.setItem('gymv2_recent', JSON.stringify(['c6', 'c1']))
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); sessionStorage.clear() })

describe('the order and the search', () => {
  it('live first, then led last, then everyone else A–Z; never whom the trainer may not lead', () => {
    const list = names.map((n, i) => ({ id: 'c' + i, name: n, canLead: true, ...(n === 'Ewa' ? { live: {} } : {}) })).concat([{ id: 'x', name: 'X', canLead: false }])
    const { top, rest } = pickerOrder(list, ['c6', 'c1'])
    expect(top.map(c => c.name)).toEqual(['Ewa', 'Zosia', 'Sylwek'])
    expect(rest.map(c => c.name)).toEqual(['Ania', 'Bartek', 'Kuba', 'Łukasz', 'Marek'])
  })
  it('searches without case and Polish marks, every word', () => {
    const list = [{ name: 'Łukasz Żak' }, { name: 'Ania Nowak' }, { name: 'Lukas Bąk' }]
    expect(fold('ŁUKASZ Żak')).toBe('lukasz zak')
    expect(filterClients(list, 'luk').map(c => c.name)).toEqual(['Łukasz Żak', 'Lukas Bąk'])
    expect(filterClients(list, 'zak luk').map(c => c.name)).toEqual(['Łukasz Żak'])
    expect(filterClients(list, '  ').length).toBe(3)
    expect(sameMembers(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameMembers(['a', 'b'], ['a', 'c'])).toBe(false)
    expect(groupNameOf([{ name: 'Bartek' }, { name: 'Sylwek' }])).toBe('Bartek + Sylwek')
  })
})

describe('the picker sheet', () => {
  it('group: the whole list of 8, search, counter, at most 5, start and save as a group', async () => {
    act(() => root.render(<GymPicker mode="group" close={() => {}} />))
    await flush()
    expect(people('[data-testid=gp-top]')).toEqual(['Ewa', 'Zosia', 'Sylwek'])
    expect(people('[data-testid=gp-rest]')).toEqual(['Ania', 'Bartek', 'Kuba', 'Łukasz', 'Marek'])
    expect(host.querySelector('[data-testid=gp-start]').disabled).toBe(true)
    type(host.querySelector('[data-testid=gp-search]'), 'lukasz')
    expect(people('')).toEqual(['Łukasz'])
    type(host.querySelector('[data-testid=gp-search]'), 'nikt')
    expect(host.querySelector('[data-testid=gp-none]')).toBeTruthy()
    type(host.querySelector('[data-testid=gp-search]'), '')
    pick('Bartek'); pick('Sylwek'); pick('Ania')
    expect(host.querySelector('[data-testid=gp-count]').textContent).toMatch(/Wybrano: 3/)
    pick('Kuba'); pick('Marek')
    expect(host.querySelector('[data-testid=gp-count]').textContent).toMatch(/Wybrano: 5/)
    expect(host.querySelector('[data-testid=gp-person][data-name="Zosia"] input').disabled).toBe(true)
    pick('Marek'); pick('Kuba')
    act(() => host.querySelector('[data-testid=gp-save]').click())
    expect(host.querySelector('[data-testid=gp-group-name]').placeholder).toBe('Bartek + Sylwek + Ania')
    type(host.querySelector('[data-testid=gp-group-name]'), 'Poniedziałek 18:00')
    act(() => host.querySelector('[data-testid=gp-save-confirm]').click())
    await flush()
    expect(mocks.calls.find(c => c[0] === '/api/gymv2/groups' && c[1])[1]).toEqual({ name: 'Poniedziałek 18:00', members: ['c0', 'c1', 'c2'] })
    act(() => host.querySelector('[data-testid=gp-start]').click())
    expect(JSON.parse(sessionStorage.getItem('gymv2_group_start')).map(p => p.name)).toEqual(['Bartek', 'Sylwek', 'Ania'])
    expect(mocks.navs).toEqual(['/grupa'])
  })
  it('one: a tap on any name leads that client (the whole list, not only the card\'s four)', async () => {
    act(() => root.render(<GymPicker mode="one" close={() => {}} />))
    await flush()
    expect(host.querySelectorAll('[data-testid=gp-person]').length).toBe(8)
    expect(host.querySelector('input[type=checkbox]')).toBeNull()
  })
  it('saved groups: start in one tap; edit renames and changes people; delete asks first', async () => {
    mocks.groups = [{ id: 'g1', name: 'Bartek + Sylwek', members: [{ id: 'c0', name: 'Bartek' }, { id: 'c1', name: 'Sylwek' }] }]
    act(() => root.render(<GymGroups />))
    await flush()
    expect(host.querySelector('[data-testid=gym-group]').textContent).toMatch(/Bartek \+ Sylwek.*Bartek, Sylwek/)
    act(() => host.querySelector('[data-testid=gym-group-start]').click())
    expect(JSON.parse(sessionStorage.getItem('gymv2_group_start')).map(p => p.id)).toEqual(['c0', 'c1'])
    act(() => root.render(<GymPicker mode="edit" group={mocks.groups[0]} close={() => {}} />))
    await flush()
    expect(host.querySelector('[data-testid=gp-person][data-name="Bartek"] input').checked).toBe(true)
    type(host.querySelector('[data-testid=gp-group-name]'), 'Wtorek')
    pick('Sylwek'); pick('Ewa')
    act(() => host.querySelector('[data-testid=gp-save-confirm]').click())
    await flush()
    expect(mocks.calls.find(c => c[0] === '/api/gymv2/groups/update')[1]).toEqual({ id: 'g1', name: 'Wtorek', members: ['c0', 'c4'] })
    act(() => host.querySelector('[data-testid=gp-delete]').click())
    expect(mocks.confirm.title).toMatch(/Usunąć grupę/)
    await act(async () => { mocks.confirm.onConfirm() })
    await flush()
    expect(mocks.calls.at(-1)).toEqual(['/api/gymv2/groups/delete', { id: 'g1' }])
  })
})
