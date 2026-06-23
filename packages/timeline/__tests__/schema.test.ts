/**
 * EP-3.1 — schema.ts tests
 *
 * Validates that Zod schemas enforce the same constraints as the
 * Python Pydantic models (ClipModel, TrackModel, GlobalSettingsModel,
 * TimelineDataModel).
 */
import { describe, it, expect } from 'vitest'
import {
  ClipSchema,
  GlobalSettingsSchema,
  TimelineDataSchema,
  TrackSchema,
  TransitionSchema,
  parseTimeline,
  safeParseTimeline,
  validateTimeline,
} from '../src/schema'
import { TransitionType } from '../src/constants'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const validClip = {
  id: 'clip-1',
  asset_id: 'asset-abc',
  source_start: 0,
  source_end: 10,
  timeline_start: 0,
  timeline_end: 10,
}

const validTrack = {
  id: 'track-1',
  type: 'video',
  clips: [],
}

const validTimeline = {
  schema_version: 1,
  tracks: [],
  global_settings: {
    resolution: '1920x1080',
    fps: 30,
    audio_sample_rate: 48000,
    duration: 0,
  },
  metadata: {},
}

// ── TransitionSchema ──────────────────────────────────────────────────────────

describe('TransitionSchema', () => {
  it('accepts a valid transition', () => {
    const result = TransitionSchema.parse({ type: 'fade', duration: 0.5 })
    expect(result.type).toBe('fade')
    expect(result.duration).toBe(0.5)
  })

  it('rejects unknown transition type', () => {
    expect(() => TransitionSchema.parse({ type: 'explosion', duration: 0.5 })).toThrow()
  })

  it('rejects duration > 5', () => {
    expect(() => TransitionSchema.parse({ type: 'fade', duration: 10 })).toThrow()
  })

  it('applies default type "cut" when omitted', () => {
    const result = TransitionSchema.parse({ duration: 0.5 })
    expect(result.type).toBe(TransitionType.CUT)
  })

  it('applies default duration 0.5 when omitted', () => {
    const result = TransitionSchema.parse({ type: 'fade' })
    expect(result.duration).toBe(0.5)
  })

  it('passes through extra fields', () => {
    const result = TransitionSchema.parse({ type: 'fade', duration: 0.5, easing: 'ease-in' })
    expect((result as Record<string, unknown>).easing).toBe('ease-in')
  })
})

// ── ClipSchema ────────────────────────────────────────────────────────────────

describe('ClipSchema', () => {
  it('accepts a minimal valid clip', () => {
    const result = ClipSchema.parse(validClip)
    expect(result.id).toBe('clip-1')
    expect(result.speed).toBe(1.0)   // default
    expect(result.muted).toBe(false) // default
    expect(result.volume).toBe(1.0)  // default
    expect(result.effects).toEqual([])
    expect(result.label).toBe('')
  })

  it('rejects source_end <= source_start', () => {
    expect(() =>
      ClipSchema.parse({ ...validClip, source_start: 10, source_end: 5 })
    ).toThrow()
  })

  it('rejects source_end equal to source_start', () => {
    expect(() =>
      ClipSchema.parse({ ...validClip, source_start: 5, source_end: 5 })
    ).toThrow()
  })

  it('rejects timeline_end <= timeline_start', () => {
    expect(() =>
      ClipSchema.parse({ ...validClip, timeline_start: 20, timeline_end: 10 })
    ).toThrow()
  })

  it('rejects speed below 0.1', () => {
    expect(() => ClipSchema.parse({ ...validClip, speed: 0.05 })).toThrow()
  })

  it('rejects speed above 10', () => {
    expect(() => ClipSchema.parse({ ...validClip, speed: 15 })).toThrow()
  })

  it('rejects volume above 4', () => {
    expect(() => ClipSchema.parse({ ...validClip, volume: 5 })).toThrow()
  })

  it('rejects empty id', () => {
    expect(() => ClipSchema.parse({ ...validClip, id: '' })).toThrow()
  })

  it('allows extra fields (passthrough)', () => {
    const result = ClipSchema.parse({ ...validClip, custom_field: 'hello' })
    expect((result as Record<string, unknown>).custom_field).toBe('hello')
  })
})

// ── TrackSchema ───────────────────────────────────────────────────────────────

describe('TrackSchema', () => {
  it('accepts a valid track', () => {
    const result = TrackSchema.parse(validTrack)
    expect(result.id).toBe('track-1')
    expect(result.type).toBe('video')
    expect(result.visible).toBe(true)
    expect(result.muted).toBe(false)
    expect(result.locked).toBe(false)
    expect(result.clips).toEqual([])
  })

  it('rejects invalid track type', () => {
    expect(() => TrackSchema.parse({ ...validTrack, type: 'subtitles' })).toThrow()
  })

  it('accepts all 5 valid track types', () => {
    const types = ['video', 'audio', 'captions', 'overlay', 'music']
    for (const type of types) {
      expect(() =>
        TrackSchema.parse({ id: `track-${type}`, type, clips: [] })
      ).not.toThrow()
    }
  })

  it('applies default name "" when omitted', () => {
    const result = TrackSchema.parse({ id: 'track-1', type: 'audio' })
    expect(result.name).toBe('')
  })
})

// ── GlobalSettingsSchema ──────────────────────────────────────────────────────

describe('GlobalSettingsSchema', () => {
  it('accepts valid settings', () => {
    const result = GlobalSettingsSchema.parse({
      resolution: '1280x720',
      fps: 60,
      audio_sample_rate: 44100,
      duration: 120,
    })
    expect(result.resolution).toBe('1280x720')
    expect(result.fps).toBe(60)
  })

  it('rejects resolution without x separator', () => {
    expect(() => GlobalSettingsSchema.parse({ resolution: 'FullHD' })).toThrow()
  })

  it('rejects resolution with dash separator', () => {
    expect(() => GlobalSettingsSchema.parse({ resolution: '1920-1080' })).toThrow()
  })

  it('rejects fps above 120', () => {
    expect(() => GlobalSettingsSchema.parse({ fps: 240 })).toThrow()
  })

  it('rejects fps below 1', () => {
    expect(() => GlobalSettingsSchema.parse({ fps: 0.5 })).toThrow()
  })

  it('applies default resolution when omitted', () => {
    const result = GlobalSettingsSchema.parse({})
    expect(result.resolution).toBe('1920x1080')
  })

  it('applies default fps 30 when omitted', () => {
    const result = GlobalSettingsSchema.parse({})
    expect(result.fps).toBe(30)
  })
})

// ── TimelineDataSchema ────────────────────────────────────────────────────────

describe('TimelineDataSchema', () => {
  it('accepts a valid empty timeline', () => {
    const result = TimelineDataSchema.parse(validTimeline)
    expect(result.schema_version).toBe(1)
    expect(result.tracks).toHaveLength(0)
  })

  it('rejects schema_version < 1', () => {
    expect(() =>
      TimelineDataSchema.parse({ ...validTimeline, schema_version: 0 })
    ).toThrow()
  })

  it('rejects duplicate track IDs', () => {
    const timeline = {
      ...validTimeline,
      tracks: [
        { ...validTrack, id: 'track-dup' },
        { ...validTrack, id: 'track-dup' },
      ],
    }
    expect(() => TimelineDataSchema.parse(timeline)).toThrow(/track IDs must be unique/)
  })

  it('rejects duplicate clip IDs across tracks', () => {
    const clip = { ...validClip, id: 'clip-dup' }
    const timeline = {
      ...validTimeline,
      tracks: [
        { ...validTrack, id: 'track-1', clips: [clip] },
        { ...validTrack, id: 'track-2', clips: [clip] },
      ],
    }
    expect(() => TimelineDataSchema.parse(timeline)).toThrow(/clip IDs must be unique/)
  })

  it('allows unique clip IDs across multiple tracks', () => {
    const clip1 = { ...validClip, id: 'clip-1' }
    const clip2 = {
      ...validClip,
      id: 'clip-2',
      timeline_start: 10,
      timeline_end: 20,
      source_end: 10,
    }
    const timeline = {
      ...validTimeline,
      tracks: [
        { ...validTrack, id: 'track-1', clips: [clip1] },
        { ...validTrack, id: 'track-2', clips: [clip2] },
      ],
    }
    expect(() => TimelineDataSchema.parse(timeline)).not.toThrow()
  })

  it('applies empty metadata by default', () => {
    const { metadata: _, ...rest } = validTimeline
    const result = TimelineDataSchema.parse(rest)
    expect(result.metadata).toEqual({})
  })
})

// ── parseTimeline ─────────────────────────────────────────────────────────────

describe('parseTimeline', () => {
  it('returns parsed timeline for valid input', () => {
    const result = parseTimeline(validTimeline)
    expect(result.schema_version).toBe(1)
  })

  it('throws for schema_version < 1', () => {
    expect(() => parseTimeline({ ...validTimeline, schema_version: 0 })).toThrow()
  })

  it('applies defaults for missing optional fields', () => {
    const result = parseTimeline({ schema_version: 1 })
    expect(result.tracks).toEqual([])
    expect(result.metadata).toEqual({})
  })
})

// ── safeParseTimeline ─────────────────────────────────────────────────────────

describe('safeParseTimeline', () => {
  it('returns { success: true } for valid input', () => {
    const result = safeParseTimeline(validTimeline)
    expect(result.success).toBe(true)
  })

  it('returns { success: false } for invalid input without throwing', () => {
    const result = safeParseTimeline({ schema_version: 0 })
    expect(result.success).toBe(false)
  })
})

// ── validateTimeline ──────────────────────────────────────────────────────────

describe('validateTimeline', () => {
  it('returns valid=true and empty errors for valid timeline', () => {
    const result = validateTimeline(validTimeline)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns valid=false with non-empty errors for invalid timeline', () => {
    const result = validateTimeline({ schema_version: 0 })
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('includes field path in error message', () => {
    const result = validateTimeline({ schema_version: 0 })
    const errorText = result.errors.join(' ')
    expect(errorText).toContain('schema_version')
  })
})
