/* Habcore Gym (kl15): "Integrations" is always on in the Habcore build and has no switch; a profile that
   switched it off gets it back (lib/habcore-off.js HABCORE_FORCED_MODULES). */
import { describe, expect, it, vi } from 'vitest'

describe('always-on Integrations', () => {
  it('ignores a saved "off" and is left out of the presets\' comparison', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_INTEGRATIONS_FULL', '0')
    const m = await import('./modules.js')
    const off = await import('./habcore-off.js')
    expect(off.HABCORE_FORCED_MODULES).toEqual(['integrations'])
    expect(m.isOn({ modules: { integrations: false } }, 'integrations')).toBe(true)
    const S = {}; m.applyPreset(S, 'training')
    expect(S.modules.integrations).toBe(false)
    expect(m.isOn(S, 'integrations')).toBe(true)
    expect(m.presetOf(S)).toBe('training')
    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
