// What every shared picture of openGym has in common: the two formats, the light and dark looks
// and the logo in the corner. Pure drawing, no DOM: the workout card (lib/workout-card.js, after a
// workout and in History) and Your year (lib/wrapped-cards.js) both paint with it, and
// lib/share-image.js gets the picture out of the app. No exercise picture or clip is ever drawn
// on a card (the licence keeps those inside the app, NOTICE.md).

import { inkIn } from './accent.js'
// Local patch: the cards carry the kinkylocked.com logo instead of the openGym lockup. White
// lettering for dark paper, the same artwork recoloured dark (same alpha) for light paper. Both are
// hashed assets of the build, so they follow the base path and the service worker caches them.
import LOGO_LIGHT_URL from '../brand/kinkylocked-logo-light.png'
import LOGO_DARK_URL from '../brand/kinkylocked-logo-dark.png'

// 9:16 for Stories and Reels, 1:1 for a feed or a chat.
export const FORMATS = { story: { width: 1080, height: 1920 }, square: { width: 1080, height: 1080 } }
export const FORMAT_IDS = Object.keys(FORMATS)
export const STYLE_IDS = ['dark', 'light']
export const SITE = 'kinkylocked.com'

// The logo's trimmed artwork is 841×480.
export const LOGO_ASPECT = 841 / 480
const logos = { light: null, dark: null }
let logosReady = null
/** Resolves once both logo pictures are decoded (or failed: a card then goes out without one).
 *  Started as soon as this module loads in a browser, so it is normally done before Share. */
export function brandReady() {
  if (logosReady) return logosReady
  if (typeof Image === 'undefined') return (logosReady = Promise.resolve(false))
  const load = (key, url) => new Promise(resolve => {
    const img = new Image()
    img.onload = () => { logos[key] = img; resolve(true) }
    img.onerror = () => resolve(false)
    img.src = url
  })
  logosReady = Promise.all([load('light', LOGO_LIGHT_URL), load('dark', LOGO_DARK_URL)]).then(r => r.every(Boolean))
  return logosReady
}
if (typeof window !== 'undefined' && typeof Image !== 'undefined') brandReady()

// Relative luminance of a colour, 0 (black) to 1 (white).
const luminance = c => {
  const [r, g, b] = (parseColor(c) || [0, 0, 0]).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Which logo reads on paper `bg`: the dark one on light paper, the white one on everything else. */
export const logoFor = bg => (parseColor(bg) && luminance(bg) > 0.4 ? 'dark' : 'light')

/** The logo `h` high, its left edge at x, centred on cy; `variant` 'light' (white) or 'dark'. */
export function drawLogo(ctx, x, cy, h, variant = 'light') {
  const img = logos[variant] || logos.light
  if (!img) return 0
  const w = h * LOGO_ASPECT
  ctx.drawImage(img, x, cy - h / 2, w, h)
  return w
}

/**
 * The colours of a card, the app's own (index.css) in a fixed light or dark look, whatever the
 * app shows right now. `acc` is the accent, as a hex or rgb colour; on light paper a bright accent
 * is too faint to read as text, so text in the accent (`accText`) is the accent darkened there.
 */
// "#rgb", "#rrggbb", "rgb(…)" or "rgba(…)" as [r, g, b, a]; null for anything else.
export function parseColor(value) {
  const s = String(value || '').trim()
  let m = s.match(/^#([0-9a-f]{3,8})$/i)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return null
    const n = i => parseInt(h.slice(i, i + 2), 16)
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1]
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i)
  if (!m) return null
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(p => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)))
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
}
// CSS color-mix(in srgb, a p%, b): p of `a` over the rest of `b`, as an rgb() string. A canvas
// is handed plain rgb, so the card does not depend on how a WebView parses color-mix().
export function mixColor(a, b, p) {
  const x = parseColor(a)
  const y = parseColor(b)
  if (!x || !y) return x ? a : b
  const ch = i => Math.round(x[i] * p + y[i] * (1 - p))
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`
}

// The accent as words on a light card: the accent darkened by 38 %, as before, while that reads at
// 4.5:1 on the card's page and tiles; a lighter accent (the brand's #a3e635, a yellow, a pastel of
// the user's own) keeps going down its own hue until it does (lib/accent.js inkIn, 1.4.5).
export function accTextOnLight(a) {
  const mixed = mixColor(a, '#000000', 0.62)
  if (contrast(mixed, '#f2f2f7') >= 4.5 && contrast(mixed, '#ffffff') >= 4.5) return mixed
  const p = parseColor(a)
  const hex = p ? '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('') : null
  return hex ? inkIn(hex, 'light') : mixed
}

export function cardPalette(style, acc = BRAND.green) {
  const light = style === 'light'
  const a = parseColor(acc) ? acc : BRAND.green
  return light
    ? { bg: '#f2f2f7', surface: '#ffffff', tile: '#f2f2f7', label: '#000000', label2: '#6c6c70', acc: a, accText: accTextOnLight(a), sep: '#e5e5ea', light: true }
    : { bg: '#000000', surface: '#1c1c1e', tile: '#2c2c2e', label: '#ffffff', label2: '#98989f', acc: a, accText: a, sep: '#38383a', light: false }
}

// The brand mark (assets/logo/opengym-mark.svg) on its own 352×174 grid, centred on 0,0. Square
// corners and these exact proportions: the logo is not ours to restyle per card.
const MARK = [[-176, -14, 352, 28], [-176, -57, 36, 114], [-125, -87, 47, 174], [78, -87, 47, 174], [140, -57, 36, 114]]
export const MARK_ASPECT = 352 / 174
export const BRAND = { green: '#a3e635', ink: '#0c0e12', light: '#eef1f6', dark: '#12151b' }

/** The logo mark, `h` high, its left edge at x, centred on y. */
export function drawMark(ctx, x, y, h, color = BRAND.green) {
  const s = h / 174
  ctx.save()
  ctx.translate(x + 176 * s, y)
  ctx.scale(s, s)
  ctx.fillStyle = color
  for (const [rx, ry, rw, rh] of MARK) ctx.fillRect(rx, ry, rw, rh)
  ctx.restore()
}

// WCAG contrast between two colours, 1 to 21.
function contrast(a, b) {
  const L = (c) => {
    const [r, g, bl] = (parseColor(c) || [0, 0, 0]).map((v) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [L(a), L(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * On a coloured card where the brand green can't be seen (a green or yellow one), the logo sits on
 * its own dark badge. White and pale grey paper keep the official light logo, as in assets/logo.
 */
export function brandNeedsBadge(bg) {
  const c = parseColor(bg || '#000') || [0, 0, 0]
  const [mx, mn] = [Math.max(c[0], c[1], c[2]), Math.min(c[0], c[1], c[2])]
  const sat = mx ? (mx - mn) / mx : 0
  return sat > 0.2 && contrast(BRAND.green, bg) < 2.2
}

/**
 * The footer every card ends with: the kinkylocked.com logo (local patch; it was the openGym
 * lockup) and the site at the other end. `y` is the text's baseline.
 * Drawn left to right whatever the language: it is a logo, and a logo does not mirror.
 */
// `badge`: the lockup on its dark badge whatever the paper, for a card that has no paper of its
// own: a photo behind it, or a see-through PNG laid over one later (TestFlight 11-08: the logo
// on a photo read as see-through). The badge is solid BRAND.ink, never a tint.
export function drawBrand(ctx, { x, y, width, colors, family, size = 40, badge: forceBadge = false }) {
  // The kinkylocked.com logo in the room the lockup had: as high as the lockup's badge box
  // (brandBadgeBox), centred where the lockup was, its aspect ratio kept.
  const markH = size * 1.07
  const padY = size * 0.28
  const boxH = markH + padY * 2
  const cy = y - size * 0.36
  const badge = forceBadge || !colors.bg || brandNeedsBadge(colors.bg)
  ctx.direction = 'ltr'
  ctx.textAlign = 'left'
  if (badge) {
    // On a photo or a coloured card: the white logo on its own solid dark badge.
    const padX = size * 0.5
    const logoH = boxH - padY * 1.2
    ctx.fillStyle = BRAND.ink
    roundRect(ctx, x, cy - boxH / 2, logoH * LOGO_ASPECT + padX * 2, boxH, size * 0.3)
    ctx.fill()
    drawLogo(ctx, x + padX, cy, logoH, 'light')
  } else {
    drawLogo(ctx, x, cy, boxH, logoFor(colors.bg))
  }
  ctx.font = `600 ${Math.round(size * 0.72)}px ${family}`
  ctx.fillStyle = colors.label2
  ctx.textAlign = 'right'
  ctx.fillText(SITE, x + width, y)
  ctx.textAlign = 'left'
}

/** The box the lockup's badge covers for a baseline at `y` and type `size` (as drawBrand draws
 *  it), so layouts can keep everything else clear of it. Its width is an estimate (no canvas). */
export function brandBadgeBox(x, y, size = 40) {
  const markH = size * 1.07, padY = size * 0.28
  const top = y - size * 0.36 - markH / 2 - padY
  return { x, y: top, w: markH * MARK_ASPECT + size * 0.2 + size * 3.6 + size, h: markH + padY * 2 }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

