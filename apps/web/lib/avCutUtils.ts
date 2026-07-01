/**
 * Source-time cut utilities — rebuild video/audio clips after removing ranges.
 *
 * Cut timestamps come from the transcript (seconds in the original source file).
 * After cuts, timeline playhead maps through sourceStart/sourceEnd on each clip.
 */

import type { Clip } from '@/stores/timelineStore'

export interface TimeRange {
  start: number
  end: number
}

export function mergeCutRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => r.end > r.start + 0.001)
    .sort((a, b) => a.start - b.start)
  const merged: TimeRange[] = []
  for (const r of sorted) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end + 0.001) {
      last.end = Math.max(last.end, r.end)
    } else {
      merged.push({ start: r.start, end: r.end })
    }
  }
  return merged
}

export function cutsToKeepSegments(totalDuration: number, cuts: TimeRange[]): TimeRange[] {
  const merged = mergeCutRanges(cuts)
  if (merged.length === 0) {
    return totalDuration > 0 ? [{ start: 0, end: totalDuration }] : []
  }
  const keep: TimeRange[] = []
  let cursor = 0
  for (const cut of merged) {
    if (cut.start > cursor + 0.001) {
      keep.push({ start: cursor, end: cut.start })
    }
    cursor = Math.max(cursor, cut.end)
  }
  if (cursor < totalDuration - 0.001) {
    keep.push({ start: cursor, end: totalDuration })
  }
  return keep
}

/** Map a timestamp in the original source file to the edited timeline. */
export function mapSourceTimeToEdited(sourceTime: number, cuts: TimeRange[]): number {
  const merged = mergeCutRanges(cuts)
  let removed = 0
  for (const cut of merged) {
    if (sourceTime <= cut.start + 0.001) break
    if (sourceTime >= cut.end - 0.001) {
      removed += cut.end - cut.start
      continue
    }
    return cut.start - removed
  }
  return Math.max(0, sourceTime - removed)
}

export function maxAvSourceEnd(clips: Clip[]): number {
  const av = clips.filter((c) => c.trackId === 'video' || c.trackId === 'audio')
  if (av.length === 0) return 0
  return Math.max(
    ...av.map((c) => c.sourceEnd ?? (c.sourceStart ?? c.startTime) + c.duration),
  )
}

export function rebuildAvClipsFromKeepSegments(clips: Clip[], keep: TimeRange[]): Clip[] {
  const videoTemplate = clips.find((c) => c.trackId === 'video')
  const audioTemplate = clips.find((c) => c.trackId === 'audio')
  if (!videoTemplate || keep.length === 0) return []

  const result: Clip[] = []
  let timelineCursor = 0

  keep.forEach((seg, i) => {
    const dur = seg.end - seg.start
    if (dur < 0.01) return

    result.push({
      ...videoTemplate,
      id: `${videoTemplate.id}-seg-${i}`,
      trackId: 'video',
      startTime: timelineCursor,
      duration: dur,
      sourceStart: seg.start,
      sourceEnd: seg.end,
    })

    if (audioTemplate) {
      result.push({
        ...audioTemplate,
        id: `${audioTemplate.id}-seg-${i}`,
        trackId: 'audio',
        startTime: timelineCursor,
        duration: dur,
        sourceStart: seg.start,
        sourceEnd: seg.end,
      })
    }

    timelineCursor += dur
  })

  return result
}

/** Shift or drop overlay/caption clips after source-time cuts. */
export function rippleCompanionClips(clips: Clip[], cuts: TimeRange[]): Clip[] {
  const merged = mergeCutRanges(cuts)
  if (merged.length === 0) return clips.filter((c) => c.trackId !== 'video' && c.trackId !== 'audio')

  const result: Clip[] = []
  for (const clip of clips) {
    if (clip.trackId === 'video' || clip.trackId === 'audio') continue

    const oldStart = clip.startTime
    const oldEnd = clip.startTime + clip.duration
    const newStart = mapSourceTimeToEdited(oldStart, merged)
    const newEnd = mapSourceTimeToEdited(oldEnd, merged)
    if (newEnd - newStart < 0.01) continue

    result.push({
      ...clip,
      startTime: newStart,
      duration: newEnd - newStart,
    })
  }
  return result
}

/** Apply source-time cut ranges to the full timeline clip list. */
export function applySourceCutsToTimeline(clips: Clip[], cuts: TimeRange[]): Clip[] {
  const merged = mergeCutRanges(cuts)
  if (merged.length === 0) return clips

  const total = maxAvSourceEnd(clips)
  const keep = cutsToKeepSegments(total, merged)
  if (keep.length === 0) return clips

  const av = rebuildAvClipsFromKeepSegments(clips, keep)
  const companions = rippleCompanionClips(clips, merged)
  return [...av, ...companions]
}
