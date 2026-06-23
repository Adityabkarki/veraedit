/**
 * EP-3.1 — constants.ts tests
 *
 * Verifies that all enum values, defaults, and limits match the
 * Python TrackType / TransitionType enums and field constraints.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TRACK_IDS,
  DEFAULT_TRACK_NAMES,
  DEFAULTS,
  LIMITS,
  SCHEMA_VERSION,
  TrackType,
  TransitionType,
} from '../src/constants'

describe('TrackType', () => {
  it('has exactly 5 track types', () => {
    expect(Object.keys(TrackType)).toHaveLength(5)
  })

  it('VIDEO is "video"', () => {
    expect(TrackType.VIDEO).toBe('video')
  })

  it('AUDIO is "audio"', () => {
    expect(TrackType.AUDIO).toBe('audio')
  })

  it('CAPTIONS is "captions"', () => {
    expect(TrackType.CAPTIONS).toBe('captions')
  })

  it('OVERLAY is "overlay"', () => {
    expect(TrackType.OVERLAY).toBe('overlay')
  })

  it('MUSIC is "music"', () => {
    expect(TrackType.MUSIC).toBe('music')
  })
})

describe('TransitionType', () => {
  it('has exactly 7 transition types', () => {
    expect(Object.keys(TransitionType)).toHaveLength(7)
  })

  it('CUT is "cut"', () => {
    expect(TransitionType.CUT).toBe('cut')
  })

  it('FADE is "fade"', () => {
    expect(TransitionType.FADE).toBe('fade')
  })

  it('DISSOLVE is "dissolve"', () => {
    expect(TransitionType.DISSOLVE).toBe('dissolve')
  })

  it('WIPE is "wipe"', () => {
    expect(TransitionType.WIPE).toBe('wipe')
  })

  it('ZOOM is "zoom"', () => {
    expect(TransitionType.ZOOM).toBe('zoom')
  })

  it('WHIP_PAN is "whip_pan"', () => {
    expect(TransitionType.WHIP_PAN).toBe('whip_pan')
  })

  it('SLIDE is "slide"', () => {
    expect(TransitionType.SLIDE).toBe('slide')
  })
})

describe('SCHEMA_VERSION', () => {
  it('is 1', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})

describe('DEFAULTS', () => {
  it('FPS is 30', () => {
    expect(DEFAULTS.FPS).toBe(30)
  })

  it('RESOLUTION is 1920x1080', () => {
    expect(DEFAULTS.RESOLUTION).toBe('1920x1080')
  })

  it('AUDIO_SAMPLE_RATE is 48000', () => {
    expect(DEFAULTS.AUDIO_SAMPLE_RATE).toBe(48000)
  })

  it('CLIP_SPEED is 1.0', () => {
    expect(DEFAULTS.CLIP_SPEED).toBe(1.0)
  })

  it('CLIP_VOLUME is 1.0', () => {
    expect(DEFAULTS.CLIP_VOLUME).toBe(1.0)
  })

  it('TRANSITION_DURATION is 0.5', () => {
    expect(DEFAULTS.TRANSITION_DURATION).toBe(0.5)
  })
})

describe('LIMITS', () => {
  it('MIN_FPS is 1', () => {
    expect(LIMITS.MIN_FPS).toBe(1)
  })

  it('MAX_FPS is 120', () => {
    expect(LIMITS.MAX_FPS).toBe(120)
  })

  it('MIN_CLIP_SPEED is 0.1', () => {
    expect(LIMITS.MIN_CLIP_SPEED).toBe(0.1)
  })

  it('MAX_CLIP_SPEED is 10.0', () => {
    expect(LIMITS.MAX_CLIP_SPEED).toBe(10.0)
  })

  it('MAX_CLIP_VOLUME is 4.0', () => {
    expect(LIMITS.MAX_CLIP_VOLUME).toBe(4.0)
  })

  it('MIN_CLIP_VOLUME is 0.0', () => {
    expect(LIMITS.MIN_CLIP_VOLUME).toBe(0.0)
  })

  it('MAX_TRANSITION_DURATION is 5.0', () => {
    expect(LIMITS.MAX_TRANSITION_DURATION).toBe(5.0)
  })
})

describe('DEFAULT_TRACK_IDS', () => {
  it('VIDEO track ID is "track-video-1"', () => {
    expect(DEFAULT_TRACK_IDS.VIDEO).toBe('track-video-1')
  })

  it('AUDIO track ID is "track-audio-1"', () => {
    expect(DEFAULT_TRACK_IDS.AUDIO).toBe('track-audio-1')
  })

  it('CAPTIONS track ID is "track-captions"', () => {
    expect(DEFAULT_TRACK_IDS.CAPTIONS).toBe('track-captions')
  })
})

describe('DEFAULT_TRACK_NAMES', () => {
  it('VIDEO track name is "Main Video"', () => {
    expect(DEFAULT_TRACK_NAMES.VIDEO).toBe('Main Video')
  })

  it('AUDIO track name is "Main Audio"', () => {
    expect(DEFAULT_TRACK_NAMES.AUDIO).toBe('Main Audio')
  })

  it('CAPTIONS track name is "Captions"', () => {
    expect(DEFAULT_TRACK_NAMES.CAPTIONS).toBe('Captions')
  })
})
