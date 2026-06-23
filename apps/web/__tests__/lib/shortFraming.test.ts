/**
 * Tests for lib/shortFraming.ts
 */

import { describe, it, expect } from 'vitest'
import {
  shortPreviewObjectPosition,
  shortPreviewScale,
  shortCropFilter,
  framingFromReframe,
  labelForPan,
  DEFAULT_SHORT_FRAMING,
} from '@/lib/shortFraming'

describe('shortFraming', () => {
  it('maps panX to CSS object-position', () => {
    expect(shortPreviewObjectPosition(0)).toBe('0% center')
    expect(shortPreviewObjectPosition(0.5)).toBe('50% center')
    expect(shortPreviewObjectPosition(1)).toBe('100% center')
    expect(shortPreviewObjectPosition(1.5)).toBe('100% center')
  })

  it('applies speaker_track preview zoom', () => {
    expect(shortPreviewScale('speaker_track')).toBe(1.05)
    expect(shortPreviewScale('center_crop')).toBe(1)
  })

  it('builds FFmpeg crop filter with pan position', () => {
    const left = shortCropFilter(0)
    expect(left).toContain('crop=ih*9/16:ih:(iw-ih*9/16)*0.0000:0')
    const center = shortCropFilter(0.5)
    expect(center).toContain('*0.5000:0')
    expect(center).toContain('scale=1080:1920')
  })

  it('derives framing from API reframe metadata', () => {
    expect(framingFromReframe(undefined)).toEqual(DEFAULT_SHORT_FRAMING)
    const framed = framingFromReframe({ strategy: 'speaker_track' })
    expect(framed.panX).toBe(0.5)
    expect(framed.mode).toBe('auto')
    expect(framed.reframeStrategy).toBe('speaker_track')
  })

  it('labels pan positions', () => {
    expect(labelForPan(0)).toBe('Left')
    expect(labelForPan(0.5)).toBe('Center')
    expect(labelForPan(1)).toBe('Right')
    expect(labelForPan(0.35)).toBe('Custom')
  })
})
