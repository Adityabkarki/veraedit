'use client'

/**
 * BatchAcceptModal — confirmation dialog for applying all high-confidence
 * suggestions (≥ 80%) in one click.
 */

import { useEffect, useState } from 'react'
import { useSuggestionsStore, HIGH_CONFIDENCE_THRESHOLD } from '@/stores/suggestionsStore'
import { batchAcceptSuggestionsApi } from '@/lib/suggestionActions'
import { ConfidenceBar } from '@/components/editor/ai/ConfidenceBar'

interface BatchAcceptModalProps {
  projectId?: string
  assetId?: string | null
}

export function BatchAcceptModal({ projectId, assetId }: BatchAcceptModalProps) {
  const {
    batchModalOpen,
    closeBatchModal,
    batchAcceptHigh,
    highConfidencePending,
  } = useSuggestionsStore()

  const [busy, setBusy] = useState(false)
  const pending = highConfidencePending()

  useEffect(() => {
    if (!batchModalOpen) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeBatchModal()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [batchModalOpen, closeBatchModal])

  const handleConfirm = async () => {
    if (projectId && assetId) {
      setBusy(true)
      for (const s of pending) {
        useSuggestionsStore.getState().acceptSuggestion(s.id)
      }
      await batchAcceptSuggestionsApi(
        projectId,
        assetId,
        pending.map((s) => ({ id: s.id, action: s.action, type: s.apiType })),
      )
      setBusy(false)
    } else {
      batchAcceptHigh()
    }
    closeBatchModal()
  }

  if (!batchModalOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
      data-testid="batch-accept-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={closeBatchModal}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm bg-bg-surface border border-bg-overlay rounded-xl shadow-2xl animate-slide-up">
        <div className="px-5 py-4 border-b border-bg-overlay">
          <h2
            id="batch-modal-title"
            className="text-base font-semibold text-text-primary font-display"
          >
            Apply {pending.length} suggestion{pending.length !== 1 ? 's' : ''}?
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Only suggestions with {HIGH_CONFIDENCE_THRESHOLD}%+ confidence will be applied.
          </p>
        </div>

        <div className="px-5 py-3 space-y-2.5 max-h-60 overflow-y-auto">
          {pending.map((s) => (
            <div
              key={s.id}
              data-testid={`batch-item-${s.id}`}
              className="flex items-center gap-2"
            >
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                className="text-status-success flex-shrink-0"
                aria-hidden="true"
              >
                <path d="M2 7L6 11L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{s.title}</p>
                <ConfidenceBar confidence={s.confidence} className="mt-1" />
              </div>
            </div>
          ))}

          {pending.length === 0 && (
            <p className="text-xs text-text-secondary py-2">
              No high-confidence suggestions are pending.
            </p>
          )}
        </div>

        <div className="px-5 py-2 bg-bg-overlay/50 border-t border-bg-overlay">
          <p className="text-[11px] text-text-disabled flex items-center gap-1.5">
            <span aria-hidden="true">ℹ</span>
            All changes can be undone with
            <kbd className="px-1 py-0.5 rounded bg-bg-overlay text-[10px] font-mono text-text-secondary border border-bg-elevated">
              Ctrl+Z
            </kbd>
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            data-testid="batch-cancel"
            onClick={closeBatchModal}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            Cancel
          </button>
          <button
            data-testid="batch-confirm"
            onClick={() => void handleConfirm()}
            disabled={pending.length === 0 || busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-glow text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Apply {pending.length} suggestion{pending.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
