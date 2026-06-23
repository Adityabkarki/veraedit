/**
 * ViraEdit Timeline Engine — Timeline Operations (Pure Functions)
 *
 * Every function:
 *   1. Accepts a TimelineData as first argument (read-only)
 *   2. Returns a NEW TimelineData (structuredClone — never mutates input)
 *   3. Throws a typed error for invalid operations
 *
 * This is the "edit layer" the frontend dispatches through.
 * The Python API stores each result as a new timeline version row.
 */

import { LIMITS } from './constants'
import {
  ClipNotFoundError,
  DuplicateIdError,
  InvalidOperationError,
  TrackNotFoundError,
} from './errors'
import type { Clip, Effect, GlobalSettings, TimelineData, Track, Transition } from './types'

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Deep clone via structuredClone (Node 17+, all modern browsers) */
function clone<T>(value: T): T {
  return structuredClone(value)
}

/** Return the index of the track with the given ID, or throw TrackNotFoundError */
function requireTrackIndex(tracks: Track[], trackId: string): number {
  const idx = tracks.findIndex((t) => t.id === trackId)
  if (idx === -1) throw new TrackNotFoundError(trackId)
  return idx
}

/** Return { trackIndex, clipIndex } for a clipId, or throw ClipNotFoundError */
function requireClipLocation(
  tracks: Track[],
  clipId: string
): { trackIndex: number; clipIndex: number } {
  for (let ti = 0; ti < tracks.length; ti++) {
    const ci = tracks[ti].clips.findIndex((c) => c.id === clipId)
    if (ci !== -1) return { trackIndex: ti, clipIndex: ci }
  }
  throw new ClipNotFoundError(clipId)
}

/** Throw DuplicateIdError if clipId already exists in any track */
function assertClipIdUnique(tracks: Track[], clipId: string): void {
  for (const track of tracks) {
    if (track.clips.some((c) => c.id === clipId)) {
      throw new DuplicateIdError(clipId, 'clip')
    }
  }
}

/** Throw DuplicateIdError if trackId already exists */
function assertTrackIdUnique(tracks: Track[], trackId: string): void {
  if (tracks.some((t) => t.id === trackId)) {
    throw new DuplicateIdError(trackId, 'track')
  }
}

// ── Clip operations ───────────────────────────────────────────────────────────

/**
 * Add a clip to an existing track.
 *
 * @throws TrackNotFoundError  — trackId not in timeline
 * @throws DuplicateIdError    — clip.id already exists
 */
export function addClip(
  timeline: TimelineData,
  trackId: string,
  clip: Clip
): TimelineData {
  const tl = clone(timeline)
  const ti = requireTrackIndex(tl.tracks, trackId)
  assertClipIdUnique(tl.tracks, clip.id)
  tl.tracks[ti].clips.push(clone(clip))
  return tl
}

/**
 * Remove a clip from the timeline (leaves a gap in the track).
 *
 * @throws ClipNotFoundError — clipId not found in any track
 */
export function removeClip(
  timeline: TimelineData,
  clipId: string
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  tl.tracks[trackIndex].clips.splice(clipIndex, 1)
  return tl
}

/**
 * Ripple-delete a clip:
 *   1. Removes the clip.
 *   2. Shifts every clip that starts AT OR AFTER the deleted clip's end
 *      left by the deleted clip's timeline duration (closes the gap).
 *   Only clips on the SAME track are shifted.
 *
 * @throws ClipNotFoundError — clipId not found
 */
export function rippleDelete(
  timeline: TimelineData,
  clipId: string
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const track = tl.tracks[trackIndex]
  const removed = track.clips[clipIndex]
  const gapDuration = removed.timeline_end - removed.timeline_start

  track.clips.splice(clipIndex, 1)

  // Close the gap — shift subsequent clips left
  for (const clip of track.clips) {
    if (clip.timeline_start >= removed.timeline_end) {
      clip.timeline_start -= gapDuration
      clip.timeline_end   -= gapDuration
    }
  }
  return tl
}

/**
 * Split a clip at a timeline position (seconds).
 * Returns two clips that together span the original:
 *   first:  [clip.timeline_start, splitAtSeconds]
 *   second: [splitAtSeconds, clip.timeline_end]
 *
 * Source ranges are calculated proportionally for the clip's speed.
 * New IDs: `${clipId}-a` and `${clipId}-b`.
 *
 * @throws ClipNotFoundError   — clipId not found
 * @throws InvalidOperationError — splitAtSeconds outside clip range
 */
export function splitClip(
  timeline: TimelineData,
  clipId: string,
  splitAtSeconds: number
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const track = tl.tracks[trackIndex]
  const clip  = track.clips[clipIndex]

  if (splitAtSeconds <= clip.timeline_start || splitAtSeconds >= clip.timeline_end) {
    throw new InvalidOperationError(
      `splitAt (${splitAtSeconds}s) must be strictly inside the clip range ` +
      `[${clip.timeline_start}s, ${clip.timeline_end}s]`
    )
  }

  // Distance from clip start → split point, mapped to source space
  const tlOffset  = splitAtSeconds - clip.timeline_start
  const srcOffset = tlOffset * clip.speed
  const splitSrc  = clip.source_start + srcOffset

  const first: Clip  = { ...clone(clip), id: `${clip.id}-a`, timeline_end:   splitAtSeconds, source_end:   splitSrc }
  const second: Clip = { ...clone(clip), id: `${clip.id}-b`, timeline_start: splitAtSeconds, source_start: splitSrc }

  track.clips.splice(clipIndex, 1, first, second)
  return tl
}

/**
 * Trim the start of a clip inward (makes it shorter from the left side).
 * timeline_start advances to newTimelineStart.
 * source_start advances proportionally based on clip speed.
 *
 * @throws ClipNotFoundError    — clipId not found
 * @throws InvalidOperationError — newTimelineStart outside valid range
 */
export function trimClipStart(
  timeline: TimelineData,
  clipId: string,
  newTimelineStart: number
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const clip = tl.tracks[trackIndex].clips[clipIndex]

  if (newTimelineStart <= clip.timeline_start || newTimelineStart >= clip.timeline_end) {
    throw new InvalidOperationError(
      `newTimelineStart (${newTimelineStart}s) must be strictly inside ` +
      `(${clip.timeline_start}s, ${clip.timeline_end}s)`
    )
  }

  const trimDuration   = newTimelineStart - clip.timeline_start
  clip.source_start   += trimDuration * clip.speed
  clip.timeline_start  = newTimelineStart
  return tl
}

/**
 * Trim the end of a clip inward (makes it shorter from the right side).
 * timeline_end retreats to newTimelineEnd.
 * source_end retreats proportionally based on clip speed.
 *
 * @throws ClipNotFoundError    — clipId not found
 * @throws InvalidOperationError — newTimelineEnd outside valid range
 */
export function trimClipEnd(
  timeline: TimelineData,
  clipId: string,
  newTimelineEnd: number
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const clip = tl.tracks[trackIndex].clips[clipIndex]

  if (newTimelineEnd >= clip.timeline_end || newTimelineEnd <= clip.timeline_start) {
    throw new InvalidOperationError(
      `newTimelineEnd (${newTimelineEnd}s) must be strictly inside ` +
      `(${clip.timeline_start}s, ${clip.timeline_end}s)`
    )
  }

  const trimDuration  = clip.timeline_end - newTimelineEnd
  clip.source_end    -= trimDuration * clip.speed
  clip.timeline_end   = newTimelineEnd
  return tl
}

/**
 * Move a clip to a new timeline position (non-destructive — other clips stay put).
 * Clip duration is preserved. Does NOT ripple adjacent clips.
 *
 * @throws ClipNotFoundError    — clipId not found
 * @throws InvalidOperationError — newTimelineStart < 0
 */
export function moveClip(
  timeline: TimelineData,
  clipId: string,
  newTimelineStart: number
): TimelineData {
  if (newTimelineStart < 0) {
    throw new InvalidOperationError(
      `newTimelineStart (${newTimelineStart}s) must be >= 0`
    )
  }

  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const clip     = tl.tracks[trackIndex].clips[clipIndex]
  const duration = clip.timeline_end - clip.timeline_start

  clip.timeline_start = newTimelineStart
  clip.timeline_end   = newTimelineStart + duration
  return tl
}

/**
 * Change the playback speed of a clip.
 * The source window (source_start → source_end) is preserved.
 * timeline_end is recalculated so the clip covers the same source content.
 *   Example: 30s of source at 2× speed → 15s on timeline.
 *
 * @throws ClipNotFoundError    — clipId not found
 * @throws InvalidOperationError — speed outside [0.1, 10.0]
 */
export function setClipSpeed(
  timeline: TimelineData,
  clipId: string,
  speed: number
): TimelineData {
  if (speed < LIMITS.MIN_CLIP_SPEED || speed > LIMITS.MAX_CLIP_SPEED) {
    throw new InvalidOperationError(
      `speed (${speed}) must be between ${LIMITS.MIN_CLIP_SPEED} and ${LIMITS.MAX_CLIP_SPEED}`
    )
  }

  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const clip         = tl.tracks[trackIndex].clips[clipIndex]
  const sourceDuration = clip.source_end - clip.source_start

  clip.speed        = speed
  clip.timeline_end = clip.timeline_start + sourceDuration / speed
  return tl
}

/**
 * Set the volume of a clip (0.0 = silent, 1.0 = normal, 4.0 = max boost).
 *
 * @throws ClipNotFoundError    — clipId not found
 * @throws InvalidOperationError — volume outside [0.0, 4.0]
 */
export function setClipVolume(
  timeline: TimelineData,
  clipId: string,
  volume: number
): TimelineData {
  if (volume < LIMITS.MIN_CLIP_VOLUME || volume > LIMITS.MAX_CLIP_VOLUME) {
    throw new InvalidOperationError(
      `volume (${volume}) must be between ${LIMITS.MIN_CLIP_VOLUME} and ${LIMITS.MAX_CLIP_VOLUME}`
    )
  }

  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  tl.tracks[trackIndex].clips[clipIndex].volume = volume
  return tl
}

/**
 * Mute or unmute a specific clip.
 *
 * @throws ClipNotFoundError — clipId not found
 */
export function setClipMuted(
  timeline: TimelineData,
  clipId: string,
  muted: boolean
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  tl.tracks[trackIndex].clips[clipIndex].muted = muted
  return tl
}

/**
 * Set the in or out transition on a clip.
 *
 * @param side — 'in' (at the clip start) or 'out' (at the clip end)
 * @param transition — null to remove the transition
 *
 * @throws ClipNotFoundError — clipId not found
 */
export function setClipTransition(
  timeline: TimelineData,
  clipId: string,
  side: 'in' | 'out',
  transition: Transition | null
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  tl.tracks[trackIndex].clips[clipIndex].transitions[side] = transition
  return tl
}

/**
 * Add (or replace) an effect on a clip.
 * If an effect with the same `type` already exists it is replaced, not duplicated.
 *
 * @throws ClipNotFoundError — clipId not found
 */
export function addEffect(
  timeline: TimelineData,
  clipId: string,
  effect: Effect
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const clip = tl.tracks[trackIndex].clips[clipIndex]
  const existingIdx = clip.effects.findIndex((e) => e.type === effect.type)
  if (existingIdx !== -1) {
    clip.effects[existingIdx] = clone(effect)
  } else {
    clip.effects.push(clone(effect))
  }
  return tl
}

/**
 * Remove an effect from a clip by its type name.
 * No-op if the effect does not exist (returns unchanged timeline copy).
 *
 * @throws ClipNotFoundError — clipId not found
 */
export function removeEffect(
  timeline: TimelineData,
  clipId: string,
  effectType: string
): TimelineData {
  const tl = clone(timeline)
  const { trackIndex, clipIndex } = requireClipLocation(tl.tracks, clipId)
  const clip = tl.tracks[trackIndex].clips[clipIndex]
  clip.effects = clip.effects.filter((e) => e.type !== effectType)
  return tl
}

// ── Track operations ──────────────────────────────────────────────────────────

/**
 * Append a track to the end of the tracks array.
 *
 * @throws DuplicateIdError — track.id already exists
 */
export function addTrack(
  timeline: TimelineData,
  track: Track
): TimelineData {
  const tl = clone(timeline)
  assertTrackIdUnique(tl.tracks, track.id)
  tl.tracks.push(clone(track))
  return tl
}

/**
 * Remove a track and all its clips.
 *
 * @throws TrackNotFoundError — trackId not found
 */
export function removeTrack(
  timeline: TimelineData,
  trackId: string
): TimelineData {
  const tl = clone(timeline)
  const ti = requireTrackIndex(tl.tracks, trackId)
  tl.tracks.splice(ti, 1)
  return tl
}

/**
 * Move a track to a new position in the tracks array.
 * newIndex is clamped to [0, tracks.length − 1] so it's always safe.
 *
 * @throws TrackNotFoundError — trackId not found
 */
export function moveTrack(
  timeline: TimelineData,
  trackId: string,
  newIndex: number
): TimelineData {
  const tl = clone(timeline)
  const ti = requireTrackIndex(tl.tracks, trackId)
  const [track] = tl.tracks.splice(ti, 1)
  const safeIndex = Math.max(0, Math.min(newIndex, tl.tracks.length))
  tl.tracks.splice(safeIndex, 0, track)
  return tl
}

/**
 * Mute or unmute a track (affects all clips on the track during render).
 *
 * @throws TrackNotFoundError — trackId not found
 */
export function setTrackMuted(
  timeline: TimelineData,
  trackId: string,
  muted: boolean
): TimelineData {
  const tl = clone(timeline)
  const ti = requireTrackIndex(tl.tracks, trackId)
  tl.tracks[ti].muted = muted
  return tl
}

/**
 * Lock or unlock a track (locked tracks cannot be edited in the UI).
 *
 * @throws TrackNotFoundError — trackId not found
 */
export function setTrackLocked(
  timeline: TimelineData,
  trackId: string,
  locked: boolean
): TimelineData {
  const tl = clone(timeline)
  const ti = requireTrackIndex(tl.tracks, trackId)
  tl.tracks[ti].locked = locked
  return tl
}

/**
 * Show or hide a track in the preview.
 *
 * @throws TrackNotFoundError — trackId not found
 */
export function setTrackVisible(
  timeline: TimelineData,
  trackId: string,
  visible: boolean
): TimelineData {
  const tl = clone(timeline)
  const ti = requireTrackIndex(tl.tracks, trackId)
  tl.tracks[ti].visible = visible
  return tl
}

// ── Timeline-level operations ──────────────────────────────────────────────────

/**
 * Merge partial global settings into the timeline's current settings.
 * Unspecified fields are preserved.
 */
export function updateGlobalSettings(
  timeline: TimelineData,
  settings: Partial<GlobalSettings>
): TimelineData {
  const tl = clone(timeline)
  tl.global_settings = { ...tl.global_settings, ...settings }
  return tl
}
