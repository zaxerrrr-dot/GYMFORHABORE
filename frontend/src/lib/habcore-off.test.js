// Habcore Gym (patch 0013): without the build variables the AI Coach, the Zepp page and Gym check-in
// are not there at all. The suite runs with them on (vite.config.js), so this turns them off itself.
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('a Habcore build without AI, Zepp and check-in', () => {
  it('has neither module, no Coach anywhere, no Zepp page and no "Use your subscription"', async () => {
    vi.stubEnv('VITE_AI_COACH', ''); vi.stubEnv('VITE_ZEPP', ''); vi.stubEnv('VITE_CHECKIN', ''); vi.stubEnv('VITE_INTEGRATIONS_FULL', '')
    vi.resetModules()
    const off = await import('./habcore-off.js')
    expect(off.HABCORE_OFF_MODULES).toEqual(['coach', 'checkin'])
    const { isOn, moduleBuilt, setUnavailableModules } = await import('./modules.js')
    for (const id of ['coach', 'checkin']) { expect(isOn({ modules: { [id]: true } }, id)).toBe(false); expect(moduleBuilt(id)).toBe(false) }
    setUnavailableModules([])   // the offline switch going off never brings them back
    expect(moduleBuilt('coach')).toBe(false)
    expect(isOn({}, 'watch')).toBe(true)
    const { coachAvailable } = await import('./coach.js')
    expect(coachAvailable({ coach: { enabled: true } }, { id: 'u' }, { mobile: true, coachMode: 'byok' })).toBe(false)
    const { pageVisible, searchSettings } = await import('../views/settings-pages.js')
    const ctx = { user: { id: 'u' }, mobile: true, ios: true, mod: id => isOn({}, id) }
    expect(pageVisible('zepp', ctx)).toBe(false)
    expect(pageVisible('coach', ctx)).toBe(false)
    expect(pageVisible('garmin', ctx)).toBe(true)
    if (searchSettings) expect(searchSettings('subscription', ctx).some(h => h.route === '/assistants')).toBe(false)
    const offTitles = ['Back up to WebDAV', 'WebDAV backup', 'Webhooks', 'MCP server', 'Strava', 'openNutrition', 'AI Coach', 'Use your subscription', 'API tokens']
    for (const q of ['webdav', 'webhook', 'mcp', 'strava', 'nutrition', 'coach', 'token']) expect(searchSettings(q, { ...ctx, mobile: false }).map(h => h.title).filter(x => offTitles.includes(x)), q).toEqual([])
    // Integrations: the health stores, Hevy, files, CSV and the calendar stay; nothing else.
    const { directory } = await import('./integrations.js')
    const ids = directory({ user: { id: 'u' }, calendarOn: true, mod: () => true, offered: [], health: null, platform: null }).flatMap(c => c.cards.map(x => x.id))
    for (const gone of ['strava', 'webdav', 'webhook', 'coach', 'mcp', 'opennutrition']) expect(ids).not.toContain(gone)
    expect(ids).toEqual(expect.arrayContaining(['hevy', 'files', 'csv', 'calendar']))
  })
})
