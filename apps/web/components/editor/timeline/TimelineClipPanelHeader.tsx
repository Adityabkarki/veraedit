'use client'

/**
 * Shared header for timeline strip editors — title + ✕ to dismiss.
 */

import { dismissTimelineClipPanel } from '@/lib/clipEditorDismiss'

interface TimelineClipPanelHeaderProps {
  title: string
  subtitle?: string
  testId?: string
  onClose?: () => void
}

export function TimelineClipPanelHeader({
  title,
  subtitle,
  testId = 'timeline-clip-panel-close',
  onClose,
}: TimelineClipPanelHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-bg-overlay/60 flex-shrink-0 sticky top-0 bg-bg-elevated z-10">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-text-primary">{title}</p>
        {subtitle ? (
          <p className="text-[10px] text-text-disabled mt-0.5 leading-snug">{subtitle}</p>
        ) : null}
      </div>
      <button
        type="button"
        data-testid={testId}
        onClick={onClose ?? dismissTimelineClipPanel}
        aria-label="Close editor panel"
        title="Close (Esc)"
        className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay text-sm leading-none flex-shrink-0"
      >
        ✕
      </button>
    </div>
  )
}
