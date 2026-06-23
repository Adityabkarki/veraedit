'use client'

/**
 * Typed confirmation before paid pipeline regeneration.
 */

import { useEffect, useState } from 'react'

interface RegenerateConfirmDialogProps {
  open: boolean
  title: string
  description: string
  costLabel: string
  confirmPhrase: string
  confirmButtonLabel?: string
  loading?: boolean
  onClose: () => void
  onConfirm: (typed: string) => void
}

export function RegenerateConfirmDialog({
  open,
  title,
  description,
  costLabel,
  confirmPhrase,
  confirmButtonLabel = 'Run',
  loading = false,
  onClose,
  onConfirm,
}: RegenerateConfirmDialogProps) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  if (!open) return null

  const normalized = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  const canSubmit = normalized(typed) === normalized(confirmPhrase)

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regenerate-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-bg-overlay bg-bg-surface p-5 shadow-xl">
        <h2 id="regenerate-dialog-title" className="text-sm font-semibold text-text-primary mb-2">
          {title}
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed mb-3">{description}</p>
        <p className="text-xs font-medium text-accent mb-3">{costLabel}</p>
        <label className="block text-[10px] text-text-disabled mb-1">
          Type <span className="font-mono text-text-secondary">{confirmPhrase}</span> to continue
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full rounded-lg border border-bg-overlay bg-bg-base px-3 py-2 text-xs text-text-primary mb-4"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-bg-overlay"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit || loading}
            onClick={() => onConfirm(typed)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white disabled:opacity-40"
          >
            {loading ? 'Starting…' : confirmButtonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
