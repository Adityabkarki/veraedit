'use client'

/**
 * Shared header for right-column clip editors — title + ✕ to dismiss.
 */

import { dismissClipEditorPanel } from '@/lib/clipEditorDismiss'

interface RightPanelHeaderProps {
  title: string
  testId?: string
  onClose?: () => void
}

export function RightPanelHeader({
  title,
  testId = 'right-panel-close',
  onClose,
}: RightPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-bg-overlay flex-shrink-0">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <button
        type="button"
        data-testid={testId}
        onClick={onClose ?? dismissClipEditorPanel}
        aria-label="Close panel"
        title="Close (Esc)"
        className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay text-sm leading-none"
      >
        ✕
      </button>
    </div>
  )
}
