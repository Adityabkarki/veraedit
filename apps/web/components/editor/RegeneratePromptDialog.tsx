'use client'

/**
 * RegeneratePromptDialog — reject feedback + scoped regeneration.
 */

import { useState } from 'react'

interface RegeneratePromptDialogProps {
  open: boolean
  title: string
  description: string
  confirmPhrase: string
  confirmButtonLabel: string
  loading?: boolean
  onClose: () => void
  onConfirm: (confirmation: string, userPrompt: string) => void | Promise<void>
}

export function RegeneratePromptDialog({
  open,
  title,
  description,
  confirmPhrase,
  confirmButtonLabel,
  loading = false,
  onClose,
  onConfirm,
}: RegeneratePromptDialogProps) {
  const [typed, setTyped] = useState('')
  const [prompt, setPrompt] = useState('')

  if (!open) return null

  const canSubmit =
    typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase() && !loading

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="regenerate-prompt-dialog"
    >
      <div className="bg-bg-surface border border-bg-overlay rounded-lg max-w-md w-full p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <p className="text-xs text-text-secondary mt-1">{description}</p>

        <label className="block mt-3 text-[10px] text-text-disabled">
          What should we find instead?
        </label>
        <textarea
          data-testid="regenerate-user-prompt"
          className="mt-1 w-full rounded border border-bg-overlay bg-bg-base text-xs p-2 min-h-[72px] text-text-primary"
          placeholder="e.g. Find where they debate platform fees..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />

        <label className="block mt-3 text-[10px] text-text-disabled">
          Type &quot;{confirmPhrase}&quot; to confirm
        </label>
        <input
          data-testid="regenerate-confirm-input"
          className="mt-1 w-full rounded border border-bg-overlay bg-bg-base text-xs p-2 text-text-primary"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            className="px-3 py-1.5 text-xs rounded text-text-secondary hover:bg-bg-overlay"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="regenerate-prompt-submit"
            disabled={!canSubmit}
            className="px-3 py-1.5 text-xs rounded bg-accent text-white disabled:opacity-50"
            onClick={() => void onConfirm(typed, prompt)}
          >
            {confirmButtonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
