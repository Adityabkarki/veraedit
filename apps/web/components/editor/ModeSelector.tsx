'use client'

/**
 * ModeSelector — compact mode switcher in the EditorHeader.
 *
 * Modes:
 *   ✂ Editor  — standard 4-panel NLE layout
 *   ⚡ Shorts  — full-screen Opus Clip-style shorts grid
 *
 * The active mode is stored in editorStore and persisted.
 * Clicking a mode chip switches instantly (no animation for now).
 */

import { useEditorStore, type EditorMode } from '@/stores/editorStore'

const MODES: { id: EditorMode; label: string; icon: string }[] = [
  { id: 'editor', label: 'Editor', icon: '✂' },
  { id: 'shorts', label: 'Shorts', icon: '⚡' },
]

export function ModeSelector() {
  const { editorMode, setEditorMode } = useEditorStore()

  return (
    <div
      data-testid="mode-selector"
      role="tablist"
      aria-label="Editor mode"
      className="flex gap-0.5 p-0.5 rounded-lg bg-bg-overlay"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={editorMode === m.id}
          data-testid={`mode-btn-${m.id}`}
          onClick={() => setEditorMode(m.id)}
          title={`Switch to ${m.label} mode`}
          className={[
            'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
            editorMode === m.id
              ? 'bg-bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          <span aria-hidden="true">{m.icon}</span>
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
