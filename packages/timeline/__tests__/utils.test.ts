/**
 * EP-3.1 — utils.ts tests
 *
 * Verifies all query, measurement, and formatting utility functions.
 */
import { describe, it, expect } from 'vitest'
import {
  allClipIds,
  allTrackIds,
  clipSourceDuration,
  clipTimelineDuration,
  clipsOverlap,
  computeDuration,
  findClip,
  findOverlaps,
  findTrack,
  formatTime,
  framesToSeconds,
  getAudioTracks,
  getCaptionTracks,
  getOverlayTracks,
  getVideoTracks,
  hasNoOverlaps,
  isLandscape,
  isPortrait,
  parseResolution,
  parseTime,
  secondsToFrames,
  totalClipCount,
  withDuration,
} from '../src/utils'
import { createClip, createTimeline, createTrack, emptyTimeline } from '../src/factory'
import { TrackType } from '../src/constants'
import type { TimelineData } from '../src/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Quick clip: id, timeline window, optional source length override */
const mkClip = (id: string, tlStart: number, tlEnd: number, srcLen?: number) =>
  createClip({
    id,
    asset_id: 'asset-1',
    source_start: 0,
    source_end: srcLen ?? tlEnd - tlStart,
    timeline_start: tlStart,
    timeline_end: tlEnd,
  })

/** Timeline with one video track holding the given clips */
const mkTimeline = (...clips: ReturnType<typeof mkClip>[]): TimelineData => {
  const track = createTrack({ id: 'track-1', type: TrackType.VIDEO, clips })
  return createTimeline({ tracks: [track] })
}

// ── findTrack ─────────────────────────────────────────────────────────────────

describe('findTrack', () => {
  it('finds an existing track by ID', () => {
    const tl = emptyTimeline()
    const track = findTrack(tl, 'track-video-1')
    expect(track?.type).toBe('video')
  })

  it('returns undefined for a missing track ID', () => {
    expect(findTrack(emptyTimeline(), 'track-not-here')).toBeUndefined()
  })
})

// ── findClip ──────────────────────────────────────────────────────────────────

describe('findClip', () => {
  it('finds a clip and returns its parent track', () => {
    const clip = mkClip('clip-1', 0, 10)
    const tl = mkTimeline(clip)
    const result = findClip(tl, 'clip-1')
    expect(result?.clip.id).toBe('clip-1')
    expect(result?.track.id).toBe('track-1')
  })

  it('returns undefined for a missing clip ID', () => {
    expect(findClip(emptyTimeline(), 'nonexistent')).toBeUndefined()
  })

  it('finds a clip on the second track', () => {
    const clip1 = mkClip('clip-1', 0, 10)
    const clip2 = mkClip('clip-2', 0, 10)
    const track1 = createTrack({ id: 'track-1', type: TrackType.VIDEO, clips: [clip1] })
    const track2 = createTrack({ id: 'track-2', type: TrackType.AUDIO, clips: [clip2] })
    const tl = createTimeline({ tracks: [track1, track2] })
    const result = findClip(tl, 'clip-2')
    expect(result?.track.id).toBe('track-2')
  })
})

// ── Track type filters ─────────────────────────────────────────────────────────

describe('getVideoTracks', () => {
  it('returns only video tracks', () => {
    const tracks = getVideoTracks(emptyTimeline())
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('video')
  })
})

describe('getAudioTracks', () => {
  it('returns both audio and music tracks', () => {
    const music = createTrack({ id: 'track-music', type: TrackType.MUSIC })
    const tl = createTimeline({ tracks: [...emptyTimeline().tracks, music] })
    const tracks = getAudioTracks(tl)
    expect(tracks).toHaveLength(2)
    expect(tracks.some((t) => t.type === 'audio')).toBe(true)
    expect(tracks.some((t) => t.type === 'music')).toBe(true)
  })
})

describe('getCaptionTracks', () => {
  it('returns only caption tracks', () => {
    const tracks = getCaptionTracks(emptyTimeline())
    expect(tracks).toHaveLength(1)
    expect(tracks[0].type).toBe('captions')
  })
})

describe('getOverlayTracks', () => {
  it('returns empty array when no overlay tracks', () => {
    expect(getOverlayTracks(emptyTimeline())).toHaveLength(0)
  })

  it('returns overlay tracks when present', () => {
    const overlay = createTrack({ id: 'track-overlay', type: TrackType.OVERLAY })
    const tl = createTimeline({ tracks: [overlay] })
    expect(getOverlayTracks(tl)).toHaveLength(1)
  })
})

// ── computeDuration ────────────────────────────────────────────────────────────

describe('computeDuration', () => {
  it('returns 0 for timeline with no clips', () => {
    expect(computeDuration(emptyTimeline())).toBe(0)
  })

  it('returns max timeline_end across clips on one track', () => {
    const tl = mkTimeline(mkClip('c1', 0, 30), mkClip('c2', 30, 75))
    expect(computeDuration(tl)).toBe(75)
  })

  it('finds max across multiple tracks', () => {
    const clip1 = mkClip('c1', 0, 30)
    const clip2 = mkClip('c2', 0, 120)
    const track1 = createTrack({ id: 'track-1', type: TrackType.VIDEO, clips: [clip1] })
    const track2 = createTrack({ id: 'track-2', type: TrackType.AUDIO, clips: [clip2] })
    const tl = createTimeline({ tracks: [track1, track2] })
    expect(computeDuration(tl)).toBe(120)
  })
})

// ── clipSourceDuration / clipTimelineDuration ─────────────────────────────────

describe('clipSourceDuration', () => {
  it('returns source_end minus source_start', () => {
    const clip = mkClip('c1', 0, 10, 15)
    expect(clipSourceDuration(clip)).toBe(15)
  })
})

describe('clipTimelineDuration', () => {
  it('returns timeline_end minus timeline_start', () => {
    const clip = mkClip('c1', 5, 35)
    expect(clipTimelineDuration(clip)).toBe(30)
  })
})

// ── withDuration ──────────────────────────────────────────────────────────────

describe('withDuration', () => {
  it('adds source_duration and timeline_duration', () => {
    const clip = mkClip('c1', 10, 40, 35)
    const rich = withDuration(clip)
    expect(rich.source_duration).toBe(35)
    expect(rich.timeline_duration).toBe(30)
  })

  it('does not mutate the original clip', () => {
    const clip = mkClip('c1', 0, 10)
    withDuration(clip)
    expect((clip as Record<string, unknown>).source_duration).toBeUndefined()
  })

  it('preserves all original clip fields', () => {
    const clip = mkClip('c1', 0, 10)
    const rich = withDuration(clip)
    expect(rich.id).toBe(clip.id)
    expect(rich.asset_id).toBe(clip.asset_id)
  })
})

// ── framesToSeconds / secondsToFrames ─────────────────────────────────────────

describe('framesToSeconds', () => {
  it('converts 30 frames at 30fps to 1 second', () => {
    expect(framesToSeconds(30, 30)).toBe(1)
  })

  it('converts 90 frames at 30fps to 3 seconds', () => {
    expect(framesToSeconds(90, 30)).toBe(3)
  })

  it('converts 60 frames at 60fps to 1 second', () => {
    expect(framesToSeconds(60, 60)).toBe(1)
  })

  it('throws for fps = 0', () => {
    expect(() => framesToSeconds(30, 0)).toThrow()
  })

  it('throws for negative fps', () => {
    expect(() => framesToSeconds(30, -30)).toThrow()
  })
})

describe('secondsToFrames', () => {
  it('converts 1 second at 30fps to 30 frames', () => {
    expect(secondsToFrames(1, 30)).toBe(30)
  })

  it('floors partial frames correctly', () => {
    expect(secondsToFrames(1.5, 30)).toBe(45)
    expect(secondsToFrames(1.999, 30)).toBe(59)
  })

  it('throws for fps = 0', () => {
    expect(() => secondsToFrames(1, 0)).toThrow()
  })
})

// ── formatTime / parseTime ────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats 0 as "00:00:00.000"', () => {
    expect(formatTime(0)).toBe('00:00:00.000')
  })

  it('formats 3723.456 as "01:02:03.456"', () => {
    expect(formatTime(3723.456)).toBe('01:02:03.456')
  })

  it('formats negative seconds as "00:00:00.000"', () => {
    expect(formatTime(-5)).toBe('00:00:00.000')
  })

  it('pads single-digit minutes and seconds', () => {
    expect(formatTime(65.001)).toBe('00:01:05.001')
  })

  it('pads milliseconds to 3 digits', () => {
    expect(formatTime(1.001)).toBe('00:00:01.001')
  })
})

describe('parseTime', () => {
  it('parses HH:MM:SS.mmm format', () => {
    expect(parseTime('01:02:03.5')).toBeCloseTo(3723.5)
  })

  it('parses MM:SS format', () => {
    expect(parseTime('01:30')).toBe(90)
  })

  it('parses SS.mmm format', () => {
    expect(parseTime('45.5')).toBe(45.5)
  })

  it('throws for letters', () => {
    expect(() => parseTime('one:two:three')).toThrow()
  })
})

// ── clipsOverlap ──────────────────────────────────────────────────────────────

describe('clipsOverlap', () => {
  it('returns true when clips overlap', () => {
    expect(clipsOverlap(mkClip('a', 0, 10), mkClip('b', 5, 15))).toBe(true)
  })

  it('returns false when clips are adjacent (share an edge)', () => {
    expect(clipsOverlap(mkClip('a', 0, 10), mkClip('b', 10, 20))).toBe(false)
  })

  it('returns false when clips do not touch', () => {
    expect(clipsOverlap(mkClip('a', 0, 5), mkClip('b', 10, 20))).toBe(false)
  })

  it('returns true when one clip fully contains another', () => {
    expect(clipsOverlap(mkClip('a', 0, 20), mkClip('b', 5, 10))).toBe(true)
  })
})

// ── findOverlaps / hasNoOverlaps ──────────────────────────────────────────────

describe('findOverlaps', () => {
  it('returns empty array for non-overlapping clips', () => {
    const track = createTrack({
      id: 'track-1',
      type: TrackType.VIDEO,
      clips: [mkClip('a', 0, 10), mkClip('b', 10, 20)],
    })
    expect(findOverlaps(track)).toHaveLength(0)
  })

  it('finds one overlapping pair', () => {
    const track = createTrack({
      id: 'track-1',
      type: TrackType.VIDEO,
      clips: [mkClip('a', 0, 15), mkClip('b', 10, 25)],
    })
    const overlaps = findOverlaps(track)
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0].map((c) => c.id)).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('returns empty array for an empty track', () => {
    const track = createTrack({ id: 'track-1', type: TrackType.VIDEO })
    expect(findOverlaps(track)).toHaveLength(0)
  })
})

describe('hasNoOverlaps', () => {
  it('returns true for track with adjacent clips', () => {
    const track = createTrack({
      id: 'track-1',
      type: TrackType.VIDEO,
      clips: [mkClip('a', 0, 10), mkClip('b', 10, 20)],
    })
    expect(hasNoOverlaps(track)).toBe(true)
  })

  it('returns false for track with overlapping clips', () => {
    const track = createTrack({
      id: 'track-1',
      type: TrackType.VIDEO,
      clips: [mkClip('a', 0, 15), mkClip('b', 10, 25)],
    })
    expect(hasNoOverlaps(track)).toBe(false)
  })
})

// ── parseResolution / isPortrait / isLandscape ────────────────────────────────

describe('parseResolution', () => {
  it('parses "1920x1080"', () => {
    const r = parseResolution('1920x1080')
    expect(r.width).toBe(1920)
    expect(r.height).toBe(1080)
  })

  it('parses portrait "1080x1920"', () => {
    const r = parseResolution('1080x1920')
    expect(r.width).toBe(1080)
    expect(r.height).toBe(1920)
  })

  it('throws for "HD" (no separator)', () => {
    expect(() => parseResolution('HD')).toThrow()
  })

  it('throws for "1920-1080" (wrong separator)', () => {
    expect(() => parseResolution('1920-1080')).toThrow()
  })
})

const mkSettings = (res: string) => ({
  resolution: res,
  fps: 30,
  audio_sample_rate: 48000,
  duration: 0,
})

describe('isPortrait / isLandscape', () => {
  it('identifies landscape 1920x1080 correctly', () => {
    expect(isLandscape(mkSettings('1920x1080'))).toBe(true)
    expect(isPortrait(mkSettings('1920x1080'))).toBe(false)
  })

  it('identifies portrait 1080x1920 correctly', () => {
    expect(isPortrait(mkSettings('1080x1920'))).toBe(true)
    expect(isLandscape(mkSettings('1080x1920'))).toBe(false)
  })

  it('square (1080x1080) is landscape (not portrait)', () => {
    expect(isPortrait(mkSettings('1080x1080'))).toBe(false)
    expect(isLandscape(mkSettings('1080x1080'))).toBe(true)
  })
})

// ── totalClipCount / allClipIds / allTrackIds ─────────────────────────────────

describe('totalClipCount', () => {
  it('returns 0 for empty timeline', () => {
    expect(totalClipCount(emptyTimeline())).toBe(0)
  })

  it('counts clips across all tracks', () => {
    const c1 = mkClip('c1', 0, 10)
    const c2 = mkClip('c2', 0, 10)
    const c3 = mkClip('c3', 0, 10)
    const track1 = createTrack({ id: 'track-1', type: TrackType.VIDEO, clips: [c1, c2] })
    const track2 = createTrack({ id: 'track-2', type: TrackType.AUDIO, clips: [c3] })
    const tl = createTimeline({ tracks: [track1, track2] })
    expect(totalClipCount(tl)).toBe(3)
  })
})

describe('allClipIds', () => {
  it('returns all clip IDs flattened across tracks', () => {
    const c1 = mkClip('c1', 0, 10)
    const c2 = mkClip('c2', 0, 10)
    const track1 = createTrack({ id: 'track-1', type: TrackType.VIDEO, clips: [c1] })
    const track2 = createTrack({ id: 'track-2', type: TrackType.AUDIO, clips: [c2] })
    const tl = createTimeline({ tracks: [track1, track2] })
    expect(allClipIds(tl)).toEqual(expect.arrayContaining(['c1', 'c2']))
    expect(allClipIds(tl)).toHaveLength(2)
  })

  it('returns empty array for timeline with no clips', () => {
    expect(allClipIds(emptyTimeline())).toHaveLength(0)
  })
})

describe('allTrackIds', () => {
  it('returns all track IDs from the empty timeline', () => {
    const ids = allTrackIds(emptyTimeline())
    expect(ids).toContain('track-video-1')
    expect(ids).toContain('track-audio-1')
    expect(ids).toContain('track-captions')
    expect(ids).toHaveLength(3)
  })
})
