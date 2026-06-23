/**
 * Maps between timeline playhead time and underlying media source time.
 * Required when the timeline has multiple video clips (e.g. after style pacing splits).
 */

import type { Clip } from '@/stores/timelineStore'

export function videoClipsSorted(clips: Clip[]): Clip[] {
  return clips
    .filter((c) => c.trackId === 'video')
    .sort((a, b) => a.startTime - b.startTime)
}

function clipSourceEnd(clip: Clip): number {
  const srcStart = clip.sourceStart ?? clip.startTime
  if (clip.sourceEnd != null) return clip.sourceEnd
  const speed = Math.max(0.01, clip.speed ?? 1)
  return srcStart + clip.duration * speed
}

function clipSourceStart(clip: Clip): number {
  return clip.sourceStart ?? clip.startTime
}

/** Timeline playhead → position in the source video file. */
export function timelineToSourceTime(clips: Clip[], timelineTime: number): number {
  const sorted = videoClipsSorted(clips)
  if (sorted.length === 0) return Math.max(0, timelineTime)

  for (const clip of sorted) {
    const end = clip.startTime + clip.duration
    if (timelineTime >= clip.startTime && timelineTime < end - 0.0001) {
      const speed = Math.max(0.01, clip.speed ?? 1)
      const offset = timelineTime - clip.startTime
      return clipSourceStart(clip) + offset * speed
    }
  }

  const next = sorted.find((c) => c.startTime > timelineTime)
  if (next) return clipSourceStart(next)

  const last = sorted[sorted.length - 1]
  return Math.max(0, clipSourceEnd(last) - 0.01)
}

/** Source file position → timeline playhead (for multi-clip timelines). */
export function sourceTimeToTimeline(clips: Clip[], sourceTime: number): number {
  const sorted = videoClipsSorted(clips)
  if (sorted.length === 0) return Math.max(0, sourceTime)

  for (const clip of sorted) {
    const srcStart = clipSourceStart(clip)
    const srcEnd = clipSourceEnd(clip)
    if (sourceTime >= srcStart - 0.001 && sourceTime < srcEnd - 0.001) {
      const speed = Math.max(0.01, clip.speed ?? 1)
      return clip.startTime + (sourceTime - srcStart) / speed
    }
  }

  const last = sorted[sorted.length - 1]
  if (sourceTime >= clipSourceEnd(last)) {
    return last.startTime + last.duration
  }
  return Math.max(0, sourceTime)
}

/** Active video clip at timeline time. */
export function activeVideoClipAt(clips: Clip[], timelineTime: number): Clip | undefined {
  return clips.find(
    (c) =>
      c.trackId === 'video' &&
      timelineTime >= c.startTime &&
      timelineTime < c.startTime + c.duration - 0.0001,
  )
}

/** Active video clip containing a source-file timestamp. */
export function activeVideoClipAtSource(clips: Clip[], sourceTime: number): Clip | undefined {
  const sorted = videoClipsSorted(clips)
  return sorted.find((clip) => {
    const srcStart = clipSourceStart(clip)
    const srcEnd = clipSourceEnd(clip)
    return sourceTime >= srcStart - 0.001 && sourceTime < srcEnd - 0.001
  })
}

/** Next video clip after the given one on the timeline. */
export function nextVideoClip(clips: Clip[], current: Clip): Clip | undefined {
  const sorted = videoClipsSorted(clips)
  const idx = sorted.findIndex((c) => c.id === current.id)
  return idx >= 0 ? sorted[idx + 1] : undefined
}

/** End of the video timeline in seconds. */
export function timelineVideoDuration(clips: Clip[]): number {
  const sorted = videoClipsSorted(clips)
  if (sorted.length === 0) return 0
  return Math.max(...sorted.map((c) => c.startTime + c.duration))
}

/**
 * When playback passes the end of the current clip's source range,
 * return the next clip's source start — only when source is non-contiguous (gap).
 */
export function advanceSourceAtClipBoundary(
  clips: Clip[],
  sourceTime: number,
): number | null {
  const sorted = videoClipsSorted(clips)
  const active = activeVideoClipAtSource(clips, sourceTime)

  if (!active) {
    const timelineT = sourceTimeToTimeline(clips, sourceTime)
    const next = sorted.find((c) => c.startTime > timelineT + 0.001)
    return next ? clipSourceStart(next) : null
  }

  const srcEnd = clipSourceEnd(active)
  if (sourceTime < srcEnd - 0.03) return null

  const next = nextVideoClip(clips, active)
  if (!next) return null

  const nextStart = clipSourceStart(next)
  // Contiguous source — HTML5 video plays through; no seek needed
  if (Math.abs(nextStart - srcEnd) < 0.05) return null
  return nextStart
}
