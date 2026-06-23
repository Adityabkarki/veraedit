'use client'



/**

 * BrollEditPanel — fullscreen B-Roll media upload (not image overlays).

 */



import { useTimelineStore } from '@/stores/timelineStore'

import { isBrollClip } from '@/lib/mediaClips'

import { OverlayMediaEditor } from '@/components/editor/media/OverlayMediaEditor'

import { RightPanelHeader } from '@/components/editor/RightPanelHeader'

import { useDismissClipEditorOnEscape } from '@/hooks/useDismissClipEditorOnEscape'



export function BrollEditPanel() {

  const clips = useTimelineStore((s) => s.clips)

  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)



  const clip =

    selectedClipIds.length === 1

      ? clips.find((c) => c.id === selectedClipIds[0] && isBrollClip(c))

      : undefined



  useDismissClipEditorOnEscape(true)



  if (!clip) {

    return (

      <div

        data-testid="broll-edit-panel-empty"

        className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay"

      >

        <RightPanelHeader title="B-Roll" testId="broll-edit-panel-close" />

        <p className="p-4 text-xs text-text-disabled">

          Select a clip on the <strong className="text-text-secondary">B-Roll</strong> track to

          upload fullscreen cutaway media.

        </p>

      </div>

    )

  }



  return (

    <div

      data-testid="broll-edit-panel"

      className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"

    >

      <RightPanelHeader title="B-Roll" testId="broll-edit-panel-close" />

      <div className="flex-1 min-h-0 overflow-y-auto">

        <OverlayMediaEditor clip={clip} purpose="broll" variant="panel" />

      </div>

    </div>

  )

}

