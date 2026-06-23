'use client'

/**
 * AIPromptBar — natural-language edit request input.
 *
 * - Text field: "Ask AI to edit…"
 * - Submit with Enter or the Apply button
 * - Loading spinner while processing
 * - Quick-action chips below the input for common operations
 */

import { useSuggestionsStore } from '@/stores/suggestionsStore'

const QUICK_ACTIONS = [
  { label: 'Remove silences',  prompt: 'Remove all silences longer than 0.8 seconds' },
  { label: 'Add captions',     prompt: 'Add Nepali captions to the entire video' },
  { label: 'Extract shorts',   prompt: 'Find the best 3 viral short clips' },
  { label: 'Trim fillers',     prompt: 'Remove filler words (umm, uh, basically)' },
]

export function AIPromptBar() {
  const { promptText, isLoading, setPromptText, submitPrompt } = useSuggestionsStore()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (promptText.trim()) submitPrompt()
  }

  const handleChip = (prompt: string) => {
    setPromptText(prompt)
  }

  return (
    <div data-testid="ai-prompt-bar" className="px-3 py-3 border-b border-bg-overlay">
      {/* Input row */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-overlay border border-bg-overlay focus-within:border-accent transition-colors">
          {/* Star icon */}
          <svg
            width="13" height="13" viewBox="0 0 13 13" fill="none"
            className="text-accent flex-shrink-0"
            aria-hidden="true"
          >
            <path d="M6.5 1L8 5H12L8.5 7.5L10 12L6.5 9.5L3 12L4.5 7.5L1 5H5L6.5 1Z" fill="currentColor"/>
          </svg>
          <input
            data-testid="ai-prompt-input"
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Ask AI to edit…"
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-disabled outline-none disabled:opacity-60"
          />
          {isLoading && (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}
        </div>

        <button
          type="submit"
          data-testid="ai-prompt-submit"
          disabled={!promptText.trim() || isLoading}
          className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-glow text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          Apply
        </button>
      </form>

      {/* Quick-action chips */}
      <div className="flex flex-wrap gap-1.5 mt-2">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            data-testid={`quick-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => handleChip(action.prompt)}
            disabled={isLoading}
            className="px-2.5 py-1 rounded-full bg-bg-overlay border border-bg-elevated text-xs text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
