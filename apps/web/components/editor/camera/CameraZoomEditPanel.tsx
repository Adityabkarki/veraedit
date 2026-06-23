'use client'



/**

 * CameraZoomEditPanel — right-panel editor for camera / zoom clips.

 */



import { useTimelineStore } from '@/stores/timelineStore'

import {

  cameraZoomLabel,

  cameraZoomScaleEnd,

  isCameraZoomClip,

  updateCameraZoomClip,

} from '@/lib/cameraZoom'

import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'

import { RightPanelHeader } from '@/components/editor/RightPanelHeader'

import { useDismissClipEditorOnEscape } from '@/hooks/useDismissClipEditorOnEscape'



export function CameraZoomEditPanel() {

  const clips = useTimelineStore((s) => s.clips)

  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)



  const clip =

    selectedClipIds.length === 1

      ? clips.find((c) => c.id === selectedClipIds[0] && isCameraZoomClip(c))

      : undefined



  useDismissClipEditorOnEscape(true)



  if (!clip) {

    return (

      <div

        data-testid="camera-zoom-edit-panel-empty"

        className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay"

      >

        <RightPanelHeader title="Camera & zoom" testId="camera-zoom-edit-panel-close" />

        <p className="p-4 text-xs text-text-disabled">

          Add a <strong className="text-text-secondary">Camera &amp; zoom</strong> element from Edit

          Elements, or select a clip on the <strong className="text-text-secondary">Camera</strong>{' '}

          track below Video.

        </p>

      </div>

    )

  }



  const scalePct = Math.round((cameraZoomScaleEnd(clip) - 1) * 100)



  return (

    <div

      data-testid="camera-zoom-edit-panel"

      className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"

    >

      <RightPanelHeader title="Camera & zoom" testId="camera-zoom-edit-panel-close" />



      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">

        <div>

          <p className="text-xs font-semibold text-text-primary">{cameraZoomLabel(clip)}</p>

          <p className="text-[10px] text-text-disabled mt-0.5">

            {formatEffectTime(clip.startTime)} → {formatEffectTime(clip.startTime + clip.duration)}

            {' · '}scrub the playhead through this range to preview

          </p>

        </div>



        <label className="block">

          <span className="text-[10px] text-text-disabled">Duration (seconds)</span>

          <input

            data-testid="camera-zoom-duration"

            type="number"

            min={0.3}

            max={120}

            step={0.1}

            value={Number(clip.duration.toFixed(1))}

            onChange={(e) =>

              updateCameraZoomClip(clip.id, { duration: Math.max(0.3, Number(e.target.value)) })

            }

            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"

          />

        </label>



        <label className="block">

          <span className="text-[10px] text-text-disabled">Zoom amount (+{scalePct}%)</span>

          <input

            data-testid="camera-zoom-scale"

            type="range"

            min={3}

            max={50}

            value={scalePct}

            onChange={(e) =>

              updateCameraZoomClip(clip.id, {

                scaleEnd: 1 + Number(e.target.value) / 100,

              })

            }

            className="w-full accent-blue-500 mt-1"

          />

        </label>



        <p className="text-[10px] text-text-disabled leading-relaxed border-t border-bg-overlay pt-3">

          This is a digital punch-in on your video layer — similar to CapCut or Premiere, not a full

          3D camera rig. For export, zoom is baked into the render scale keyframes.

        </p>

      </div>

    </div>

  )

}

