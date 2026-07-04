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
    expect(blueprintFamily('kinetic_karaoke')).toBe('social')
    expect(blueprintFamily('eq_visualizer')).toBe('corporate')
    expect(blueprintFamily('line_chart')).toBe('corporate')
    expect(blueprintFamily('device_mockup')).toBe('product')
  })

  it('uses Physics Constant Manifest springs', () => {
    expect(SPRING_SOCIAL).toEqual({ mass: 0.4, damping: 12, stiffness: 180 })
    expect(SPRING_CORPORATE).toEqual({ mass: 1.0, damping: 24, stiffness: 90 })
    expect(springForType('kinetic_karaoke').damping).toBe(SPRING_SOCIAL.damping)
    expect(springForType('corporate_timeline').damping).toBe(SPRING_CORPORATE.damping)
    expect(springForType('device_mockup').stiffness).toBe(140)
  })

  it('adds Devanagari line-height safety and content-box padding', () => {
    const ne = textLayerStyle('नमस्ते')
    const en = textLayerStyle('Hello')
    expect(ne.lineHeight).toBe(1.55)
    expect(en.lineHeight).toBe(1.25)
    expect(ne.boxSizing).toBe('content-box')
    expect(ne.paddingTop).toBe('0.25em')
    expect(ne.paddingBottom).toBe('0.25em')
    expect(String(ne.fontFamily)).toContain('Noto Sans Devanagari')
  })
})
