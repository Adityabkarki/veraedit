/**
 * ViraEdit Timeline Engine — Runtime Schema Validation (Zod)
 *
 * These Zod schemas mirror the Python Pydantic models in
 * apps/api/schemas/timeline.py so the frontend can validate timeline
 * data before sending it to the API, catching errors locally first.
 *
 * Same field names, same constraints, same error semantics.
 */

import { z } from 'zod'
import { DEFAULTS, LIMITS, SCHEMA_VERSION, TrackType, TransitionType } from './constants'

// ── Transition ────────────────────────────────────────────────────────────────

export const TransitionSchema = z
  .object({
    type: z.nativeEnum(TransitionType).default(TransitionType.CUT),
    duration: z
      .number()
      .min(LIMITS.MIN_TRANSITION_DURATION)
      .max(LIMITS.MAX_TRANSITION_DURATION)
      .default(DEFAULTS.TRANSITION_DURATION),
  })
  .passthrough()

// ── Effect ────────────────────────────────────────────────────────────────────

export const EffectSchema = z
  .object({
    type: z
      .string()
      .min(1, 'Effect type must not be empty')
      .max(LIMITS.MAX_EFFECT_TYPE_LENGTH),
    params: z.record(z.unknown()).default({}),
  })
  .passthrough()

// ── Clip Transitions ──────────────────────────────────────────────────────────

export const ClipTransitionsSchema = z
  .object({
    in: TransitionSchema.nullable().optional(),
    out: TransitionSchema.nullable().optional(),
  })
  .passthrough()

// ── Clip ─────────────────────────────────────────────────────────────────────

export const ClipSchema = z
  .object({
    id: z.string().min(1).max(LIMITS.MAX_ID_LENGTH),
    asset_id: z.string().min(1).max(LIMITS.MAX_ID_LENGTH),
    source_start: z.number().min(0),
    source_end: z.number().min(0),
    timeline_start: z.number().min(0),
    timeline_end: z.number().min(0),
    speed: z
      .number()
      .min(LIMITS.MIN_CLIP_SPEED)
      .max(LIMITS.MAX_CLIP_SPEED)
      .default(DEFAULTS.CLIP_SPEED),
    muted: z.boolean().default(false),
    volume: z
      .number()
      .min(LIMITS.MIN_CLIP_VOLUME)
      .max(LIMITS.MAX_CLIP_VOLUME)
      .default(DEFAULTS.CLIP_VOLUME),
    effects: z.array(EffectSchema).default([]),
    transitions: ClipTransitionsSchema.default({}),
    label: z.string().max(LIMITS.MAX_LABEL_LENGTH).default(''),
  })
  .passthrough()
  .refine(
    (c) => c.source_end > c.source_start,
    (c) => ({
      message: `source_end (${c.source_end}) must be greater than source_start (${c.source_start})`,
      path: ['source_end'],
    })
  )
  .refine(
    (c) => c.timeline_end > c.timeline_start,
    (c) => ({
      message: `timeline_end (${c.timeline_end}) must be greater than timeline_start (${c.timeline_start})`,
      path: ['timeline_end'],
    })
  )

// ── Track ─────────────────────────────────────────────────────────────────────

export const TrackSchema = z
  .object({
    id: z.string().min(1).max(LIMITS.MAX_ID_LENGTH),
    type: z.nativeEnum(TrackType),
    name: z.string().max(LIMITS.MAX_NAME_LENGTH).default(''),
    muted: z.boolean().default(false),
    locked: z.boolean().default(false),
    visible: z.boolean().default(true),
    clips: z.array(ClipSchema).default([]),
  })
  .passthrough()

// ── Global Settings ────────────────────────────────────────────────────────────

export const GlobalSettingsSchema = z
  .object({
    resolution: z
      .string()
      .regex(/^\d+x\d+$/, { message: 'resolution must be in format WxH (e.g. "1920x1080")' })
      .default(DEFAULTS.RESOLUTION),
    fps: z
      .number()
      .min(LIMITS.MIN_FPS)
      .max(LIMITS.MAX_FPS)
      .default(DEFAULTS.FPS),
    audio_sample_rate: z
      .number()
      .int()
      .min(LIMITS.MIN_AUDIO_SAMPLE_RATE)
      .max(LIMITS.MAX_AUDIO_SAMPLE_RATE)
      .default(DEFAULTS.AUDIO_SAMPLE_RATE),
    duration: z.number().min(0).default(0),
  })
  .passthrough()

// ── Timeline Data ──────────────────────────────────────────────────────────────

export const TimelineDataSchema = z
  .object({
    schema_version: z.number().int().min(1).default(SCHEMA_VERSION),
    tracks: z.array(TrackSchema).default([]),
    global_settings: GlobalSettingsSchema.default({}),
    metadata: z.record(z.unknown()).default({}),
  })
  .passthrough()
  .refine(
    (tl) => {
      const ids = tl.tracks.map((t) => t.id)
      return ids.length === new Set(ids).size
    },
    { message: 'All track IDs must be unique within the timeline', path: ['tracks'] }
  )
  .refine(
    (tl) => {
      const clipIds = tl.tracks.flatMap((t) => t.clips.map((c) => c.id))
      return clipIds.length === new Set(clipIds).size
    },
    { message: 'All clip IDs must be unique across all tracks', path: ['tracks'] }
  )

// ── Convenience functions ─────────────────────────────────────────────────────

/**
 * Parse and validate a raw timeline object.
 * Applies defaults and throws ZodError if invalid.
 */
export function parseTimeline(raw: unknown) {
  return TimelineDataSchema.parse(raw)
}

/**
 * Validate a raw timeline object without throwing.
 * Returns { success: true, data } or { success: false, error }.
 */
export function safeParseTimeline(raw: unknown) {
  return TimelineDataSchema.safeParse(raw)
}

/**
 * Validate and return human-readable error messages.
 */
export function validateTimeline(raw: unknown): { valid: boolean; errors: string[] } {
  const result = TimelineDataSchema.safeParse(raw)
  if (result.success) return { valid: true, errors: [] }
  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) =>
        issue.path.length > 0
          ? `${issue.path.join('.')}: ${issue.message}`
          : issue.message
    ),
  }
}

// ── Zod inferred types (for TypeScript inference) ─────────────────────────────

export type TimelineDataInput  = z.input<typeof TimelineDataSchema>
export type TimelineDataOutput = z.output<typeof TimelineDataSchema>
export type TrackInput         = z.input<typeof TrackSchema>
export type ClipInput          = z.input<typeof ClipSchema>
