/**
 * Long-form–aware clip list helpers (Phase 15).
 * All external timeline clip mutations must go through these utilities.
 */
import type { Clip, Track } from '@/stores/timelineStore'
import {
  computeVisibleTimeWindow,
  filterClipsToWindow,
} from '@/lib/editor/timelineWindowing'

export interface TimelineClipSlice {
  longFormMode: boolean
  allClips: Clip[]
  clips: Clip[]
  scrollX: number
  viewportWidthPx: number
  pixelsPerSecond: number
}

/** Full clip list — not the viewport window. */
export function fullTimelineClips(slice: TimelineClipSlice): Clip[] {
  return slice.longFormMode && slice.allClips.length > 0 ? slice.allClips : slice.clips
}

export function buildClipWindowState(
  slice: TimelineClipSlice,
  nextAllClips: Clip[],
): { clips: Clip[]; allClips: Clip[] } {
  if (!slice.longFormMode) {
    return { clips: nextAllClips, allClips: [] }
  }
  const window = computeVisibleTimeWindow(
    slice.scrollX,
    slice.viewportWidthPx,
    slice.pixelsPerSecond,
  )
  return {
    allClips: nextAllClips,
    clips: filterClipsToWindow(nextAllClips, window),
  }
}

export interface ClipMutationResult {
  clips: Clip[]
  allClips: Clip[]
  tracks?: Track[]
}

export function applyFullClipList(
  slice: TimelineClipSlice,
  nextAllClips: Clip[],
  tracks?: Track[],
): ClipMutationResult {
  const windowed = buildClipWindowState(slice, nextAllClips)
  return {
    ...windowed,
    ...(tracks !== undefined ? { tracks } : {}),
  }
}

export function mutateFullClipList(
  slice: TimelineClipSlice,
  mutator: (clips: Clip[]) => Clip[],
  tracks?: Track[],
): ClipMutationResult {
  const source = fullTimelineClips(slice)
  return applyFullClipList(slice, mutator(source), tracks)
}
