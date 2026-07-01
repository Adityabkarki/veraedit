import { describe, it, expect } from 'vitest'
import {
  applySourceCutsToTimeline,
  cutsToKeepSegments,
  mapSourceTimeToEdited,
} from '@/lib/avCutUtils'
import type { Clip } from '@/stores/timelineStore'

function timelineVideoDurationFromClips(clips: Clip[]): number {
  const video = clips.filter((c) => c.trackId === 'video')
  if (video.length === 0) return 0
  return Math.max(...video.map((c) => c.startTime + c.duration))
}

function singleVideoClip(duration: number): Clip[] {
  return [
    {
      id: 'main',
      trackId: 'video',
      startTime: 0,
      duration,
      label: 'Main',
      type: 'video',
      sourceStart: 0,
      sourceEnd: duration,
    },
    {
      id: 'main-audio',
      trackId: 'audio',
      startTime: 0,
      duration,
      label: 'Audio',
      type: 'audio',
      sourceStart: 0,
      sourceEnd: duration,
    },
  ]
}

describe('avCutUtils', () => {
  it('inverts cuts into keep segments', () => {
    const keep = cutsToKeepSegments(116, [{ start: 5, end: 10 }, { start: 50, end: 55 }])
    expect(keep).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 50 },
      { start: 55, end: 116 },
    ])
  })

  it('splits a single clip and shortens timeline duration', () => {
    const next = applySourceCutsToTimeline(singleVideoClip(116), [{ start: 5, end: 10 }])
    expect(timelineVideoDurationFromClips(next)).toBeCloseTo(111, 1)
    const video = next.filter((c) => c.trackId === 'video')
    expect(video).toHaveLength(2)
    expect(video[0]).toMatchObject({ startTime: 0, duration: 5, sourceStart: 0, sourceEnd: 5 })
    expect(video[1]).toMatchObject({
      startTime: 5,
      duration: 106,
      sourceStart: 10,
      sourceEnd: 116,
    })
  })

  it('maps source time across a removed middle gap', () => {
    const cuts = [{ start: 5, end: 10 }]
    expect(mapSourceTimeToEdited(3, cuts)).toBe(3)
    expect(mapSourceTimeToEdited(12, cuts)).toBe(7)
    expect(mapSourceTimeToEdited(7, cuts)).toBe(5)
  })

  it('removes multiple filler ranges from a 116s video', () => {
    const cuts = [
      { start: 2, end: 3 },
      { start: 20, end: 22 },
      { start: 80, end: 81.5 },
    ]
    const next = applySourceCutsToTimeline(singleVideoClip(116), cuts)
    expect(timelineVideoDurationFromClips(next)).toBeCloseTo(116 - 4.5, 1)
  })
})
