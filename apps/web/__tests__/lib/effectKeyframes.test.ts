/**
 * Tests for lib/effectKeyframes.ts
 */

import { describe, it, expect } from 'vitest'
import {
  interpolateKeyframes,
  defaultKeyframes,
  resolveEffectPreviewAt,
  resolveZoomScaleAt,
  activeEffectClipsAt,
} from '@/lib/effectKeyframes'
import type { Clip } from '@/stores/timelineStore'

describe('interpolateKeyframes', () => {
  it('interpolates between two keyframes', () => {
    const kfs = [
      { offset: 0, value: 0 },
      { offset: 2, value: 1 },
    ]
    expect(interpolateKeyframes(kfs, 0)).toBe(0)
    expect(interpolateKeyframes(kfs, 2)).toBe(1)
    expect(interpolateKeyframes(kfs, 1)).toBeCloseTo(0.5)
  })
})

describe('defaultKeyframes', () => {
  it('creates start and end keyframes', () => {
    const kfs = defaultKeyframes(4, 0, 2)
    expect(kfs).toHaveLength(2)
    expect(kfs[0]).toEqual({ offset: 0, value: 0 })
    expect(kfs[1]).toEqual({ offset: 4, value: 2 })
  })
})

describe('resolveEffectPreviewAt', () => {
  const effectClip: Clip = {
    id: 'efx-1',
    trackId: 'effects',
    type: 'effect',
    startTime: 2,
    duration: 4,
    label: 'Warm',
    effects: {
      effectType: 'filter',
      colorFilterCss: 'grayscale(100%)',
      keyframes: defaultKeyframes(4, 0, 1),
    },
  }

  it('finds active effect clips', () => {
    expect(activeEffectClipsAt([effectClip], 3)).toHaveLength(1)
    expect(activeEffectClipsAt([effectClip], 10)).toHaveLength(0)
  })

  it('ramps filter intensity over time', () => {
    const atStart = resolveEffectPreviewAt([effectClip], 2)
    const atMid = resolveEffectPreviewAt([effectClip], 4)
    expect(atStart.filterIntensity).toBe(0)
    expect(atMid.filterIntensity).toBeCloseTo(0.5)
  })

  it('resolves zoom from Effects-track toolbox clip', () => {
    const zoomFx: Clip = {
      id: 'efx-zoom',
      trackId: 'effects',
      type: 'effect',
      startTime: 1,
      duration: 2,
      label: 'Zoom punch',
      effects: {
        effectType: 'transform',
        effectPresetId: 'digital_zoom_punch',
        keyframes: [
          { offset: 0, value: 1 },
          { offset: 1, value: 1.12 },
        ],
      },
    }
    expect(resolveZoomScaleAt([zoomFx], 1)).toBeCloseTo(1)
    expect(resolveZoomScaleAt([zoomFx], 2.99)).toBeCloseTo(1.12)
  })

  it('applies speed keyframes', () => {
    const speedFx: Clip = {
      ...effectClip,
      effects: {
        effectType: 'speed',
        keyframes: defaultKeyframes(4, 1, 2),
      },
    }
    const mid = resolveEffectPreviewAt([speedFx], 4)
    expect(mid.speedMultiplier).toBeCloseTo(1.5)
  })
})
