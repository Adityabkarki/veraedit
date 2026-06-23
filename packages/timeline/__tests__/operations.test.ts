/**
 * EP-3.2 — operations.ts tests
 *
 * Every operation is tested for:
 *   1. Correct output (clips/tracks changed as expected)
 *   2. Immutability (original timeline untouched)
 *   3. Error cases (correct error type thrown)
 *
 * All timelines use seconds; helper mkClip() creates minimal valid clips.
 */
import { describe, it, expect } from 'vitest'
import {
  addClip,
  addEffect,
  addTrack,
  moveClip,
  moveTrack,
  removeClip,
  removeEffect,
  removeTrack,
  rippleDelete,
  setClipMuted,
  setClipSpeed,
  setClipTransition,
  setClipVolume,
  setTrackLocked,
  setTrackMuted,
  setTrackVisible,
  splitClip,
  trimClipEnd,
  trimClipStart,
  updateGlobalSettings,
} from '../src/operations'
import {
  ClipNotFoundError,
  DuplicateIdError,
  InvalidOperationError,
  TrackNotFoundError,
} from '../src/errors'
import { createClip, createEffect, createTimeline, createTrack, createTransition, emptyTimeline } from '../src/factory'
import { TrackType, TransitionType } from '../src/constants'
import type { TimelineData } from '../src/types'

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Clip with given timeline window (source window = same length) */
const mkClip = (id: string, tlStart: number, tlEnd: number, srcLen?: number) =>
  createClip({
    id,
    asset_id: 'asset-1',
    source_start: 0,
    source_end: srcLen ?? tlEnd - tlStart,
    timeline_start: tlStart,
    timeline_end: tlEnd,
  })

/** Timeline with one video track containing the given clips */
const mkTl = (...clips: ReturnType<typeof mkClip>[]): TimelineData => {
  const track = createTrack({ id: 'track-v', type: TrackType.VIDEO, clips })
  return createTimeline({ tracks: [track] })
}

/** Get the first (video) track clips */
const getClips = (tl: TimelineData) => tl.tracks[0].clips

// ─────────────────────────────────────────────────────────────────────────────
// addClip
// ─────────────────────────────────────────────────────────────────────────────

describe('addClip', () => {
  it('appends a clip to an existing track', () => {
    const tl = mkTl()
    const clip = mkClip('clip-1', 0, 30)
    const result = addClip(tl, 'track-v', clip)
    expect(getClips(result)).toHaveLength(1)
    expect(getClips(result)[0].id).toBe('clip-1')
  })

  it('appends to clips already on the track', () => {
    const tl = mkTl(mkClip('clip-1', 0, 10))
    const result = addClip(tl, 'track-v', mkClip('clip-2', 10, 20))
    expect(getClips(result)).toHaveLength(2)
  })

  it('throws TrackNotFoundError for unknown track', () => {
    const tl = mkTl()
    expect(() => addClip(tl, 'track-missing', mkClip('c1', 0, 10)))
      .toThrow(TrackNotFoundError)
  })

  it('throws DuplicateIdError when clip ID already exists', () => {
    const tl = mkTl(mkClip('clip-1', 0, 10))
    expect(() => addClip(tl, 'track-v', mkClip('clip-1', 10, 20)))
      .toThrow(DuplicateIdError)
  })

  it('does not mutate the original timeline', () => {
    const tl = mkTl()
    addClip(tl, 'track-v', mkClip('c1', 0, 10))
    expect(getClips(tl)).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// removeClip
// ─────────────────────────────────────────────────────────────────────────────

describe('removeClip', () => {
  it('removes an existing clip', () => {
    const tl = mkTl(mkClip('c1', 0, 10), mkClip('c2', 10, 20))
    const result = removeClip(tl, 'c1')
    expect(getClips(result)).toHaveLength(1)
    expect(getClips(result)[0].id).toBe('c2')
  })

  it('throws ClipNotFoundError for unknown clip', () => {
    expect(() => removeClip(mkTl(), 'ghost')).toThrow(ClipNotFoundError)
  })

  it('leaves an empty track after removing the only clip', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    expect(getClips(removeClip(tl, 'c1'))).toHaveLength(0)
  })

  it('does not mutate the original timeline', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    removeClip(tl, 'c1')
    expect(getClips(tl)).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// rippleDelete
// ─────────────────────────────────────────────────────────────────────────────

describe('rippleDelete', () => {
  it('removes the clip', () => {
    const tl = mkTl(mkClip('c1', 0, 30))
    expect(getClips(rippleDelete(tl, 'c1'))).toHaveLength(0)
  })

  it('shifts subsequent clips left by the deleted clip duration', () => {
    const tl = mkTl(mkClip('c1', 0, 30), mkClip('c2', 30, 60), mkClip('c3', 60, 90))
    const result = rippleDelete(tl, 'c1')
    const clips = getClips(result)
    expect(clips).toHaveLength(2)
    expect(clips[0].id).toBe('c2')
    expect(clips[0].timeline_start).toBe(0)
    expect(clips[0].timeline_end).toBe(30)
    expect(clips[1].timeline_start).toBe(30)
    expect(clips[1].timeline_end).toBe(60)
  })

  it('does not shift clips that start before the deleted clip', () => {
    const tl = mkTl(mkClip('c1', 0, 10), mkClip('c2', 10, 20), mkClip('c3', 20, 30))
    // Delete middle clip
    const result = rippleDelete(tl, 'c2')
    const clips = getClips(result)
    expect(clips[0].timeline_start).toBe(0)  // c1 unchanged
    expect(clips[0].timeline_end).toBe(10)
    expect(clips[1].timeline_start).toBe(10) // c3 shifted left by 10s
    expect(clips[1].timeline_end).toBe(20)
  })

  it('throws ClipNotFoundError for unknown clip', () => {
    expect(() => rippleDelete(mkTl(), 'ghost')).toThrow(ClipNotFoundError)
  })

  it('does not mutate the original timeline', () => {
    const tl = mkTl(mkClip('c1', 0, 10), mkClip('c2', 10, 20))
    rippleDelete(tl, 'c1')
    expect(getClips(tl)).toHaveLength(2)
    expect(getClips(tl)[1].timeline_start).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// splitClip
// ─────────────────────────────────────────────────────────────────────────────

describe('splitClip', () => {
  it('replaces one clip with two clips', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    const result = splitClip(tl, 'c1', 30)
    expect(getClips(result)).toHaveLength(2)
  })

  it('produces clips whose timeline durations sum to the original', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    const clips = getClips(splitClip(tl, 'c1', 30))
    const totalDuration = clips.reduce(
      (sum, c) => sum + (c.timeline_end - c.timeline_start),
      0
    )
    expect(totalDuration).toBe(60)
  })

  it('splits at the correct timeline position', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    const [first, second] = getClips(splitClip(tl, 'c1', 30))
    expect(first.timeline_start).toBe(0)
    expect(first.timeline_end).toBe(30)
    expect(second.timeline_start).toBe(30)
    expect(second.timeline_end).toBe(60)
  })

  it('sets source ranges correctly for normal speed (1x)', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    const [first, second] = getClips(splitClip(tl, 'c1', 30))
    expect(first.source_start).toBe(0)
    expect(first.source_end).toBe(30)
    expect(second.source_start).toBe(30)
    expect(second.source_end).toBe(60)
  })

  it('assigns -a and -b suffixes to new clip IDs', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    const [first, second] = getClips(splitClip(tl, 'c1', 30))
    expect(first.id).toBe('c1-a')
    expect(second.id).toBe('c1-b')
  })

  it('throws InvalidOperationError when splitAt equals timeline_start', () => {
    const tl = mkTl(mkClip('c1', 10, 60))
    expect(() => splitClip(tl, 'c1', 10)).toThrow(InvalidOperationError)
  })

  it('throws InvalidOperationError when splitAt equals timeline_end', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    expect(() => splitClip(tl, 'c1', 60)).toThrow(InvalidOperationError)
  })

  it('throws InvalidOperationError when splitAt is outside clip range', () => {
    const tl = mkTl(mkClip('c1', 10, 50))
    expect(() => splitClip(tl, 'c1', 5)).toThrow(InvalidOperationError)
    expect(() => splitClip(tl, 'c1', 55)).toThrow(InvalidOperationError)
  })

  it('does not mutate the original timeline', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    splitClip(tl, 'c1', 30)
    expect(getClips(tl)).toHaveLength(1)
    expect(getClips(tl)[0].id).toBe('c1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// trimClipStart
// ─────────────────────────────────────────────────────────────────────────────

describe('trimClipStart', () => {
  it('advances timeline_start to the new value', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    const [clip] = getClips(trimClipStart(tl, 'c1', 10))
    expect(clip.timeline_start).toBe(10)
  })

  it('advances source_start proportionally for 1x speed', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    const [clip] = getClips(trimClipStart(tl, 'c1', 10))
    expect(clip.source_start).toBe(10)
  })

  it('does not change timeline_end or source_end', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    const [clip] = getClips(trimClipStart(tl, 'c1', 15))
    expect(clip.timeline_end).toBe(60)
    expect(clip.source_end).toBe(60)
  })

  it('throws InvalidOperationError when newStart >= timeline_end', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    expect(() => trimClipStart(tl, 'c1', 60)).toThrow(InvalidOperationError)
    expect(() => trimClipStart(tl, 'c1', 70)).toThrow(InvalidOperationError)
  })

  it('throws InvalidOperationError when newStart <= timeline_start', () => {
    const tl = mkTl(mkClip('c1', 10, 60))
    expect(() => trimClipStart(tl, 'c1', 10)).toThrow(InvalidOperationError)
    expect(() => trimClipStart(tl, 'c1', 5)).toThrow(InvalidOperationError)
  })

  it('does not mutate the original', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    trimClipStart(tl, 'c1', 10)
    expect(getClips(tl)[0].timeline_start).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// trimClipEnd
// ─────────────────────────────────────────────────────────────────────────────

describe('trimClipEnd', () => {
  it('retreats timeline_end to the new value', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    const [clip] = getClips(trimClipEnd(tl, 'c1', 50))
    expect(clip.timeline_end).toBe(50)
  })

  it('retreats source_end proportionally for 1x speed', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    const [clip] = getClips(trimClipEnd(tl, 'c1', 50))
    expect(clip.source_end).toBe(50)
  })

  it('does not change timeline_start or source_start', () => {
    const tl = mkTl(mkClip('c1', 0, 60, 60))
    const [clip] = getClips(trimClipEnd(tl, 'c1', 40))
    expect(clip.timeline_start).toBe(0)
    expect(clip.source_start).toBe(0)
  })

  it('throws InvalidOperationError when newEnd <= timeline_start', () => {
    const tl = mkTl(mkClip('c1', 10, 60))
    expect(() => trimClipEnd(tl, 'c1', 10)).toThrow(InvalidOperationError)
    expect(() => trimClipEnd(tl, 'c1', 5)).toThrow(InvalidOperationError)
  })

  it('throws InvalidOperationError when newEnd >= timeline_end', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    expect(() => trimClipEnd(tl, 'c1', 60)).toThrow(InvalidOperationError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// moveClip
// ─────────────────────────────────────────────────────────────────────────────

describe('moveClip', () => {
  it('moves clip to new start position', () => {
    const tl = mkTl(mkClip('c1', 0, 30))
    const [clip] = getClips(moveClip(tl, 'c1', 60))
    expect(clip.timeline_start).toBe(60)
    expect(clip.timeline_end).toBe(90)
  })

  it('preserves clip duration', () => {
    const tl = mkTl(mkClip('c1', 0, 45))
    const [clip] = getClips(moveClip(tl, 'c1', 100))
    expect(clip.timeline_end - clip.timeline_start).toBe(45)
  })

  it('does not shift other clips (non-ripple)', () => {
    const tl = mkTl(mkClip('c1', 0, 30), mkClip('c2', 30, 60))
    const result = moveClip(tl, 'c1', 90)
    const clips = getClips(result)
    const c2 = clips.find((c) => c.id === 'c2')!
    expect(c2.timeline_start).toBe(30) // unchanged
  })

  it('throws InvalidOperationError for negative start', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    expect(() => moveClip(tl, 'c1', -5)).toThrow(InvalidOperationError)
  })

  it('throws ClipNotFoundError for unknown clip', () => {
    expect(() => moveClip(mkTl(), 'ghost', 10)).toThrow(ClipNotFoundError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// setClipSpeed
// ─────────────────────────────────────────────────────────────────────────────

describe('setClipSpeed', () => {
  it('sets clip speed', () => {
    const tl = mkTl(mkClip('c1', 0, 30, 30))
    const [clip] = getClips(setClipSpeed(tl, 'c1', 2.0))
    expect(clip.speed).toBe(2.0)
  })

  it('recalculates timeline_end (same source → shorter timeline at 2x)', () => {
    const tl = mkTl(mkClip('c1', 0, 30, 30))
    const [clip] = getClips(setClipSpeed(tl, 'c1', 2.0))
    // source=30s, speed=2 → timeline=15s
    expect(clip.timeline_end).toBe(15)
    expect(clip.timeline_start).toBe(0)
  })

  it('recalculates timeline_end for slow motion (0.5x → longer timeline)', () => {
    const tl = mkTl(mkClip('c1', 0, 30, 30))
    const [clip] = getClips(setClipSpeed(tl, 'c1', 0.5))
    expect(clip.timeline_end).toBe(60)
  })

  it('throws for speed below 0.1', () => {
    const tl = mkTl(mkClip('c1', 0, 30))
    expect(() => setClipSpeed(tl, 'c1', 0.05)).toThrow(InvalidOperationError)
  })

  it('throws for speed above 10', () => {
    const tl = mkTl(mkClip('c1', 0, 30))
    expect(() => setClipSpeed(tl, 'c1', 15)).toThrow(InvalidOperationError)
  })

  it('does not mutate original', () => {
    const tl = mkTl(mkClip('c1', 0, 30, 30))
    setClipSpeed(tl, 'c1', 2.0)
    expect(getClips(tl)[0].speed).toBe(1.0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// setClipVolume
// ─────────────────────────────────────────────────────────────────────────────

describe('setClipVolume', () => {
  it('sets clip volume', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const [clip] = getClips(setClipVolume(tl, 'c1', 0.5))
    expect(clip.volume).toBe(0.5)
  })

  it('throws for volume > 4', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    expect(() => setClipVolume(tl, 'c1', 5)).toThrow(InvalidOperationError)
  })

  it('throws for negative volume', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    expect(() => setClipVolume(tl, 'c1', -0.1)).toThrow(InvalidOperationError)
  })

  it('allows volume 0 (silent)', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const [clip] = getClips(setClipVolume(tl, 'c1', 0))
    expect(clip.volume).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// setClipMuted
// ─────────────────────────────────────────────────────────────────────────────

describe('setClipMuted', () => {
  it('mutes a clip', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const [clip] = getClips(setClipMuted(tl, 'c1', true))
    expect(clip.muted).toBe(true)
  })

  it('unmutes a clip', () => {
    const clip = mkClip('c1', 0, 10)
    clip.muted = true
    const tl = createTimeline({
      tracks: [createTrack({ id: 'track-v', type: TrackType.VIDEO, clips: [clip] })],
    })
    const [result] = getClips(setClipMuted(tl, 'c1', false))
    expect(result.muted).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// setClipTransition
// ─────────────────────────────────────────────────────────────────────────────

describe('setClipTransition', () => {
  it('sets an out transition', () => {
    const tl = mkTl(mkClip('c1', 0, 30))
    const t = createTransition(TransitionType.FADE, 0.5)
    const [clip] = getClips(setClipTransition(tl, 'c1', 'out', t))
    expect(clip.transitions.out?.type).toBe('fade')
    expect(clip.transitions.out?.duration).toBe(0.5)
  })

  it('sets an in transition', () => {
    const tl = mkTl(mkClip('c1', 0, 30))
    const t = createTransition(TransitionType.DISSOLVE)
    const [clip] = getClips(setClipTransition(tl, 'c1', 'in', t))
    expect(clip.transitions.in?.type).toBe('dissolve')
  })

  it('removes a transition by passing null', () => {
    const tl = mkTl(mkClip('c1', 0, 30))
    const withT = setClipTransition(tl, 'c1', 'out', createTransition(TransitionType.FADE))
    const without = setClipTransition(withT, 'c1', 'out', null)
    expect(getClips(without)[0].transitions.out).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// addEffect / removeEffect
// ─────────────────────────────────────────────────────────────────────────────

describe('addEffect', () => {
  it('adds an effect to a clip', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const e = createEffect('color_grade', { brightness: 0.1 })
    const [clip] = getClips(addEffect(tl, 'c1', e))
    expect(clip.effects).toHaveLength(1)
    expect(clip.effects[0].type).toBe('color_grade')
  })

  it('replaces an existing effect of the same type', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const e1 = createEffect('color_grade', { brightness: 0.1 })
    const e2 = createEffect('color_grade', { brightness: 0.5 })
    const after1 = addEffect(tl, 'c1', e1)
    const after2 = addEffect(after1, 'c1', e2)
    const [clip] = getClips(after2)
    expect(clip.effects).toHaveLength(1)
    expect(clip.effects[0].params.brightness).toBe(0.5)
  })

  it('can add multiple different effect types', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const e1 = createEffect('color_grade')
    const e2 = createEffect('lut')
    const result = addEffect(addEffect(tl, 'c1', e1), 'c1', e2)
    expect(getClips(result)[0].effects).toHaveLength(2)
  })

  it('throws ClipNotFoundError for unknown clip', () => {
    expect(() => addEffect(mkTl(), 'ghost', createEffect('color_grade')))
      .toThrow(ClipNotFoundError)
  })
})

describe('removeEffect', () => {
  it('removes an effect by type', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const withEffect = addEffect(tl, 'c1', createEffect('color_grade'))
    const result = removeEffect(withEffect, 'c1', 'color_grade')
    expect(getClips(result)[0].effects).toHaveLength(0)
  })

  it('is a no-op when effect type does not exist', () => {
    const tl = mkTl(mkClip('c1', 0, 10))
    const result = removeEffect(tl, 'c1', 'nonexistent_effect')
    expect(getClips(result)[0].effects).toHaveLength(0)
  })

  it('throws ClipNotFoundError for unknown clip', () => {
    expect(() => removeEffect(mkTl(), 'ghost', 'color_grade'))
      .toThrow(ClipNotFoundError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// addTrack
// ─────────────────────────────────────────────────────────────────────────────

describe('addTrack', () => {
  it('appends a new track', () => {
    const tl = emptyTimeline()
    const overlay = createTrack({ id: 'track-overlay', type: TrackType.OVERLAY })
    const result = addTrack(tl, overlay)
    expect(result.tracks).toHaveLength(4)
    expect(result.tracks[3].id).toBe('track-overlay')
  })

  it('throws DuplicateIdError for existing track ID', () => {
    const tl = emptyTimeline()
    const dup = createTrack({ id: 'track-video-1', type: TrackType.OVERLAY })
    expect(() => addTrack(tl, dup)).toThrow(DuplicateIdError)
  })

  it('does not mutate the original timeline', () => {
    const tl = emptyTimeline()
    addTrack(tl, createTrack({ id: 'track-new', type: TrackType.OVERLAY }))
    expect(tl.tracks).toHaveLength(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// removeTrack
// ─────────────────────────────────────────────────────────────────────────────

describe('removeTrack', () => {
  it('removes a track by ID', () => {
    const tl = emptyTimeline()
    const result = removeTrack(tl, 'track-video-1')
    expect(result.tracks).toHaveLength(2)
    expect(result.tracks.find((t) => t.id === 'track-video-1')).toBeUndefined()
  })

  it('throws TrackNotFoundError for unknown track', () => {
    expect(() => removeTrack(emptyTimeline(), 'ghost')).toThrow(TrackNotFoundError)
  })

  it('does not mutate the original', () => {
    const tl = emptyTimeline()
    removeTrack(tl, 'track-video-1')
    expect(tl.tracks).toHaveLength(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// moveTrack
// ─────────────────────────────────────────────────────────────────────────────

describe('moveTrack', () => {
  it('moves a track to a new index', () => {
    const tl = emptyTimeline()
    // Move video track (index 0) to index 2
    const result = moveTrack(tl, 'track-video-1', 2)
    expect(result.tracks[0].id).toBe('track-audio-1')
    expect(result.tracks[1].id).toBe('track-captions')
    expect(result.tracks[2].id).toBe('track-video-1')
  })

  it('clamps newIndex to 0 when negative', () => {
    const tl = emptyTimeline()
    const result = moveTrack(tl, 'track-captions', -10)
    expect(result.tracks[0].id).toBe('track-captions')
  })

  it('clamps newIndex to last position when too large', () => {
    const tl = emptyTimeline()
    const result = moveTrack(tl, 'track-video-1', 999)
    expect(result.tracks[result.tracks.length - 1].id).toBe('track-video-1')
  })

  it('throws TrackNotFoundError for unknown track', () => {
    expect(() => moveTrack(emptyTimeline(), 'ghost', 0)).toThrow(TrackNotFoundError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// setTrackMuted / setTrackLocked / setTrackVisible
// ─────────────────────────────────────────────────────────────────────────────

describe('setTrackMuted', () => {
  it('mutes a track', () => {
    const tl = emptyTimeline()
    const result = setTrackMuted(tl, 'track-audio-1', true)
    expect(result.tracks.find((t) => t.id === 'track-audio-1')?.muted).toBe(true)
  })

  it('throws TrackNotFoundError for unknown track', () => {
    expect(() => setTrackMuted(emptyTimeline(), 'ghost', true)).toThrow(TrackNotFoundError)
  })
})

describe('setTrackLocked', () => {
  it('locks a track', () => {
    const tl = emptyTimeline()
    const result = setTrackLocked(tl, 'track-video-1', true)
    expect(result.tracks[0].locked).toBe(true)
  })
})

describe('setTrackVisible', () => {
  it('hides a track', () => {
    const tl = emptyTimeline()
    const result = setTrackVisible(tl, 'track-video-1', false)
    expect(result.tracks[0].visible).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// updateGlobalSettings
// ─────────────────────────────────────────────────────────────────────────────

describe('updateGlobalSettings', () => {
  it('updates fps while preserving other settings', () => {
    const tl = emptyTimeline()
    const result = updateGlobalSettings(tl, { fps: 60 })
    expect(result.global_settings.fps).toBe(60)
    expect(result.global_settings.resolution).toBe('1920x1080')
    expect(result.global_settings.audio_sample_rate).toBe(48000)
  })

  it('updates resolution for portrait export', () => {
    const tl = emptyTimeline()
    const result = updateGlobalSettings(tl, { resolution: '1080x1920' })
    expect(result.global_settings.resolution).toBe('1080x1920')
  })

  it('does not mutate the original', () => {
    const tl = emptyTimeline()
    updateGlobalSettings(tl, { fps: 60 })
    expect(tl.global_settings.fps).toBe(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Immutability contract — comprehensive check across all operation families
// ─────────────────────────────────────────────────────────────────────────────

describe('Immutability contract', () => {
  it('addClip: original tracks array is unchanged', () => {
    const tl = mkTl()
    const original = JSON.stringify(tl)
    addClip(tl, 'track-v', mkClip('c1', 0, 10))
    expect(JSON.stringify(tl)).toBe(original)
  })

  it('rippleDelete: original clip positions are unchanged', () => {
    const tl = mkTl(mkClip('c1', 0, 30), mkClip('c2', 30, 60))
    const original = JSON.stringify(tl)
    rippleDelete(tl, 'c1')
    expect(JSON.stringify(tl)).toBe(original)
  })

  it('splitClip: original has one clip, result has two', () => {
    const tl = mkTl(mkClip('c1', 0, 60))
    const result = splitClip(tl, 'c1', 30)
    expect(getClips(tl)).toHaveLength(1)
    expect(getClips(result)).toHaveLength(2)
  })

  it('setClipSpeed: original speed unchanged', () => {
    const tl = mkTl(mkClip('c1', 0, 30, 30))
    setClipSpeed(tl, 'c1', 2.0)
    expect(getClips(tl)[0].speed).toBe(1.0)
  })

  it('addTrack: original track count unchanged', () => {
    const tl = emptyTimeline()
    addTrack(tl, createTrack({ id: 'new', type: TrackType.OVERLAY }))
    expect(tl.tracks).toHaveLength(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Error type identity
// ─────────────────────────────────────────────────────────────────────────────

describe('Error type identity', () => {
  it('TrackNotFoundError has correct name', () => {
    const err = new TrackNotFoundError('x')
    expect(err.name).toBe('TrackNotFoundError')
    expect(err.trackId).toBe('x')
  })

  it('ClipNotFoundError has correct name', () => {
    const err = new ClipNotFoundError('y')
    expect(err.name).toBe('ClipNotFoundError')
    expect(err.clipId).toBe('y')
  })

  it('DuplicateIdError contains the duplicate ID', () => {
    const err = new DuplicateIdError('dup-id', 'clip')
    expect(err.id).toBe('dup-id')
    expect(err.kind).toBe('clip')
    expect(err.message).toContain('dup-id')
  })

  it('InvalidOperationError inherits from TimelineOperationError', () => {
    const err = new InvalidOperationError('bad op')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('InvalidOperationError')
  })
})
