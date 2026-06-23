'use client'

/**
 * ImageEditPanel — upload / link image overlays (not B-Roll).
 */

import { useTimelineStore } from '@/stores/timelineStore'
import { isImageClip } from '@/lib/mediaClips'
import { OverlayMediaEditor } from '@/components/editor/media/OverlayMediaEditor'
import { RightPanelHeader } from '@/components/editor/RightPanelHeader'
import { useDismissClipEditorOnEscape } from '@/hooks/useDismissClipEditorOnEscape'

export function ImageEditPanel() {
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
        <p className="p-4 text-xs text-text-disabled">
          Select an <strong className="text-text-secondary">Image overlay</strong> clip on the timeline
          to upload or link media.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="image-edit-panel"
      className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"
    >
      <RightPanelHeader title="Image overlay" testId="image-edit-panel-close" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <OverlayMediaEditor clip={clip} purpose="image" variant="panel" />
      </div>
    </div>
  )
}
