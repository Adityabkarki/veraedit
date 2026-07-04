/**
 * Tests for lib/motionGraphicsLibrary.ts
 */

import { describe, it, expect } from 'vitest'
import {
  MOTION_GRAPHICS_LIBRARY,
  MOTION_GRAPHIC_PRO_TYPES,
  buildMotionGraphicClipEffects,
  getMotionGraphicDef,
  isMotionGraphicProType,
} from '@/lib/motionGraphicsLibrary'

describe('motionGraphicsLibrary', () => {
  it('registers 12 pro component types', () => {
    expect(MOTION_GRAPHICS_LIBRARY.length).toBeGreaterThanOrEqual(12)
    expect(MOTION_GRAPHIC_PRO_TYPES.size).toBeGreaterThanOrEqual(12)
  })

  it('detects pro types', () => {
    expect(isMotionGraphicProType('animated_title')).toBe(true)
    expect(isMotionGraphicProType('data_card')).toBe(false)
  })

  it('returns definition by type', () => {
    const def = getMotionGraphicDef('kinetic_text')
    expect(def?.label).toBe('Kinetic Text')
    expect(def?.animations.enter.length).toBeGreaterThan(0)
  })

  it('buildMotionGraphicClipEffects includes motion props', () => {
    const fx = buildMotionGraphicClipEffects('stat_counter', '#FF0000')
    expect(fx.visualType).toBe('stat_counter')
    expect(fx.motionEnter).toBeTruthy()
    expect(fx.motionProps).toBeDefined()
    expect((fx.motionProps as Record<string, unknown>).brandColor).toBe('#FF0000')
  })
})
