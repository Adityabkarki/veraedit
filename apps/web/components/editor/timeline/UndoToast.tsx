'use client'

/**
 * UndoToast — "Ctrl+Z to undo" reminder shown after every edit.
 *
 * Appears at the bottom centre of the screen for 3 seconds,
 * then auto-dismisses. Shows the edit action name.
 */

import { useEffect } from 'react'
import { useTimelineStore } from '@/stores/timelineStore'

export function UndoToast() {
  const { lastEditAction, clearLastEditAction } = useTimelineStore()

  useEffect(() => {
    if (!lastEditAction) return
    const timer = setTimeout(() => clearLastEditAction(), 3000)
    return () => clearTimeout(timer)
  }, [lastEditAction, clearLastEditAction])

  if (!lastEditAction) return null

  return (
    <div
      data-testid="undo-toast"
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50
                 flex items-center gap-2 px-4 py-2.5 rounded-lg
                 bg-bg-elevated border border-bg-overlay shadow-xl
                 text-sm text-text-secondary animate-slide-up
                 pointer-events-none"
    >
      <span className="text-text-primary font-medium">{lastEditAction}</span>
      <span className="text-text-disabled">—</span>
      <kbd className="px-1.5 py-0.5 rounded bg-bg-overlay border border-bg-overlay
                      text-xs font-mono text-text-primary">
        Ctrl
      </kbd>
      <span className="text-text-disabled text-xs">+</span>
      <kbd className="px-1.5 py-0.5 rounded bg-bg-overlay border border-bg-overlay
                      text-xs font-mono text-text-primary">
        Z
      </kbd>
      <span className="text-text-disabled ml-0.5">to undo</span>
    </div>
  )
}
