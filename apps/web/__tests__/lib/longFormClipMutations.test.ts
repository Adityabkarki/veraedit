/**
 * Long-form clip mutation integration tests (Phase 15).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useTimelineStore, type Clip } from '@/stores/timelineStore'
import { commitTimelineClips, getFullTimelineClips } from '@/lib/editor/timelineClipUpdates'
import { computeTimelinePatch, applyTimelinePatch } from '@/lib/editor/timelineHistory'

function makeClips(count: number): Clip[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    trackId: 'video',
    startTime: i * 10,
    duration: 8,
    label: `Clip ${i}`,
    type: 'video' as const,
  }))
}

beforeEach(() => {
  useTimelineStore.getState().resetTimeline()
})

describe('long-form clip mutations', () => {
  it('commitClipsUpdate keeps allClips in sync when longFormMode', () => {
    const all = makeClips(200)
    useTimelineStore.setState({
      longFormMode: true,
      allClips: all,
      totalDurationSec: 2000,
      clips: all.slice(0, 5),
      scrollX: 0,
      viewportWidthPx: 800,
      pixelsPerSecond: 50,
    })

    commitTimelineClips((clips) => [
      ...clips,
      {
        id: 'new-1',
        trackId: 'video',
        startTime: 500,
        duration: 5,
        label: 'Inserted',
        type: 'video',
      },
    ])

    const full = getFullTimelineClips()
    expect(full).toHaveLength(201)
    expect(full.some((c) => c.id === 'new-1')).toBe(true)
  })

  it('diff undo round-trips like snapshot undo for the same edit', () => {
    const before = makeClips(3)
    const after = [
      before[0],
      { ...before[2], startTime: 25 },
    ]
    const patch = computeTimelinePatch(before, after)
    const undone = applyTimelinePatch(after, [], patch, 'inverse')
    const byId = (list: Clip[]) => [...list].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(undone.clips)).toEqual(byId(before))
  })
})
