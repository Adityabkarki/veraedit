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
  motionPlanToClipPayloads,
} from '@/lib/motionGraphicsLibrary'

describe('motionGraphicsLibrary', () => {
  it('registers 60+ pro component types across packages', () => {
    expect(MOTION_GRAPHICS_LIBRARY.length).toBeGreaterThanOrEqual(60)
    expect(MOTION_GRAPHIC_PRO_TYPES.size).toBeGreaterThanOrEqual(60)
    for (const t of [
      'guest_intro', 'eq_visualizer', 'broadcast_lower_third', 'subscribe_badge',
      'device_mockup', 'pie_chart', 'funnel_chart', 'corporate_timeline',
      'glass_card', 'liquid_blob', 'karaoke_caption', 'glitch_overlay',
      'whip_transition', 'split_screen', 'hud_grid', 'geometric_pattern',
    ]) {
      expect(isMotionGraphicProType(t)).toBe(true)
    }
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

  it('buildMotionGraphicClipEffects includes motion props and spring', () => {
    const fx = buildMotionGraphicClipEffects('stat_counter', '#FF0000')
    expect(fx.visualType).toBe('stat_counter')
    expect(fx.motionEnter).toBeTruthy()
    expect(fx.motionProps).toBeDefined()
    expect((fx.motionProps as Record<string, unknown>).brandColor).toBe('#FF0000')
    expect(fx.motionSpring).toBeDefined()
    expect(fx.motionAnimation).toBeDefined()
  })

  it('motionPlanToClipPayloads maps director plan to clips', () => {
    const payloads = motionPlanToClipPayloads(
      {
        elements: [
          {
            id: 'mg-1',
            type: 'bar_chart',
            startSeconds: 2,
            endSeconds: 6,
            position: { xPct: 50, yPct: 48 },
            animation: { enter: 'grow', exit: 'fade', spring: { damping: 12 } },
            props: { title: 'Growth', labels: ['A', 'B'], values: [10, 20] },
          },
          {
            id: 'mg-skip',
            type: 'not_real',
            startSeconds: 0,
            endSeconds: 1,
          },
        ],
      },
      '#112233',
    )
    expect(payloads).toHaveLength(1)
    expect(payloads[0].id).toBe('mg-1')
    expect(payloads[0].startTime).toBe(2)
    expect(payloads[0].duration).toBe(4)
    expect(payloads[0].effects.visualType).toBe('bar_chart')
    expect((payloads[0].effects.motionProps as Record<string, unknown>).title).toBe('Growth')
  })
})
