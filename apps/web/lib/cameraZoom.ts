/**
 * Camera & zoom clips — dedicated timeline lane below Video.
 */

import type { Clip, Track } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'

export const CAMERA_TRACK_ID = 'camera'

const ZOOM_TOOL_IDS = new Set([
  'framing_mcu',
  'framing_ecu',
  'zoom_step_108',
  'zoom_step_115',
  'zoom_continuous_push',
  'digital_zoom_punch',
  'ken_burns',
])

export function isCameraZoomClip(clip: Clip): boolean {
  if (clip.trackId === CAMERA_TRACK_ID) return true
  const preset = clip.effects?.effectPresetId ?? ''
  const tool = clip.effects?.styleToolId ?? ''
  const type = clip.effects?.effectType ?? ''
  return (
    ZOOM_TOOL_IDS.has(tool) ||
    preset === 'digital_zoom_punch' ||
    preset === 'ken_burns' ||
    type === 'digital_zoom' ||
    (type === 'transform' && (tool.includes('zoom') || tool.includes('framing') || preset.includes('zoom')))
  )
}

export function cameraZoomLabel(clip: Clip): string {
  const tool = clip.effects?.styleToolId ?? ''
  const preset = clip.effects?.effectPresetId ?? ''
  const map: Record<string, string> = {
    framing_mcu: 'MCU framing',
    framing_ecu: 'ECU framing',
    zoom_step_108: 'Zoom +8%',
    zoom_step_115: 'Zoom +15%',
    zoom_continuous_push: 'Slow push',
    digital_zoom_punch: 'Zoom punch',
    ken_burns: 'Ken Burns',
  }
  return map[tool] ?? map[preset] ?? clip.label ?? 'Camera zoom'
}

export function cameraZoomScaleEnd(clip: Clip): number {
  const kfs = clip.effects?.keyframes ?? []
  if (kfs.length === 0) return 1.1
  const sorted = [...kfs].sort((a, b) => a.offset - b.offset)
  return sorted[sorted.length - 1]?.value ?? 1.1
}

/** Punch zooms stay short; sustained moves span the rest of the parent video clip. */
export function cameraZoomDuration(
  toolId: string,
  specDuration: number,
  startTime: number,
  parentVideo?: Clip,
): number {
  if (!parentVideo) return specDuration
  const remainder = parentVideo.startTime + parentVideo.duration - startTime
  if (remainder <= 0.15) return specDuration

  if (
    toolId === 'digital_zoom_punch' ||
    toolId === 'zoom_step_108' ||
    toolId === 'zoom_step_115'
  ) {
    return Math.min(specDuration, remainder)
  }
  if (toolId === 'framing_mcu' || toolId === 'framing_ecu') {
    return Math.min(Math.max(specDuration, 1.5), remainder)
  }
  return Math.max(1, remainder)
}

export function zoomEasingForTool(toolId: string): 'linear' | 'ease-out' {
  if (
    toolId === 'digital_zoom_punch' ||
    toolId === 'zoom_step_108' ||
    toolId === 'zoom_step_115' ||
    toolId === 'framing_ecu'
  ) {
    return 'ease-out'
  }
  return 'linear'
}

export function openCameraZoomEditor(clipId: string): void {
  useTimelineStore.setState({ selectedClipIds: [clipId] })
  useUIStore.getState().setRightPanelMode('camera')
}

export function scrollTimelineToClip(clip: Clip): void {
  const { pixelsPerSecond, scrollX } = useTimelineStore.getState()
  const clipCenter = (clip.startTime + clip.duration / 2) * pixelsPerSecond
  const viewportGuess = 720
  const targetScroll = Math.max(0, clipCenter - viewportGuess / 2)
  if (Math.abs(targetScroll - scrollX) > 40) {
    useTimelineStore.getState().setScrollX(targetScroll)
  }
}

/** Move legacy zoom clips from Effects → Camera lane and ensure the track exists. */
export function migrateCameraZoomClips(
  tracks: Track[],
  clips: Clip[],
): { tracks: Track[]; clips: Clip[] } {
  const hasCamera = tracks.some((t) => t.id === CAMERA_TRACK_ID)
  const videoIdx = tracks.findIndex((t) => t.id === 'video')
  const insertAt = videoIdx >= 0 ? videoIdx + 1 : 0
  const nextTracks = hasCamera
    ? tracks
    : [
        ...tracks.slice(0, insertAt),
        {
          id: CAMERA_TRACK_ID,
          label: 'Camera',
          color: '#2563EB',
          muted: false,
          locked: false,
          visible: true,
        },
        ...tracks.slice(insertAt),
      ]

  const nextClips = clips.map((c) =>
    c.trackId === 'effects' && isCameraZoomClip(c) ? { ...c, trackId: CAMERA_TRACK_ID } : c,
  )
  return { tracks: nextTracks, clips: nextClips }
}

export function updateCameraZoomClip(
  clipId: string,
  patch: { duration?: number; scaleEnd?: number; label?: string },
): void {
  useTimelineStore.setState((s) => {
    const next = s.clips.map((c) => {
      if (c.id !== clipId || !isCameraZoomClip(c)) return c
      const duration = patch.duration ?? c.duration
      const scaleEnd = patch.scaleEnd ?? cameraZoomScaleEnd(c)
      return {
        ...c,
        duration,
        label: patch.label ?? cameraZoomLabel(c),
        effects: {
          ...c.effects,
          keyframes: [
            { offset: 0, value: 1 },
            { offset: 1, value: Math.max(1, Math.min(2, scaleEnd)) },
          ],
        },
      }
    })
    return {
      clips: next,
      undoStack: [...s.undoStack.slice(-49), { clips: s.clips, tracks: s.tracks }],
      redoStack: [],
      lastEditAction: 'Updated camera zoom',
    }
  })
}
