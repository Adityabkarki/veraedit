'use client'

import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { openStyleTransfer } from '@/lib/openStyleTransfer'

export function BrollGapBadge() {
  const clips = useTimelineStore((s) => s.clips)
  const missing = clips.filter(
    (c) => c.gapResolutionNeeded && c.gapMetadata?.matchStatus === 'missing',
  )

  if (!missing.length) return null

  return (
    <button
      type="button"
      data-testid="broll-gap-badge"
      className="flex items-center gap-1.5 bg-yellow-100 border border-yellow-300 text-yellow-800
                 text-xs px-3 py-1.5 rounded-full hover:bg-yellow-200 transition-colors"
      onClick={() => {
        openStyleTransfer()
        useUIStore.getState().setRightPanelMode('style')
      }}
    >
      <span className="w-2 h-2 rounded-full bg-yellow-500" aria-hidden="true" />
      {missing.length} B-roll clip{missing.length !== 1 ? 's' : ''} need footage
    </button>
  )
}
