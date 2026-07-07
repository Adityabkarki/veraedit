'use client'

/**
 * VideoPreview — centre panel: video player + style reference + gap resolution.
 */

import { useEffect } from 'react'
import { useEditorStore, type AspectRatio } from '@/stores/editorStore'
import { PanelTooltip } from '@/components/editor/PanelTooltip'
import { VideoPlayer } from '@/components/editor/player/VideoPlayer'
import { useAssetStore } from '@/stores/assetStore'
import { refreshPipelineAssetStatus } from '@/lib/editorData'

const ASPECT_OPTIONS: { label: string; value: AspectRatio }[] = [
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1',  value: '1:1'  },
  { label: '4:3',  value: '4:3'  },
  { label: '21:9', value: '21:9' },
]

interface VideoPreviewProps {
  src?: string
  projectId?: string
}

export function VideoPreview({ src, projectId }: VideoPreviewProps) {
  const asset = useAssetStore((s) => s.asset)
  const assetVideoUrl = asset?.videoUrl ?? undefined
  const videoSrc = src ?? assetVideoUrl
  const durationMin = useAssetStore((s) =>
    s.asset?.durationSeconds ? s.asset.durationSeconds / 60 : 0,
  )
  const aspectRatio = useEditorStore((s) => s.aspectRatio)
  const setAspectRatio = useEditorStore((s) => s.setAspectRatio)

  // Recover playback URL if the asset loaded before confirm finished.
  useEffect(() => {
    if (!projectId || !asset?.id || asset.videoUrl || asset.status === 'uploading') return
    void refreshPipelineAssetStatus(projectId)
  }, [projectId, asset?.id, asset?.videoUrl, asset?.status])

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

      <div className="flex-shrink-0 flex items-center justify-center gap-1 px-3 py-1.5 border-b border-bg-overlay">
        {ASPECT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setAspectRatio(opt.value)}
            className={`px-2 py-0.5 text-[11px] leading-none rounded font-medium transition-colors ${
              aspectRatio === opt.value
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <VideoPlayer src={videoSrc} aspectRatio={aspectRatio} projectId={projectId} />
      </div>
    </div>
  )
}
