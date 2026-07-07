import { describe, it, expect } from 'vitest'
import {
  computeVisibleTimeWindow,
  filterClipsToWindow,
  framesFromTimeWindow,
} from '@/lib/editor/timelineWindowing'
import type { Clip } from '@/stores/timelineStore'

function clip(id: string, start: number, duration: number): Clip {
  return {
    id,
    trackId: 'video',
    startTime: start,
    duration,
    label: id,
    type: 'video',
  }
}

describe('timelineWindowing', () => {
  it('computes visible window with prefetch buffer', () => {
    const window = computeVisibleTimeWindow(100, 800, 50, 10)
    expect(window.startSec).toBeGreaterThanOrEqual(0)
    expect(window.endSec).toBeGreaterThan(window.startSec)
  })

  it('filters clips to viewport window', () => {
    const clips = [
      clip('a', 0, 5),
      clip('b', 50, 5),
      clip('c', 200, 5),
    ]
    const visible = filterClipsToWindow(clips, { startSec: 45, endSec: 60 })
    expect(visible.map((c) => c.id)).toEqual(['b'])
  })

  it('maps time window to frame range', () => {
    const { startFrame, endFrame } = framesFromTimeWindow(
      { startSec: 1, endSec: 2 },
      30,
    )
    expect(startFrame).toBe(30)
    expect(endFrame).toBe(60)
  })
})
