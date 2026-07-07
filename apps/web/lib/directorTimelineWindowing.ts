/**
 * Director timeline windowing helpers (Phase 15).
 */
import type { DirectorTimeline } from '@/types/director'

const TRACK_KEYS = [
  'video',
  'audio',
  'captions',
  'broll',
  'motionGraphics',
  'transitions',
  'vfx',
  'sfx',
  'multicam',
] as const

type TrackKey = (typeof TRACK_KEYS)[number]

function entryFrameRange(
  trackName: TrackKey,
  entry: Record<string, unknown>,
): [number, number] {
  if (trackName === 'transitions') {
    const atFrame = Number(entry.atFrame ?? 0)
    const duration = Number(entry.durationInFrames ?? 0)
    return [atFrame, atFrame + Math.max(duration, 1)]
  }
  const start = Number(entry.startFrame ?? 0)
  const duration = Number(entry.durationInFrames ?? 0)
  const endFrame = Number(entry.endFrame ?? 0)
  if (endFrame > start) return [start, endFrame]
  return [start, start + Math.max(duration, 1)]
}

function entryIntersectsWindow(
  trackName: TrackKey,
  entry: Record<string, unknown>,
  startFrame: number,
  endFrame: number,
): boolean {
  const [start, end] = entryFrameRange(trackName, entry)
  return end >= startFrame && start <= endFrame
}

/** Keep only track entries intersecting the frame window. */
export function trimDirectorTimelineToFrameWindow(
  timeline: DirectorTimeline,
  startFrame: number,
  endFrame: number,
): DirectorTimeline {
  const tracks = { ...timeline.tracks }
  for (const key of TRACK_KEYS) {
    const entries = (tracks[key] as Record<string, unknown>[]) ?? []
    tracks[key] = entries.filter((e) =>
      entryIntersectsWindow(key, e, startFrame, endFrame),
    ) as never
  }
  const fps = timeline.fps || 30
  const triggers = (timeline.triggers ?? []).filter((t) => {
    const start = Math.floor(t.transcriptStart * fps)
    const end = Math.ceil(t.transcriptEnd * fps)
    return end >= startFrame && start <= endFrame
  })
  return { ...timeline, tracks, triggers }
}

/** Merge a window slice: replace in-window entries, keep out-of-window entries. */
export function mergeDirectorTimelineWindowSlice(
  base: DirectorTimeline,
  slice: DirectorTimeline,
  startFrame: number,
  endFrame: number,
): DirectorTimeline {
  const tracks = { ...base.tracks }
  for (const key of TRACK_KEYS) {
    const existing = ((tracks[key] as Record<string, unknown>[]) ?? []).filter(
      (e) => !entryIntersectsWindow(key, e, startFrame, endFrame),
    )
    const incoming = (slice.tracks[key] as Record<string, unknown>[]) ?? []
    tracks[key] = [...existing, ...incoming] as never
  }
  return { ...base, tracks }
}

export function directorTimelineEntryCount(timeline: DirectorTimeline): number {
  let count = 0
  for (const key of TRACK_KEYS) {
    count += ((timeline.tracks[key] as unknown[]) ?? []).length
  }
  return count
}

export function shouldUseDirectorWindowing(timeline: DirectorTimeline): boolean {
  const durationSec = timeline.durationInFrames / Math.max(timeline.fps, 1)
  return (
    directorTimelineEntryCount(timeline) > 150 ||
    durationSec > 15 * 60
  )
}

export function emptyDirectorTrackShell(timeline: DirectorTimeline): DirectorTimeline {
  const emptyTracks = {} as DirectorTimeline['tracks']
  for (const key of TRACK_KEYS) {
    emptyTracks[key] = [] as never
  }
  return { ...timeline, tracks: emptyTracks, triggers: [] }
}
