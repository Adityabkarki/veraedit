/**
 * Physics Constant Manifest + layer-depth band checks (skills.md).
 * Mirrors remotion-service/src/motion/components/physics.ts values.
 */
import { describe, it, expect } from 'vitest'
import {
  SPRING_CORPORATE,
  SPRING_PRODUCT,
  SPRING_SOCIAL,
  springForType,
} from '@/lib/motionBlueprints'

describe('Physics Constant Manifest', () => {
  it('locks the three named curves', () => {
    expect(SPRING_SOCIAL).toEqual({ mass: 0.4, stiffness: 180, damping: 12 })
    expect(SPRING_CORPORATE).toEqual({ mass: 1.0, stiffness: 90, damping: 24 })
    expect(SPRING_PRODUCT).toEqual({ mass: 0.7, stiffness: 140, damping: 8 })
  })

  it('maps pillar atoms to the correct curve family', () => {
    expect(springForType('kinetic_karaoke')).toEqual(SPRING_SOCIAL)
    expect(springForType('active_speaker_split')).toEqual(SPRING_CORPORATE)
    expect(springForType('strategy_funnel')).toEqual(SPRING_CORPORATE)
    expect(springForType('device_mockup')).toEqual(SPRING_PRODUCT)
    expect(springForType('dynamic_feature_callout')).toEqual(SPRING_PRODUCT)
  })
})
