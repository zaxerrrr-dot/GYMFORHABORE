// @vitest-environment happy-dom
// Habcore Gym (local patch 0006): the "Add to Home Screen" hint is for iPhone / iPad browsers only,
// never in the installed web app.
import { describe, expect, it } from 'vitest'
import { installKind } from './InstallHint.jsx'

const win = (standalone = false) => ({ matchMedia: q => ({ matches: standalone && q.includes('standalone') }) })
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_OS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36'

describe('installKind', () => {
  it('iPhone Safari, iPad (desktop-class Safari with touch), Chrome on iOS', () => {
    expect(installKind({ userAgent: IPHONE, maxTouchPoints: 5 }, win())).toEqual({ device: 'iphone', browser: 'safari' })
    expect(installKind({ userAgent: IPAD_OS, maxTouchPoints: 5 }, win())).toEqual({ device: 'ipad', browser: 'safari' })
    expect(installKind({ userAgent: CHROME_IOS, maxTouchPoints: 5 }, win())).toEqual({ device: 'iphone', browser: 'Chrome' })
  })
  it('not on a Mac, not on Android, not when installed', () => {
    expect(installKind({ userAgent: IPAD_OS, maxTouchPoints: 0 }, win())).toBe(null)
    expect(installKind({ userAgent: ANDROID, maxTouchPoints: 5 }, win())).toBe(null)
    expect(installKind({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true }, win())).toBe(null)
    expect(installKind({ userAgent: IPHONE, maxTouchPoints: 5 }, win(true))).toBe(null)
  })
})
