/**
 * ViraEdit Timeline Engine — Factory Functions
 *
 * Create well-formed timeline objects with sensible defaults.
 * All functions return plain objects (no class instances).
 * All IDs must be supplied by the caller — use crypto.randomUUID() in the app.
 */

import {
  DEFAULT_TRACK_IDS,
  DEFAULT_TRACK_NAMES,
  DEFAULTS,
  SCHEMA_VERSION,
  TrackType,
  TransitionType,
} from './constants'
import type {
  Clip,
  ClipTransitions,
  Effect,
  GlobalSettings,
  TimelineData,
  Track,
  Transition,
} from './types'

// ── Primitive factories ───────────────────────────────────────────────────────

/** Create a transition with type and optional duration */
export function createTransition(
  type: TransitionType = TransitionType.FADE,
  duration: number = DEFAULTS.TRANSITION_DURATION
): Transition {
  return { type, duration }
}

/** Create an effect applied to a clip */
export function createEffect(
  type: string,
  params: Record<string, unknown> = {}
): Effect {
  if (!type || type.length === 0) {
    throw new Error('Effect type must not be empty')
  }
  return { type, params }
}

/** Create the in/out transition pair for a clip */
export function createClipTransitions(
  inTransition?: Transition | null,
  outTransition?: Transition | null
): ClipTransitions {
  return {
    in:  inTransition  ?? null,
    out: outTransition ?? null,
  }
}

// ── Clip factory ──────────────────────────────────────────────────────────────

export interface CreateClipOptions {
  /** Unique clip ID (caller-supplied) */
  id: string
  /** Asset UUID string */
  asset_id: string
  /** Window start inside source asset (seconds) */
  source_start: number
  /** Window end inside source asset (seconds) — must be > source_start */
  source_end: number
  /** Position start on project timeline (seconds) */
  timeline_start: number
  /** Position end on project timeline (seconds) — must be > timeline_start */
  timeline_end: number
  speed?: number
  muted?: boolean
  volume?: number
  effects?: Effect[]
  transitions?: ClipTransitions
  label?: string
}

/** Create a clip — all time values in seconds */
export function createClip(opts: CreateClipOptions): Clip {
  if (opts.source_end <= opts.source_start) {
    throw new Error(
      `source_end (${opts.source_end}) must be greater than source_start (${opts.source_start})`
    )
  }
  if (opts.timeline_end <= opts.timeline_start) {
    throw new Error(
      `timeline_end (${opts.timeline_end}) must be greater than timeline_start (${opts.timeline_start})`
    )
  }
  return {
    id:             opts.id,
    asset_id:       opts.asset_id,
    source_start:   opts.source_start,
    source_end:     opts.source_end,
    timeline_start: opts.timeline_start,
    timeline_end:   opts.timeline_end,
    speed:          opts.speed      ?? DEFAULTS.CLIP_SPEED,
    muted:          opts.muted      ?? false,
    volume:         opts.volume     ?? DEFAULTS.CLIP_VOLUME,
    effects:        opts.effects    ?? [],
    transitions:    opts.transitions ?? { in: null, out: null },
    label:          opts.label      ?? '',
  }
}

// ── Track factory ─────────────────────────────────────────────────────────────

export interface CreateTrackOptions {
  /** Unique track ID (caller-supplied) */
  id: string
  type: TrackType
  name?: string
  muted?: boolean
  locked?: boolean
  visible?: boolean
  clips?: Clip[]
}

/** Create a track */
export function createTrack(opts: CreateTrackOptions): Track {
  return {
    id:      opts.id,
    type:    opts.type,
    name:    opts.name    ?? '',
    muted:   opts.muted   ?? false,
    locked:  opts.locked  ?? false,
    visible: opts.visible ?? true,
    clips:   opts.clips   ?? [],
  }
}

// ── Global settings factory ───────────────────────────────────────────────────

export interface CreateGlobalSettingsOptions {
  resolution?: string
  fps?: number
  audio_sample_rate?: number
  duration?: number
}

/** Create global settings with sensible defaults */
export function createGlobalSettings(
  opts: CreateGlobalSettingsOptions = {}
): GlobalSettings {
  return {
    resolution:        opts.resolution        ?? DEFAULTS.RESOLUTION,
    fps:               opts.fps               ?? DEFAULTS.FPS,
    audio_sample_rate: opts.audio_sample_rate ?? DEFAULTS.AUDIO_SAMPLE_RATE,
    duration:          opts.duration          ?? 0,
  }
}

// ── Timeline factory ──────────────────────────────────────────────────────────

export interface CreateTimelineOptions {
  tracks?: Track[]
  global_settings?: Partial<GlobalSettings>
  metadata?: Record<string, unknown>
}

/** Create a timeline data object */
export function createTimeline(opts: CreateTimelineOptions = {}): TimelineData {
  return {
    schema_version:  SCHEMA_VERSION,
    tracks:          opts.tracks ?? [],
    global_settings: createGlobalSettings(opts.global_settings),
    metadata:        opts.metadata ?? {},
  }
}

/**
 * Create a default empty timeline with 3 pre-built tracks:
 *   Main Video, Main Audio, Captions.
 *
 * Matches exactly what the Python API returns via TimelineDataModel.empty()
 * when a project has no saved timeline yet.
 */
export function emptyTimeline(): TimelineData {
  return createTimeline({
    tracks: [
      createTrack({
        id:   DEFAULT_TRACK_IDS.VIDEO,
        type: TrackType.VIDEO,
        name: DEFAULT_TRACK_NAMES.VIDEO,
      }),
      createTrack({
        id:   DEFAULT_TRACK_IDS.AUDIO,
        type: TrackType.AUDIO,
        name: DEFAULT_TRACK_NAMES.AUDIO,
      }),
      createTrack({
        id:   DEFAULT_TRACK_IDS.CAPTIONS,
        type: TrackType.CAPTIONS,
        name: DEFAULT_TRACK_NAMES.CAPTIONS,
      }),
    ],
  })
}
