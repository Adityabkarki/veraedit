import { describe, it, expect } from 'vitest'
import {
  buildPresetPlan,
  ATOMIC_PRESET_DEFINITIONS,
  resolveAtomicPresetId,
} from '../../../../remotion-service/src/motion/components/presets'
import { PHYSICS_CURVES } from '../../../../remotion-service/src/motion/components/physics'

describe('atomic presets (Step 4)', () => {
  it('builds podcast preset with forced elegant_glide on all nodes', () => {
    const plan = buildPresetPlan('podcast', { durationSeconds: 10 })
    expect(plan.preset).toBe('podcast')
    expect(plan.elements.length).toBeGreaterThanOrEqual(4)
    const types = plan.elements.map((e) => e.type)
    expect(types).toContain('active_speaker_split')
    expect(types).toContain('symmetric_audio_strip')
    const spring = plan.elements[0].animation.spring
    expect(spring).toEqual(PHYSICS_CURVES.elegant_glide)
  })

  it('builds social preset at 9:16 with snappy_spring', () => {
    const plan = buildPresetPlan('social', { durationSeconds: 8 })
    expect(plan.width).toBe(1080)
    expect(plan.height).toBe(1920)
    expect(plan.elements.some((e) => e.type === 'kinetic_karaoke')).toBe(true)
    expect(plan.elements[0].animation.spring).toEqual(PHYSICS_CURVES.snappy_spring)
  })

  it('builds product showcase with elastic_overshoot', () => {
    const plan = buildPresetPlan('product_showcase', { durationSeconds: 12 })
    expect(plan.elements.some((e) => e.type === 'device_mockup')).toBe(true)
    expect(plan.elements[0].animation.spring).toEqual(PHYSICS_CURVES.elastic_overshoot)
  })

  it('consultancy preset suppresses flashy types in definition', () => {
    expect(ATOMIC_PRESET_DEFINITIONS.consultancy.suppressFlashy).toBe(true)
    const plan = buildPresetPlan('consultancy', { durationSeconds: 10 })
    const types = new Set(plan.elements.map((e) => e.type))
    expect(types.has('particle_burst')).toBe(false)
    expect(types.has('strategy_funnel')).toBe(true)
  })

  it('resolves legacy magic ids to atomic preset ids', () => {
    expect(resolveAtomicPresetId('social_reel')).toBe('social')
    expect(resolveAtomicPresetId('product')).toBe('product_showcase')
    expect(resolveAtomicPresetId('pitch')).toBe('consultancy')
  })
})
