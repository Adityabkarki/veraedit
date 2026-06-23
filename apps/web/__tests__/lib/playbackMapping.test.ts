import { describe, it, expect } from 'vitest'
import {
  timelineToSourceTime,
  sourceTimeToTimeline,
  activeVideoClipAt,
  advanceSourceAtClipBoundary,
  timelineVideoDuration,
} from '@/lib/playbackMapping'
import type { Clip } from '@/stores/timelineStore'

function pacedClips(): Clip[] {
  return [0, 2, 4, 6, 8].map((start) => ({
    id: `clip-pace-${start}`,
    trackId: 'video',
    startTime: start,
    duration: 2,
    label: `Cut ${start / 2 + 1}`,
    type: 'video' as const,
    sourceStart: start,
    sourceEnd: start + 2,
    speed: 1,
  }))
}

describe('playbackMapping', () => {
  it('maps timeline time to source time 1:1 for paced clips', () => {
    const clips = pacedClips()
    expect(timelineToSourceTime(clips, 0)).toBe(0)
    expect(timelineToSourceTime(clips, 3)).toBe(3)
    expect(timelineToSourceTime(clips, 9)).toBe(9)
  })

  it('maps source time back to timeline time', () => {
    const clips = pacedClips()
    expect(sourceTimeToTimeline(clips, 0)).toBe(0)
    expect(sourceTimeToTimeline(clips, 3)).toBe(3)
    expect(sourceTimeToTimeline(clips, 5)).toBe(5)
  })

  it('finds active clip at timeline boundary', () => {
    const clips = pacedClips()
    expect(activeVideoClipAt(clips, 1.5)?.id).toBe('clip-pace-0')
    expect(activeVideoClipAt(clips, 2)?.id).toBe('clip-pace-2')
  })

  it('does not advance across contiguous paced clips', () => {
    const clips = pacedClips()
    expect(advanceSourceAtClipBoundary(clips, 2.0)).toBeNull()
    expect(advanceSourceAtClipBoundary(clips, 1.9)).toBeNull()
  })

  it('computes timeline duration from video clips', () => {
    expect(timelineVideoDuration(pacedClips())).toBe(10)
  })
})
