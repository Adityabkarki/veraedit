'use client'

/**
 * SelectionToolbar — floating mini-toolbar above a text selection.
 *
 * Appears when the user has selected one or more words.
 * Shows: "Delete 4.2 s  [Delete] [Cancel]"
 *
 * Positioned via getBoundingClientRect of the selection range.
 * Uses `pendingDeleteIds` in transcriptStore for the confirmation step.
 */

import { useCallback } from 'react'
import {
  useTranscriptStore,
  getTotalSavedTime,
} from '@/stores/transcriptStore'

interface SelectionToolbarProps {
  /** Viewport position where the toolbar should appear */
  position: { x: number; y: number } | null
}

export function SelectionToolbar({ position }: SelectionToolbarProps) {
  const {
    selectedWordIds,
    words,
    deleteWords,
    clearSelection,
    setPendingDelete,
  } = useTranscriptStore()

  const onDelete = useCallback(() => {
    const ids = selectedWordIds.filter(
      (id) => words.find((w) => w.id === id && !w.deleted)
    )
    if (ids.length > 0) {
      setPendingDelete(ids)
    }
  }, [selectedWordIds, words, setPendingDelete])

  const onCancel = useCallback(() => {
    clearSelection()
    window.getSelection()?.removeAllRanges()
  }, [clearSelection])

  if (!position || selectedWordIds.length === 0) return null

  const saveable = selectedWordIds
    .map((id) => words.find((w) => w.id === id))
    .filter((w) => w && !w.deleted)

  const totalTime = getTotalSavedTime(saveable.map((w) => w!.id), words)

  return (
    <div
      data-testid="selection-toolbar"
      className="fixed z-50 flex items-center gap-2 px-3 py-2 rounded-lg
                 bg-bg-elevated border border-bg-overlay shadow-xl animate-fade-in
                 text-sm pointer-events-auto"
      style={{
        left: position.x,
        top:  position.y - 48,
        transform: 'translateX(-50%)',
      }}
    >
      <span className="text-text-secondary text-xs">
        Delete {saveable.length} word{saveable.length !== 1 ? 's' : ''}
        {totalTime > 0 && (
          <span className="text-text-disabled ml-1">({totalTime.toFixed(1)}s)</span>
        )}
      </span>
      <button
        data-testid="selection-delete"
        onClick={onDelete}
        className="px-2.5 py-1 rounded bg-status-error text-white text-xs font-medium
                   hover:bg-red-600 transition-colors"
      >
        Delete
      </button>
      <button
        data-testid="selection-cancel"
        onClick={onCancel}
        className="px-2.5 py-1 rounded text-text-secondary text-xs
                   hover:text-text-primary hover:bg-bg-overlay transition-colors"
      >
        Cancel
      </button>
    </div>
  )
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

export function DeleteConfirmModal() {
  const { pendingDeleteIds, words, deleteWords, setPendingDelete } = useTranscriptStore()

  if (!pendingDeleteIds) return null

  const pendingWords = pendingDeleteIds
    .map((id) => words.find((w) => w.id === id))
    .filter(Boolean) as typeof words

  const totalTime = getTotalSavedTime(pendingDeleteIds, words)

  return (
    <div
      data-testid="delete-confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => setPendingDelete(null)}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-sm bg-bg-surface border border-bg-overlay rounded-xl shadow-2xl p-5 animate-slide-up">
        <h3 className="text-base font-semibold text-text-primary mb-2">
          Delete {pendingWords.length} word{pendingWords.length !== 1 ? 's' : ''}?
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          This removes <strong className="text-text-primary">{totalTime.toFixed(1)} seconds</strong> from your video.
          The change will appear on the timeline.
          <span className="text-text-disabled text-xs block mt-1">
            Ctrl+Z to undo after confirming.
          </span>
        </p>
        <div className="flex gap-2 justify-end">
          <button
            data-testid="delete-cancel"
            onClick={() => setPendingDelete(null)}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="delete-confirm"
            onClick={() => deleteWords(pendingDeleteIds)}
            className="px-4 py-2 rounded-lg bg-status-error text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
