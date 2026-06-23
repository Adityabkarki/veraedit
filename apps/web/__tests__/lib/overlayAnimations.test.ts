import { describe, it, expect } from 'vitest'
import { computeOverlayMotion, defaultEntranceForVisualType } from '@/lib/overlayAnimations'
import type { Clip } from '@/stores/timelineStore'

function clip(partial: Partial<Clip> & Pick<Clip, 'id'>): Clip {
  return {
    trackId: 'overlay',
    startTime: 0,
    duration: 4,
    label: 'Test',
    type: 'overlay',
    ...partial,
  }
}

describe('overlayAnimations', () => {
  it('defaults data card entrance to slide in', () => {
    expect(defaultEntranceForVisualType('data_card')).toBe('slide_in_up')
  })

  it('fades in at clip start', () => {
    const c = clip({
      id: 'a',
      effects: { visualType: 'data_card', overlayEntrance: 'fade_in', overlayExit: 'none' },
    })
    const start = computeOverlayMotion(c, 0)
    expect(start.opacity).toBeLessThan(0.2)
    const mid = computeOverlayMotion(c, 2)
    expect(mid.opacity).toBe(1)
  })

  it('slides out near clip end', () => {
    const c = clip({
      id: 'b',
      effects: { visualType: 'cta', overlayEntrance: 'none', overlayExit: 'slide_out_left' },
    })
    const end = computeOverlayMotion(c, 3.95)
    expect(end.opacity).toBeLessThan(0.5)
    expect(end.motionTransform).toContain('translate')
  })
})
