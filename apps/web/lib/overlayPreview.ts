/**
 * Which timeline clips render as draggable overlays in the video preview.
 */

import type { Clip } from '@/stores/timelineStore'
import { isBrollClip, isImageClip } from '@/lib/mediaClips'
import { isChartOrProcessClip } from '@/lib/chartVisualTypes'
import { isFamilyTrack } from '@/lib/timelineLayers'

export function isOverlayPreviewTrack(trackId: string): boolean {
  return (
    isFamilyTrack(trackId, 'overlay') ||
    isFamilyTrack(trackId, 'images') ||
    trackId === 'caption-fx'
  )
}

/** Clips visible in the preview compositor at `time`. */
export function activePreviewOverlays(clips: Clip[], time: number): Clip[] {
  return clips.filter((c) => {
    if (time < c.startTime || time >= c.startTime + c.duration) return false
    if (isBrollClip(c)) return true
    if (isImageClip(c)) return true
    if (isChartOrProcessClip(c)) return true
    return isOverlayPreviewTrack(c.trackId) && Boolean(c.effects?.visualType)
  })
}

/** Higher lanes draw above lower lanes in the preview stack. */
export function overlayPreviewZIndex(clip: Clip): number {
  if (isFamilyTrack(clip.trackId, 'overlay')) {
    const match = clip.trackId.match(/^overlay(?:-(\d+))?$/)
    const lane = match?.[1] ? Number.parseInt(match[1], 10) : 1
    return 20 + lane
  }
  if (isFamilyTrack(clip.trackId, 'images')) {
    const match = clip.trackId.match(/^images(?:-(\d+))?$/)
    const lane = match?.[1] ? Number.parseInt(match[1], 10) : 1
    return 40 + lane
  }
  if (isBrollClip(clip)) return 15
  if (isChartOrProcessClip(clip) && clip.effects?.overlayMode === 'fullscreen') return 28
  if (isChartOrProcessClip(clip)) return 22
  return 10
}
