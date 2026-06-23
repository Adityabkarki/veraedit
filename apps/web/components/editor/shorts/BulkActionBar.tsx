'use client'

/**
 * BulkActionBar — floating action bar when multiple shorts are selected.
 *
 * Appears at the bottom of the screen above the timeline.
 * Shows: "N selected  [Approve all] [Export all] [Clear]"
 */

import { useShortsStore } from '@/stores/shortsStore'

export function BulkActionBar() {
  const {
    selectedShortIds,
    approveSelected,
    exportSelected,
    clearShortSelection,
    selectAllShorts,
    shorts,
  } = useShortsStore()

  const count   = selectedShortIds.length
  const total   = shorts.length
  const allSelected = count === total

  if (count === 0) return null

  return (
    <div
      data-testid="bulk-action-bar"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40
                 flex items-center gap-3 px-5 py-3 rounded-xl
                 bg-bg-elevated border border-bg-overlay shadow-2xl
                 animate-slide-up"
    >
      {/* Count */}
      <span className="text-sm font-semibold text-text-primary">
        {count} selected
      </span>

      {/* Select all toggle */}
      <button
        data-testid="bulk-select-all"
        onClick={allSelected ? clearShortSelection : selectAllShorts}
        className="text-xs text-accent hover:text-accent-glow transition-colors"
      >
        {allSelected ? 'Deselect all' : 'Select all'}
      </button>

      <div className="h-4 w-px bg-bg-overlay" />

      {/* Approve all */}
      <button
        data-testid="bulk-approve"
        onClick={approveSelected}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                   bg-status-success/10 text-status-success text-xs font-medium
                   hover:bg-status-success/20 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Approve all
      </button>

      {/* Export all */}
      <button
        data-testid="bulk-export"
        onClick={exportSelected}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                   bg-accent text-white text-xs font-medium
                   hover:bg-accent-glow transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1V8M6 8L3.5 5.5M6 8L8.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Export all
      </button>

      {/* Clear */}
      <button
        data-testid="bulk-clear"
        onClick={clearShortSelection}
        aria-label="Clear selection"
        className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
      >
        ✕
      </button>
    </div>
  )
}
