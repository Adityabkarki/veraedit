/**
 * ViraEdit Timeline Engine — Utility Functions
 *
 * Pure functions for querying and measuring timeline data.
 * Input is treated as read-only — no mutation, no side effects.
 */

import { TrackType } from './constants'
import type { Clip, ClipWithDuration, GlobalSettings, TimelineData, Track } from './types'

// ── Track lookups ──────────────────────────────────────────────────────────────

/** Find a track by ID, or undefined */
export function findTrack(timeline: TimelineData, trackId: string): Track | undefined {
  return timeline.tracks.find((t) => t.id === trackId)
}

/** Find a clip across all tracks by ID. Returns { track, clip } or undefined */
export function findClip(
  timeline: TimelineData,
  clipId: string
): { track: Track; clip: Clip } | undefined {
  for (const track of timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return { track, clip }
  }
  return undefined
}

/** Get all video tracks */
export function getVideoTracks(timeline: TimelineData): Track[] {
  return timeline.tracks.filter((t) => t.type === TrackType.VIDEO)
}

/** Get all audio-type tracks (audio + music) */
export function getAudioTracks(timeline: TimelineData): Track[] {
  return timeline.tracks.filter(
    (t) => t.type === TrackType.AUDIO || t.type === TrackType.MUSIC
  )
}

/** Get all caption tracks */
export function getCaptionTracks(timeline: TimelineData): Track[] {
  return timeline.tracks.filter((t) => t.type === TrackType.CAPTIONS)
}

/** Get all overlay tracks */
export function getOverlayTracks(timeline: TimelineData): Track[] {
  return timeline.tracks.filter((t) => t.type === TrackType.OVERLAY)
}

// ── Duration ───────────────────────────────────────────────────────────────────

/**
 * Compute the total timeline duration in seconds.
 * Returns the maximum timeline_end value across all clips on all tracks.
 */
export function computeDuration(timeline: TimelineData): number {
  let maxEnd = 0
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.timeline_end > maxEnd) maxEnd = clip.timeline_end
    }
  }
  return maxEnd
}

/** Source duration of a clip (source_end − source_start) */
export function clipSourceDuration(clip: Clip): number {
  return clip.source_end - clip.source_start
}

/** Timeline duration of a clip (timeline_end − timeline_start) */
export function clipTimelineDuration(clip: Clip): number {
  return clip.timeline_end - clip.timeline_start
}

/** Return a copy of the clip enriched with computed duration properties */
export function withDuration(clip: Clip): ClipWithDuration {
  return {
    ...clip,
    source_duration:   clipSourceDuration(clip),
    timeline_duration: clipTimelineDuration(clip),
  }
}

// ── Frames ↔ Seconds ───────────────────────────────────────────────────────────

/** Convert frame count to seconds at the given fps */
export function framesToSeconds(frames: number, fps: number): number {
  if (fps <= 0) throw new Error(`fps must be positive, got ${fps}`)
  return frames / fps
}

/** Convert seconds to frame count at the given fps (floors to integer) */
export function secondsToFrames(seconds: number, fps: number): number {
  if (fps <= 0) throw new Error(`fps must be positive, got ${fps}`)
  return Math.floor(seconds * fps)
}

// ── Time formatting ────────────────────────────────────────────────────────────

/**
 * Format seconds as HH:MM:SS.mmm
 * Examples:
 *   0        → "00:00:00.000"
 *   65.001   → "00:01:05.001"
 *   3723.456 → "01:02:03.456"
 */
export function formatTime(seconds: number): string {
  if (seconds < 0) seconds = 0
  const ms    = Math.round((seconds % 1) * 1000)
  const total = Math.floor(seconds)
  const ss    = total % 60
  const mm    = Math.floor(total / 60) % 60
  const hh    = Math.floor(total / 3600)
  return (
    String(hh).padStart(2, '0') + ':' +
    String(mm).padStart(2, '0') + ':' +
    String(ss).padStart(2, '0') + '.' +
    String(ms).padStart(3, '0')
  )
}

/**
 * Parse a time string back to seconds.
 * Accepted formats: "HH:MM:SS.mmm", "MM:SS.mmm", "SS.mmm"
 */
export function parseTime(str: string): number {
  const parts = str.split(':').map(Number)
  if (parts.some(isNaN)) throw new Error(`Invalid time string: "${str}"`)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60  + parts[1]
  if (parts.length === 1) return parts[0]
  throw new Error(`Invalid time string: "${str}"`)
}

// ── Overlap detection ──────────────────────────────────────────────────────────

/** Return true if two clips overlap on the timeline */
export function clipsOverlap(a: Clip, b: Clip): boolean {
  return a.timeline_start < b.timeline_end && a.timeline_end > b.timeline_start
}

/**
 * Find all overlapping clip pairs within a track.
 * Returns an array of [clipA, clipB] tuples (sorted by start position first).
 */
export function findOverlaps(track: Track): [Clip, Clip][] {
  const overlaps: [Clip, Clip][] = []
  const sorted = [...track.clips].sort((a, b) => a.timeline_start - b.timeline_start)
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (clipsOverlap(sorted[i], sorted[j])) {
        overlaps.push([sorted[i], sorted[j]])
      }
    }
  }
  return overlaps
}

/** Return true if the track has no overlapping clips */
export function hasNoOverlaps(track: Track): boolean {
  return findOverlaps(track).length === 0
}

// ── Resolution parsing ─────────────────────────────────────────────────────────

/** Parse "1920x1080" → { width: 1920, height: 1080 } */
export function parseResolution(resolution: string): { width: number; height: number } {
  const match = resolution.match(/^(\d+)x(\d+)$/)
  if (!match) throw new Error(`Invalid resolution format: "${resolution}"`)
  return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) }
}

/** Return true if the timeline is portrait (height > width) */
export function isPortrait(settings: GlobalSettings): boolean {
  const { width, height } = parseResolution(settings.resolution)
  return height > width
}

/** Return true if the timeline is landscape (width >= height) */
export function isLandscape(settings: GlobalSettings): boolean {
  return !isPortrait(settings)
}

// ── Summary helpers ────────────────────────────────────────────────────────────

/** Count total clips across all tracks */
export function totalClipCount(timeline: TimelineData): number {
  return timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0)
}

/** Return all clip IDs across all tracks (flattened) */
export function allClipIds(timeline: TimelineData): string[] {
  return timeline.tracks.flatMap((t) => t.clips.map((c) => c.id))
}

/** Return all track IDs */
export function allTrackIds(timeline: TimelineData): string[] {
  return timeline.tracks.map((t) => t.id)
}
