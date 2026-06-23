'use client'

/**
 * CameraZoomClipPanel — compact controls below the timeline when a camera clip is selected.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import {
  cameraZoomLabel,
  cameraZoomScaleEnd,
  isCameraZoomClip,
  openCameraZoomEditor,
  updateCameraZoomClip,
} from '@/lib/cameraZoom'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'
import { TimelineClipPanelHeader } from '@/components/editor/timeline/TimelineClipPanelHeader'

export function CameraZoomClipPanel() {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)

  const clip =
    selectedClipIds.length === 1
      ? clips.find((c) => c.id === selectedClipIds[0] && isCameraZoomClip(c))
      : undefined

  if (!clip) return null

  const scalePct = Math.round((cameraZoomScaleEnd(clip) - 1) * 100)

  return (
    <div
      data-testid="camera-zoom-clip-panel"
      className="border-t border-blue-500/30 bg-bg-elevated flex-shrink-0 flex flex-col"
    >
      <TimelineClipPanelHeader
        title={`Camera — ${cameraZoomLabel(clip)}`}
        subtitle={`${formatEffectTime(clip.startTime)} → ${formatEffectTime(clip.startTime + clip.duration)}`}
        testId="camera-zoom-clip-panel-close"
      />

      <div className="p-3 flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-[10px] text-text-disabled">Duration</span>
        <input
          type="number"
          min={0.3}
          max={120}
          step={0.1}
          value={Number(clip.duration.toFixed(1))}
          onChange={(e) =>
            updateCameraZoomClip(clip.id, { duration: Math.max(0.3, Number(e.target.value)) })
          }
          className="mt-0.5 w-20 px-2 py-1 rounded bg-bg-overlay border border-bg-overlay text-xs"
        />
      </label>

      <label className="block flex-1 min-w-[160px] max-w-xs">
        <span className="text-[10px] text-text-disabled">Zoom +{scalePct}%</span>
        <input
          type="range"
          min={3}
          max={50}
          value={scalePct}
          onChange={(e) =>
            updateCameraZoomClip(clip.id, { scaleEnd: 1 + Number(e.target.value) / 100 })
          }
          className="w-full accent-blue-500 mt-1"
        />
      </label>

      <button
        type="button"
        onClick={() => openCameraZoomEditor(clip.id)}
        className="text-[10px] text-blue-300 hover:text-blue-200 underline"
      >
        More options
      </button>
      </div>
    </div>
  )
}
