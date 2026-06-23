/**
 * Tests for lib/motionGraphics.ts
 */

import { describe, it, expect } from 'vitest'
import { isMotionGraphicClip, MOTION_GRAPHIC_DEFAULTS } from '@/lib/motionGraphics'
import type { Clip } from '@/stores/timelineStore'

function overlayClip(visualType: string, extra?: Record<string, unknown>): Clip {
  return {
    id: 'o1',
    trackId: 'overlay',
    startTime: 0,
    duration: 2,
    label: 'Overlay',
    type: 'overlay',
    effects: { visualType, ...extra },
  }
}

describe('isMotionGraphicClip', () => {
  it('detects data_card overlays', () => {
    expect(isMotionGraphicClip(overlayClip('data_card'))).toBe(true)
  })

  it('detects arrow_flow overlays', () => {
    expect(isMotionGraphicClip(overlayClip('arrow_flow'))).toBe(true)
  })

  it('rejects generic statistic overlays', () => {
    expect(isMotionGraphicClip(overlayClip('statistic'))).toBe(false)
  })

  it('rejects b-roll clips', () => {
    expect(
      isMotionGraphicClip({
        ...overlayClip('broll_overlay'),
        trackId: 'broll',
      }),
    ).toBe(false)
  })
})

describe('MOTION_GRAPHIC_DEFAULTS', () => {
  it('uses editable placeholder metric for data cards', () => {
    expect(MOTION_GRAPHIC_DEFAULTS.data_card.displayValue).not.toBe('65,000 CASES')
    expect(MOTION_GRAPHIC_DEFAULTS.data_card.secondaryText).toBe('Metric label')
  })

  it('does not set display text for arrows', () => {
    expect(MOTION_GRAPHIC_DEFAULTS.arrow_flow.displayValue).toBe('')
  })

  it('uses frame dimensions for conflict box', () => {
    expect(MOTION_GRAPHIC_DEFAULTS.conflict_box.widthPct).toBeGreaterThan(0)
    expect(MOTION_GRAPHIC_DEFAULTS.conflict_box.heightPct).toBeGreaterThan(0)
    expect(MOTION_GRAPHIC_DEFAULTS.conflict_box.displayValue).toBe('')
  })
})
