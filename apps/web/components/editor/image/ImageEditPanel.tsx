'use client'

/**
 * ImageEditPanel — image overlay media + full properties inspector.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import { isImageClip } from '@/lib/mediaClips'
import { RightPanelHeader } from '@/components/editor/RightPanelHeader'
import { useDismissClipEditorOnEscape } from '@/hooks/useDismissClipEditorOnEscape'
import { ImagePropertiesPanel } from '@/components/editor/properties/ImagePropertiesPanel'

interface ImageEditPanelProps {
  projectId: string
}

export function ImageEditPanel({ projectId }: ImageEditPanelProps) {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)

  const clip =
    selectedClipIds.length === 1
      ? clips.find((c) => c.id === selectedClipIds[0] && isImageClip(c))
      : undefined

  useDismissClipEditorOnEscape(true)

  if (!clip) {
    return (
      <div
        data-testid="image-edit-panel-empty"
        className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay"
      >
        <RightPanelHeader title="Image overlay" testId="image-edit-panel-close" />
        <ImagePropertiesPanel projectId={projectId} />
      </div>
    )
  }

  return (
    <div
      data-testid="image-edit-panel"
      className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"
    >
      <RightPanelHeader title="Image overlay" testId="image-edit-panel-close" />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ImagePropertiesPanel projectId={projectId} />
      </div>
    </div>
  )
}
