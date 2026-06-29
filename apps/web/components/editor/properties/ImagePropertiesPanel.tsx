'use client'

import { useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { TransformSection } from '@/components/editor/properties/sections/TransformSection'
import { TimingSection } from '@/components/editor/properties/sections/TimingSection'
import { AppearanceSection } from '@/components/editor/properties/sections/AppearanceSection'
import { BlendModeSection } from '@/components/editor/properties/sections/BlendModeSection'
import { FiltersSection } from '@/components/editor/properties/sections/FiltersSection'
import { BorderShadowSection } from '@/components/editor/properties/sections/BorderShadowSection'
import { AnimationSection } from '@/components/editor/properties/sections/AnimationSection'
import { CropMaskSection } from '@/components/editor/properties/sections/CropMaskSection'
import { AIToolsSection } from '@/components/editor/properties/sections/AIToolsSection'
import { LayerActionsSection } from '@/components/editor/properties/sections/LayerActionsSection'
import { JobProgressToast } from '@/components/editor/properties/JobProgressToast'
import { OverlayMediaEditor } from '@/components/editor/media/OverlayMediaEditor'
import { useSelectedImageLayer } from '@/stores/imageLayerStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { isImageClip } from '@/lib/mediaClips'

interface ImagePropertiesPanelProps {
  projectId: string
}

export function ImagePropertiesPanel({ projectId }: ImagePropertiesPanelProps) {
  const layer = useSelectedImageLayer()
  const clip = useTimelineStore((s) => {
    if (!layer) return null
    const c = s.clips.find((x) => x.id === layer.id)
    return c && isImageClip(c) ? c : null
  })
  const [activeJob, setActiveJob] = useState<{ jobId: string; label: string } | null>(null)

  if (!layer || !clip) {
    return (
      <div
        data-testid="image-properties-empty"
        className="flex flex-col items-center justify-center h-48 text-text-disabled gap-2"
      >
        <ImageIcon size={24} className="opacity-30" />
        <p className="text-xs">Select an image to edit</p>
      </div>
    )
  }

  return (
    <div data-testid="image-properties-panel" className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-bg-overlay bg-bg-elevated/40 flex-shrink-0">
        <ImageIcon size={14} className="text-text-secondary" />
        <span className="text-xs font-medium text-text-primary truncate flex-1">{layer.name}</span>
        <span className="text-[10px] text-text-disabled bg-bg-overlay px-1.5 py-0.5 rounded">
          Image
        </span>
      </div>

      {layer.src && (
        <div className="mx-4 mt-3 mb-1">
          <div
            className="relative rounded-lg overflow-hidden border border-bg-overlay"
            style={{
              aspectRatio: '16/9',
              background: layer.src && clip.effects?.backgroundRemoved
                ? 'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 50% / 16px 16px'
                : undefined,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={layer.src}
              alt={layer.name}
              className="w-full h-full object-contain"
              style={{ opacity: layer.appearance.opacity / 100 }}
            />
            {!layer.visible && (
              <div className="absolute inset-0 bg-bg-base/60 flex items-center justify-center">
                <span className="text-xs text-text-disabled">Hidden</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-3 py-2 border-b border-bg-overlay">
        <OverlayMediaEditor clip={clip} purpose="image" variant="compact" />
      </div>

      <div className="flex-1">
        <TransformSection layerId={layer.id} />
        <TimingSection layerId={layer.id} />
        <AppearanceSection layerId={layer.id} />
        <BlendModeSection layerId={layer.id} />
        <FiltersSection layerId={layer.id} />
        <BorderShadowSection layerId={layer.id} />
        <AnimationSection layerId={layer.id} />
        <CropMaskSection layerId={layer.id} />
        <AIToolsSection
          clipId={layer.id}
          imageSrc={layer.src}
          storageKey={layer.storageKey}
          projectId={projectId}
          onJobStarted={(jobId, label) => setActiveJob({ jobId, label })}
        />
      </div>

      <LayerActionsSection layerId={layer.id} />

      {activeJob && (
        <JobProgressToast
          jobId={activeJob.jobId}
          label={activeJob.label}
          onDone={() => setActiveJob(null)}
        />
      )}
    </div>
  )
}
