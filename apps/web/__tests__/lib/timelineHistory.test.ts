import { describe, it, expect } from 'vitest'
import {
  applyTimelinePatch,
  computeTimelinePatch,
} from '@/lib/editor/timelineHistory'
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

describe('timelineHistory', () => {
  it('round-trips forward and inverse patch', () => {
    const before = [clip('a', 0, 5), clip('b', 10, 5)]
    const after = [clip('a', 2, 5), clip('c', 20, 3)]
    const patch = computeTimelinePatch(before, after)
    const undone = applyTimelinePatch(after, [], patch, 'inverse')
    expect(undone.clips).toEqual(before)
    const redone = applyTimelinePatch(before, [], patch, 'forward')
    expect(redone.clips).toEqual(after)
  })

  it('stores track changes in patch', () => {
    const patch = computeTimelinePatch([], [], [{ id: 'video', label: 'Video', color: '#000', muted: false, locked: false, visible: true }], [{ id: 'video', label: 'Video', color: '#111', muted: false, locked: false, visible: true }])
    expect(patch.tracksBefore?.[0]?.color).toBe('#000')
    expect(patch.tracksAfter?.[0]?.color).toBe('#111')
  })
})
