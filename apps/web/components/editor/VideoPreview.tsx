'use client'

/**
 * VideoPreview — centre panel: video player only (AI edits live in the right panel).
 */

import { PanelTooltip } from '@/components/editor/PanelTooltip'
import { VideoPlayer } from '@/components/editor/player/VideoPlayer'
import { useAssetStore } from '@/stores/assetStore'

interface VideoPreviewProps {
  src?: string
}

export function VideoPreview({ src }: VideoPreviewProps) {
  const assetVideoUrl = useAssetStore((s) => s.asset?.videoUrl ?? undefined)
  const videoSrc = src ?? assetVideoUrl
  const durationMin = useAssetStore((s) =>
    s.asset?.durationSeconds ? s.asset.durationSeconds / 60 : 0,
  )

  return (
    <div
      data-testid="video-preview"
      className="flex flex-col h-full overflow-hidden relative"
    >
      <PanelTooltip
        panelKey="preview"
        title="Video Preview"
        description="Space to play/pause. J/L step 5s. Arrow keys frame-step. Timeline and player stay in sync."
        placement="bottom"
      />

      {durationMin > 20 && (
        <p className="flex-shrink-0 px-3 py-1.5 text-[10px] text-status-warning bg-status-warning/10 border-b border-status-warning/20 text-center">
          Long video ({Math.round(durationMin)} min) — preview streams from storage and may buffer. Use J/L to scrub.
        </p>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        <VideoPlayer src={videoSrc} />
      </div>
    </div>
  )
}
