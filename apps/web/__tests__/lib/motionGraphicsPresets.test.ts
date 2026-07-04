import { describe, it, expect } from 'vitest'
import { MAGIC_PRESETS, recommendMagicPreset } from '@/lib/motionGraphicsPresets'

describe('motionGraphicsPresets', () => {
  it('includes one-tap packages for non-editors', () => {
    expect(MAGIC_PRESETS.length).toBeGreaterThanOrEqual(10)
    const ids = MAGIC_PRESETS.map((p) => p.id)
    expect(ids).toContain('auto')
    expect(ids).toContain('podcast')
    expect(ids).toContain('interview')
    expect(ids).toContain('pitch')
    expect(ids).toContain('launch')
    expect(ids).toContain('minimal')
    expect(MAGIC_PRESETS.filter((p) => p.featured).length).toBeGreaterThanOrEqual(6)
  })

  it('recommends product launch from transcript keywords', () => {
    expect(
      recommendMagicPreset([{ text: 'We are launching our new product app today' }]),
    ).toBe('launch')
  })

  it('recommends interview for guest podcast language', () => {
    expect(
      recommendMagicPreset([{ text: 'Welcome to the podcast interview with our guest' }]),
    ).toBe('interview')
  })

  it('recommends auto when transcript is empty', () => {
    expect(recommendMagicPreset([])).toBe('auto')
  })
})
