/**
 * EP-3.1 — factory.ts tests
 *
 * Verifies that factory functions produce correctly structured objects
 * with sensible defaults, and that validation errors are thrown for
 * invalid inputs.
 */
import { describe, it, expect } from 'vitest'
import {
  createClip,
  createClipTransitions,
  createEffect,
  createGlobalSettings,
  createTimeline,
  createTrack,
  createTransition,
  emptyTimeline,
} from '../src/factory'
import {
  DEFAULT_TRACK_IDS,
  DEFAULT_TRACK_NAMES,
  DEFAULTS,
  SCHEMA_VERSION,
  TrackType,
  TransitionType,
} from '../src/constants'

// ── createTransition ──────────────────────────────────────────────────────────

describe('createTransition', () => {
  it('creates a FADE with default duration', () => {
    const t = createTransition(TransitionType.FADE)
    expect(t.type).toBe('fade')
    expect(t.duration).toBe(DEFAULTS.TRANSITION_DURATION)
  })

  it('creates a CUT with duration 0', () => {
    const t = createTransition(TransitionType.CUT, 0)
    expect(t.type).toBe('cut')
    expect(t.duration).toBe(0)
  })

  it('defaults to FADE type when no args given', () => {
    const t = createTransition()
    expect(t.type).toBe(TransitionType.FADE)
  })

  it('creates WHIP_PAN with custom duration', () => {
    const t = createTransition(TransitionType.WHIP_PAN, 0.3)
    expect(t.type).toBe('whip_pan')
    expect(t.duration).toBe(0.3)
  })
})

// ── createEffect ───────────────────────────────────────────────────────────────

describe('createEffect', () => {
  it('creates an effect with empty params by default', () => {
    const e = createEffect('color_grade')
    expect(e.type).toBe('color_grade')
    expect(e.params).toEqual({})
  })

  it('creates an effect with custom params', () => {
    const e = createEffect('lut', { path: 'rec709.cube', intensity: 0.8 })
    expect(e.params.path).toBe('rec709.cube')
    expect(e.params.intensity).toBe(0.8)
  })

  it('throws for empty type string', () => {
    expect(() => createEffect('')).toThrow('Effect type must not be empty')
  })
})

// ── createClipTransitions ─────────────────────────────────────────────────────

describe('createClipTransitions', () => {
  it('creates transitions with null in and out by default', () => {
    const ct = createClipTransitions()
    expect(ct.in).toBeNull()
    expect(ct.out).toBeNull()
  })

  it('accepts an in-transition', () => {
    const t = createTransition(TransitionType.FADE)
    const ct = createClipTransitions(t, null)
    expect(ct.in?.type).toBe('fade')
    expect(ct.out).toBeNull()
  })

  it('accepts an out-transition', () => {
    const t = createTransition(TransitionType.DISSOLVE, 1.0)
    const ct = createClipTransitions(null, t)
    expect(ct.out?.type).toBe('dissolve')
    expect(ct.out?.duration).toBe(1.0)
    expect(ct.in).toBeNull()
  })

  it('accepts both in and out transitions', () => {
    const t1 = createTransition(TransitionType.FADE)
    const t2 = createTransition(TransitionType.WIPE)
    const ct = createClipTransitions(t1, t2)
    expect(ct.in?.type).toBe('fade')
    expect(ct.out?.type).toBe('wipe')
  })
})

// ── createClip ─────────────────────────────────────────────────────────────────

describe('createClip', () => {
  const base = {
    id: 'clip-1',
    asset_id: 'asset-abc',
    source_start: 0,
    source_end: 60,
    timeline_start: 0,
    timeline_end: 60,
  }

  it('creates a clip with all required fields', () => {
    const clip = createClip(base)
    expect(clip.id).toBe('clip-1')
    expect(clip.asset_id).toBe('asset-abc')
    expect(clip.source_start).toBe(0)
    expect(clip.source_end).toBe(60)
    expect(clip.timeline_start).toBe(0)
    expect(clip.timeline_end).toBe(60)
  })

  it('applies default speed 1.0', () => {
    expect(createClip(base).speed).toBe(DEFAULTS.CLIP_SPEED)
  })

  it('applies default volume 1.0', () => {
    expect(createClip(base).volume).toBe(DEFAULTS.CLIP_VOLUME)
  })

  it('applies default muted false', () => {
    expect(createClip(base).muted).toBe(false)
  })

  it('applies default empty effects array', () => {
    expect(createClip(base).effects).toEqual([])
  })

  it('applies default null transitions', () => {
    const clip = createClip(base)
    expect(clip.transitions.in).toBeNull()
    expect(clip.transitions.out).toBeNull()
  })

  it('applies default empty label', () => {
    expect(createClip(base).label).toBe('')
  })

  it('accepts custom speed', () => {
    const clip = createClip({ ...base, speed: 2.0 })
    expect(clip.speed).toBe(2.0)
  })

  it('accepts custom label', () => {
    const clip = createClip({ ...base, label: 'Hook shot' })
    expect(clip.label).toBe('Hook shot')
  })

  it('throws when source_end < source_start', () => {
    expect(() =>
      createClip({ ...base, source_start: 10, source_end: 5 })
    ).toThrow('source_end')
  })

  it('throws when source_end equals source_start', () => {
    expect(() =>
      createClip({ ...base, source_start: 5, source_end: 5 })
    ).toThrow('source_end')
  })

  it('throws when timeline_end < timeline_start', () => {
    expect(() =>
      createClip({ ...base, timeline_start: 30, timeline_end: 10 })
    ).toThrow('timeline_end')
  })

  it('accepts effects array', () => {
    const effects = [createEffect('color_grade')]
    const clip = createClip({ ...base, effects })
    expect(clip.effects).toHaveLength(1)
    expect(clip.effects[0].type).toBe('color_grade')
  })
})

// ── createTrack ────────────────────────────────────────────────────────────────

describe('createTrack', () => {
  it('creates a video track with defaults', () => {
    const track = createTrack({ id: 'track-1', type: TrackType.VIDEO })
    expect(track.id).toBe('track-1')
    expect(track.type).toBe('video')
    expect(track.name).toBe('')
    expect(track.visible).toBe(true)
    expect(track.muted).toBe(false)
    expect(track.locked).toBe(false)
    expect(track.clips).toEqual([])
  })

  it('creates an audio track with custom name', () => {
    const track = createTrack({ id: 'track-2', type: TrackType.AUDIO, name: 'Voiceover' })
    expect(track.type).toBe('audio')
    expect(track.name).toBe('Voiceover')
  })

  it('creates a captions track', () => {
    const track = createTrack({ id: 'track-3', type: TrackType.CAPTIONS })
    expect(track.type).toBe('captions')
  })

  it('applies custom muted, locked, visible', () => {
    const track = createTrack({
      id: 'track-4',
      type: TrackType.VIDEO,
      muted: true,
      locked: true,
      visible: false,
    })
    expect(track.muted).toBe(true)
    expect(track.locked).toBe(true)
    expect(track.visible).toBe(false)
  })
})

// ── createGlobalSettings ──────────────────────────────────────────────────────

describe('createGlobalSettings', () => {
  it('uses defaults when called with no args', () => {
    const gs = createGlobalSettings()
    expect(gs.resolution).toBe('1920x1080')
    expect(gs.fps).toBe(DEFAULTS.FPS)
    expect(gs.audio_sample_rate).toBe(DEFAULTS.AUDIO_SAMPLE_RATE)
    expect(gs.duration).toBe(0)
  })

  it('accepts custom resolution', () => {
    const gs = createGlobalSettings({ resolution: '1080x1920' })
    expect(gs.resolution).toBe('1080x1920')
  })

  it('accepts custom fps', () => {
    const gs = createGlobalSettings({ fps: 60 })
    expect(gs.fps).toBe(60)
  })

  it('accepts custom audio_sample_rate', () => {
    const gs = createGlobalSettings({ audio_sample_rate: 44100 })
    expect(gs.audio_sample_rate).toBe(44100)
  })
})

// ── createTimeline ─────────────────────────────────────────────────────────────

describe('createTimeline', () => {
  it('creates a timeline with schema_version 1', () => {
    const tl = createTimeline()
    expect(tl.schema_version).toBe(SCHEMA_VERSION)
  })

  it('creates an empty timeline by default', () => {
    const tl = createTimeline()
    expect(tl.tracks).toEqual([])
    expect(tl.metadata).toEqual({})
  })

  it('accepts custom tracks', () => {
    const track = createTrack({ id: 'track-1', type: TrackType.VIDEO })
    const tl = createTimeline({ tracks: [track] })
    expect(tl.tracks).toHaveLength(1)
    expect(tl.tracks[0].id).toBe('track-1')
  })

  it('merges custom global_settings with defaults', () => {
    const tl = createTimeline({ global_settings: { fps: 60 } })
    expect(tl.global_settings.fps).toBe(60)
    expect(tl.global_settings.resolution).toBe('1920x1080')
  })

  it('stores custom metadata', () => {
    const tl = createTimeline({ metadata: { note: 'test' } })
    expect(tl.metadata.note).toBe('test')
  })
})

// ── emptyTimeline ─────────────────────────────────────────────────────────────

describe('emptyTimeline', () => {
  it('creates exactly 3 default tracks', () => {
    const tl = emptyTimeline()
    expect(tl.tracks).toHaveLength(3)
  })

  it('first track is video', () => {
    expect(emptyTimeline().tracks[0].type).toBe('video')
  })

  it('second track is audio', () => {
    expect(emptyTimeline().tracks[1].type).toBe('audio')
  })

  it('third track is captions', () => {
    expect(emptyTimeline().tracks[2].type).toBe('captions')
  })

  it('uses the correct default track IDs', () => {
    const tl = emptyTimeline()
    expect(tl.tracks[0].id).toBe(DEFAULT_TRACK_IDS.VIDEO)
    expect(tl.tracks[1].id).toBe(DEFAULT_TRACK_IDS.AUDIO)
    expect(tl.tracks[2].id).toBe(DEFAULT_TRACK_IDS.CAPTIONS)
  })

  it('uses the correct default track names', () => {
    const tl = emptyTimeline()
    expect(tl.tracks[0].name).toBe(DEFAULT_TRACK_NAMES.VIDEO)
    expect(tl.tracks[1].name).toBe(DEFAULT_TRACK_NAMES.AUDIO)
    expect(tl.tracks[2].name).toBe(DEFAULT_TRACK_NAMES.CAPTIONS)
  })

  it('all tracks start with zero clips', () => {
    for (const track of emptyTimeline().tracks) {
      expect(track.clips).toHaveLength(0)
    }
  })

  it('matches Python API TimelineDataModel.empty() shape', () => {
    const tl = emptyTimeline()
    expect(tl.schema_version).toBe(1)
    expect(tl.global_settings.resolution).toBe('1920x1080')
    expect(tl.global_settings.fps).toBe(30)
    expect(tl.global_settings.audio_sample_rate).toBe(48000)
  })

  it('each call returns a new independent object', () => {
    const tl1 = emptyTimeline()
    const tl2 = emptyTimeline()
    tl1.tracks.push(createTrack({ id: 'extra', type: TrackType.OVERLAY }))
    expect(tl2.tracks).toHaveLength(3)
  })
})
