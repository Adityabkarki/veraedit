/**
 * Viewport windowing for the NLE timeline (Phase 15).
 */
import type { Clip } from '@/stores/timelineStore'
import { WINDOW_PREFETCH_SECONDS } from '@/lib/editor/longFormThresholds'
import { TIMELINE_HEADER_WIDTH_PX } from '@/lib/timelineLayout'

export interface TimeWindow {
  startSec: number
  endSec: number
}

export function computeVisibleTimeWindow(
  scrollX: number,
  viewportWidthPx: number,
  pixelsPerSecond: number,
  prefetchSeconds = WINDOW_PREFETCH_SECONDS,
): TimeWindow {
  const pps = Math.max(pixelsPerSecond, 0.001)
  const clipAreaWidth = Math.max(0, viewportWidthPx - TIMELINE_HEADER_WIDTH_PX)
  const startSec = Math.max(0, scrollX / pps - prefetchSeconds)
  const endSec = (scrollX + clipAreaWidth) / pps + prefetchSeconds
  return { startSec, endSec }
}

export function clipIntersectsWindow(
  clip: Clip,
  window: TimeWindow,
): boolean {
  const clipStart = clip.startTime
  const clipEnd = clip.startTime + clip.duration
  return clipEnd >= window.startSec && clipStart <= window.endSec
}

export function filterClipsToWindow(clips: Clip[], window: TimeWindow): Clip[] {
  return clips.filter((c) => clipIntersectsWindow(c, window))
}

export function framesFromTimeWindow(window: TimeWindow, fps: number): {
  startFrame: number
  endFrame: number
} {
  return {
    startFrame: Math.max(0, Math.floor(window.startSec * fps)),
    endFrame: Math.max(0, Math.ceil(window.endSec * fps)),
  }
}
