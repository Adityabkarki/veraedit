/**
 * ViraEdit Timeline Engine — Public API
 *
 * @viraedit/timeline
 *
 * Import from here in the frontend and any package that needs timeline types:
 *   import { createTimeline, emptyTimeline, TrackType } from '@viraedit/timeline'
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  Clip,
  ClipTransitions,
  ClipWithDuration,
  Effect,
  GlobalSettings,
  TimelineData,
  TimelineResponse,
  TimelineSaveRequest,
  TimelineVersionItem,
  Track,
  Transition,
  ValidationResult,
} from './types'

// ── Constants & Enums ─────────────────────────────────────────────────────────
export {
  DEFAULT_TRACK_IDS,
  DEFAULT_TRACK_NAMES,
  DEFAULTS,
  LIMITS,
  SCHEMA_VERSION,
  TrackType,
  TransitionType,
} from './constants'

// ── Schema (Zod) ──────────────────────────────────────────────────────────────
export {
  ClipSchema,
  ClipTransitionsSchema,
  EffectSchema,
  GlobalSettingsSchema,
  TimelineDataSchema,
  TransitionSchema,
  TrackSchema,
  parseTimeline,
  safeParseTimeline,
  validateTimeline,
} from './schema'
export type {
  ClipInput,
  TimelineDataInput,
  TimelineDataOutput,
  TrackInput,
} from './schema'

// ── Factory ───────────────────────────────────────────────────────────────────
export {
  createClip,
  createClipTransitions,
  createEffect,
  createGlobalSettings,
  createTimeline,
  createTrack,
  createTransition,
  emptyTimeline,
} from './factory'
export type {
  CreateClipOptions,
  CreateGlobalSettingsOptions,
  CreateTimelineOptions,
  CreateTrackOptions,
} from './factory'

// ── Compiler ─────────────────────────────────────────────────────────────────
export {
  buildAtempoChain,
  compileTimeline,
} from './compiler'
export type {
  RenderClip,
  RenderInput,
  RenderPlan,
} from './compiler'

// ── Errors ───────────────────────────────────────────────────────────────────
export {
  ClipNotFoundError,
  DuplicateIdError,
  InvalidOperationError,
  TimelineOperationError,
  TrackNotFoundError,
} from './errors'

// ── Operations (pure functions) ───────────────────────────────────────────────
export {
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
} from './operations'

// ── Utilities ─────────────────────────────────────────────────────────────────
export {
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
} from './utils'
