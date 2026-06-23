'use client'



/**

 * BrollClipPanel — compact strip below timeline when a B-Roll clip is selected.

 */



import { useTimelineStore } from '@/stores/timelineStore'

import { isBrollClip } from '@/lib/mediaClips'

import { OverlayMediaEditor } from '@/components/editor/media/OverlayMediaEditor'

import { TimelineClipPanelHeader } from '@/components/editor/timeline/TimelineClipPanelHeader'



export function BrollClipPanel() {

  const clips = useTimelineStore((s) => s.clips)

  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)



  const clip =

    selectedClipIds.length === 1

      ? clips.find((c) => c.id === selectedClipIds[0] && isBrollClip(c))

      : undefined



  if (!clip) return null



  return (

    <div

      data-testid="broll-clip-panel"

      className="border-t border-gray-500/40 bg-bg-elevated flex-shrink-0 flex flex-col"

    >

      <TimelineClipPanelHeader title="B-Roll media" testId="broll-clip-panel-close" />

      <OverlayMediaEditor clip={clip} purpose="broll" variant="compact" />

    </div>

  )

}

