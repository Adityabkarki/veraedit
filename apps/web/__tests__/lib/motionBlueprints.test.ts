import { describe, it, expect } from 'vitest'
import {
  SPRING_CORPORATE,
  SPRING_SOCIAL,
  blueprintFamily,
  springForType,
  textLayerStyle,
} from '@/lib/motionBlueprints'

describe('motionBlueprints', () => {
  it('assigns distinct families', () => {
    expect(blueprintFamily('eq_visualizer')).toBe('social')
    expect(blueprintFamily('line_chart')).toBe('corporate')
    expect(blueprintFamily('device_mockup')).toBe('product')
  })

  it('uses different spring physics per family', () => {
    expect(springForType('eq_visualizer').damping).toBe(SPRING_SOCIAL.damping)
    expect(springForType('corporate_timeline').damping).toBe(SPRING_CORPORATE.damping)
    expect(springForType('eq_visualizer').damping).not.toBe(
      springForType('line_chart').damping,
    )
  })

  it('adds Devanagari line-height safety', () => {
    const ne = textLayerStyle('नमस्ते')
    const en = textLayerStyle('Hello')
    expect(ne.lineHeight).toBe(1.55)
    expect(en.lineHeight).toBe(1.25)
    expect(String(ne.fontFamily)).toContain('Noto Sans Devanagari')
  })
})
