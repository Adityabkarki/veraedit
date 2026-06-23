'use client'

/**
 * ImageClipPanel — compact strip below timeline when an image overlay is selected.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import { isImageClip } from '@/lib/mediaClips'
import { OverlayMediaEditor } from '@/components/editor/media/OverlayMediaEditor'
import { TimelineClipPanelHeader } from '@/components/editor/timeline/TimelineClipPanelHeader'

export function ImageClipPanel() {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)

  const clip =
    selectedClipIds.length === 1
      ? clips.find((c) => c.id === selectedClipIds[0] && isImageClip(c))
      : undefined

  if (!clip) return null

  return (
    <div
      data-testid="image-clip-panel"
      className="border-t border-cyan-500/30 bg-bg-elevated flex-shrink-0 flex flex-col"
    >
      <TimelineClipPanelHeader
        title="Upload image overlay"
        testId="image-clip-panel-close"
      />
      <OverlayMediaEditor clip={clip} purpose="image" variant="compact" />
    </div>
  )
}
