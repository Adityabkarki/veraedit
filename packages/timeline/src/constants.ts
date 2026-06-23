/**
 * ViraEdit Timeline Engine — Constants
 *
 * Mirrors the Python TrackType and TransitionType enums exactly so the
 * frontend and backend share the same valid values without duplication.
 */

/** Track types — must match Python schemas/timeline.py TrackType enum */
export const TrackType = {
  VIDEO:    'video',
  AUDIO:    'audio',
  CAPTIONS: 'captions',
  OVERLAY:  'overlay',
  MUSIC:    'music',
} as const

export type TrackType = typeof TrackType[keyof typeof TrackType]

/** Transition types — must match Python schemas/timeline.py TransitionType enum */
export const TransitionType = {
  CUT:      'cut',
  FADE:     'fade',
  DISSOLVE: 'dissolve',
  WIPE:     'wipe',
  ZOOM:     'zoom',
  WHIP_PAN: 'whip_pan',
  SLIDE:    'slide',
} as const

export type TransitionType = typeof TransitionType[keyof typeof TransitionType]

/** Schema version — bump when the format changes in a breaking way */
export const SCHEMA_VERSION = 1

/** Default timeline settings — match Python GlobalSettingsModel defaults */
export const DEFAULTS = {
  FPS:               30,
  RESOLUTION:        '1920x1080',
  AUDIO_SAMPLE_RATE: 48000,
  CLIP_SPEED:        1.0,
  CLIP_VOLUME:       1.0,
  TRANSITION_DURATION: 0.5,
} as const

/** Validation limits — match Python ClipModel / GlobalSettingsModel constraints */
export const LIMITS = {
  MIN_FPS:                     1,
  MAX_FPS:                     120,
  MIN_AUDIO_SAMPLE_RATE:       8000,
  MAX_AUDIO_SAMPLE_RATE:       192000,
  MIN_CLIP_SPEED:              0.1,
  MAX_CLIP_SPEED:              10.0,
  MIN_CLIP_VOLUME:             0.0,
  MAX_CLIP_VOLUME:             4.0,
  MIN_TRANSITION_DURATION:     0.0,
  MAX_TRANSITION_DURATION:     5.0,
  MAX_ID_LENGTH:               128,
  MAX_NAME_LENGTH:             255,
  MAX_LABEL_LENGTH:            255,
  MAX_EFFECT_TYPE_LENGTH:      64,
} as const

/** Default track IDs for empty timelines — match Python TimelineDataModel.empty() */
export const DEFAULT_TRACK_IDS = {
  VIDEO:    'track-video-1',
  AUDIO:    'track-audio-1',
  CAPTIONS: 'track-captions',
} as const

/** Default track names — match Python TimelineDataModel.empty() */
export const DEFAULT_TRACK_NAMES = {
  VIDEO:    'Main Video',
  AUDIO:    'Main Audio',
  CAPTIONS: 'Captions',
} as const
