// Habcore Gym (local patch 0006): the brand accent is the Habcore logo's red, in both themes
// readable as a fill under white text, and as text on the page and on a card (index.css).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { contrast, accentPair, DEFAULT_ACCENT, NEW_ACCENT } from './accent.js'
import { ACCENTS } from './format.js'

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const rule = sel => { const m = css.match(new RegExp(sel.replace(/[[\]"()]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : '' }
const v = (body, name) => (body.match(new RegExp(name + ':\\s*(#[0-9a-f]{6})', 'i')) || [])[1]

describe('the Habcore red accent', () => {
  it('is the default everywhere and the logo red', () => {
    expect(DEFAULT_ACCENT).toBe('brand')
    expect(NEW_ACCENT).toBe('brand')
    expect(ACCENTS.brand).toBe('#ba1a18')
    expect(accentPair('brand')).toEqual({ accent: '#ba1a18', ink: '#ffffff' })
  })
  it('dark theme: a fill that stands out on black and on a card, white text on it, red words at 4.5:1', () => {
    const d = rule(':root[data-accent="brand"]')
    const acc = v(d, '--acc'), acc2 = v(d, '--acc-2'), ink = v(d, '--acc-ink')
    expect(v(d, '--on-acc').toLowerCase()).toBe('#ffffff')
    for (const bg of ['#000000', '#1c1c1e']) {
      expect(contrast(acc, bg)).toBeGreaterThanOrEqual(3)
      expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast(acc, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(acc2, '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })
  it('light theme: the logo red itself, white text on it, red words at 4.5:1 on the page and a card', () => {
    const l = rule(':root[data-theme="light"][data-accent="brand"]')
    const acc = v(l, '--acc')
    expect(acc).toBe('#ba1a18')
    expect(contrast(acc, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(v(l, '--acc-2'), '#ffffff')).toBeGreaterThanOrEqual(4.5)
    const ink = (css.match(/:root\[data-theme="light"\]\[data-accent="brand"\] \{ --acc-ink:(#[0-9a-f]{6}) \}/) || [])[1]
    for (const bg of ['#f2f2f7', '#ffffff']) expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
