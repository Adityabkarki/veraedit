import { describe, it, expect } from 'vitest'
import {
  directorTimelineEntryCount,
  mergeDirectorTimelineWindowSlice,
  shouldUseDirectorWindowing,
  trimDirectorTimelineToFrameWindow,
} from '@/lib/directorTimelineWindowing'
import type { DirectorTimeline } from '@/types/director'

function shell(): DirectorTimeline {
  return {
    schemaVersion: 1,
    projectId: 'p1',
    contentType: 'podcast',
    fps: 30,
    durationInFrames: 9000,
    width: 1920,
    height: 1080,
    theme: {},
    tracks: {
      video: [{ id: 'v1', startFrame: 0, durationInFrames: 100 } as never],
      audio: [],
      captions: [],
      broll: [{ id: 'b1', startFrame: 500, durationInFrames: 60 } as never],
      motionGraphics: [],
      transitions: [],
      vfx: [],
      sfx: [],
      multicam: [],
    },
    triggers: [],
  }
}

describe('directorTimelineWindowing', () => {
  it('counts entries across tracks', () => {
    expect(directorTimelineEntryCount(shell())).toBe(2)
  })

  it('trims to frame window', () => {
    const trimmed = trimDirectorTimelineToFrameWindow(shell(), 480, 540)
    expect(trimmed.tracks.video).toHaveLength(0)
    expect(trimmed.tracks.broll).toHaveLength(1)
  })

  it('merges window slice without dropping out-of-window entries', () => {
    const base = shell()
    const slice = trimDirectorTimelineToFrameWindow(
      {
        ...shell(),
        tracks: {
          ...shell().tracks,
          video: [{ id: 'v2', startFrame: 510, durationInFrames: 30 } as never],
        },
      },
      500,
      560,
    )
    const merged = mergeDirectorTimelineWindowSlice(base, slice, 500, 560)
    expect(merged.tracks.video.map((v) => (v as { id: string }).id)).toEqual(['v1', 'v2'])
    expect(merged.tracks.broll).toHaveLength(1)
  })

  it('detects long-form director timelines', () => {
    expect(shouldUseDirectorWindowing(shell())).toBe(false)
    const long = {
      ...shell(),
      durationInFrames: 30 * 60 * 60,
    }
    expect(shouldUseDirectorWindowing(long)).toBe(true)
  })
})
