/**
 * ViraEdit Timeline Engine — TypeScript Types
 *
 * These interfaces mirror the Python Pydantic schemas in
 * apps/api/schemas/timeline.py exactly.
 *
 * Field names use snake_case to match the JSON returned by the API.
 * The frontend serialises/deserialises these as-is (no camelCase transform).
 */

import type { TrackType, TransitionType } from './constants'

// ── Effects & Transitions ──────────────────────────────────────────────────────

/** An effect applied to a clip (color grade, LUT, speed ramp, caption style…) */
export interface Effect {
  type: string
  params: Record<string, unknown>
  [key: string]: unknown   // forward-compatible extra fields
}

/** A clip transition (fade in, wipe out, etc.) */
export interface Transition {
  type: TransitionType
  duration: number
  [key: string]: unknown   // forward-compatible extra fields
}

/** In/out transitions for a clip */
export interface ClipTransitions {
  in?: Transition | null
  out?: Transition | null
}

// ── Clip ──────────────────────────────────────────────────────────────────────

/**
 * A single clip placed on the timeline.
 *
 * source_start / source_end:     the window INSIDE the source asset (seconds)
 * timeline_start / timeline_end: the position ON the project timeline (seconds)
 * speed: 1.0 = normal, 2.0 = double speed, 0.5 = slow-mo
 */
export interface Clip {
  id: string
  asset_id: string
  source_start: number
  source_end: number
  timeline_start: number
  timeline_end: number
  speed: number
  muted: boolean
  volume: number
  effects: Effect[]
  transitions: ClipTransitions
  label: string
  [key: string]: unknown   // forward-compatible extra fields
}

// ── Track ─────────────────────────────────────────────────────────────────────

/** A single track (video, audio, captions, overlay, music) */
export interface Track {
  id: string
  type: TrackType
  name: string
  muted: boolean
  locked: boolean
  visible: boolean
  clips: Clip[]
  [key: string]: unknown   // forward-compatible extra fields
}

// ── Global Settings ────────────────────────────────────────────────────────────

/** Project-level output settings */
export interface GlobalSettings {
  resolution: string       // e.g. "1920x1080"
  fps: number
  audio_sample_rate: number
  duration: number         // total timeline duration in seconds
  [key: string]: unknown
}

// ── Timeline ──────────────────────────────────────────────────────────────────

/** The full timeline data payload — stored in the DB as JSONB */
export interface TimelineData {
  schema_version: number
  tracks: Track[]
  global_settings: GlobalSettings
  metadata: Record<string, unknown>
}

// ── API response shapes ───────────────────────────────────────────────────────

/** Response from GET /timeline and PUT /timeline */
export interface TimelineResponse {
  id: string | null
  version: number
  label: string
  data: TimelineData
  parent_id: string | null
  can_undo: boolean
  can_redo: boolean
  created_at: string | null
  updated_at: string | null
}

/** One entry in GET /timeline/versions */
export interface TimelineVersionItem {
  id: string
  version: number
  label: string
  is_active: boolean
  parent_id: string | null
  created_at: string
}

/** Body for PUT /timeline */
export interface TimelineSaveRequest {
  data: TimelineData
  label?: string
}

// ── Derived / computed types ──────────────────────────────────────────────────

/** Clip with computed duration properties (returned by withDuration()) */
export interface ClipWithDuration extends Clip {
  source_duration: number
  timeline_duration: number
}

/** Result of a validateTimeline() call */
export interface ValidationResult {
  valid: boolean
  errors: string[]
}
