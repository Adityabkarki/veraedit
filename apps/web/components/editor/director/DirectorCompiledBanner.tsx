'use client'

/**
 * Banner shown after Director compile — opens trigger log panel.
 */

import { useDirectorStore } from '@/stores/directorStore'
import { useUIStore } from '@/stores/uiStore'

export function DirectorCompiledBanner() {
  const { useDirectorEngine, timeline, lastCompileLabel, version } = useDirectorStore()
  const { setRightPanelMode, aiPanelOpen, toggleAIPanel } = useUIStore()

  if (!useDirectorEngine || !timeline) return null

  const realized = timeline.triggers.filter((t) => t.status === 'realized').length

  return (
    <div
      data-testid="director-compiled-banner"
      className="mx-4 mt-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 flex flex-wrap items-center justify-between gap-2"
      role="status"
    >
      <p className="text-xs text-text-primary">
        <span className="font-semibold">Director preview ready</span>
        {' — '}
        {realized} elements on timeline
        {lastCompileLabel ? ` (${lastCompileLabel}, v${version})` : ''}
      </p>
      <button
        type="button"
        data-testid="director-open-log"
        onClick={() => {
          if (!aiPanelOpen) toggleAIPanel()
          setRightPanelMode('director')
        }}
        className="text-xs font-semibold text-accent hover:underline"
      >
        Review triggers
      </button>
    </div>
  )
}
