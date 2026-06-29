'use client'

/**
 * ModeSelector — compact mode switcher in the EditorHeader.
 *
 * Modes:
 *   ✂ Editor     — standard 4-panel NLE layout
 *   ⚡ Shorts     — full-screen Opus Clip-style shorts grid
 *   📖 Chapters   — full-screen chapter/scene management
 *   ⭐ Promo      — full-screen promo highlights
 *
 * The active mode is stored in editorStore and persisted.
 */

import { useEditorStore, type EditorMode } from '@/stores/editorStore'

const ChaptersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="2.5" width="5" height="11" rx="1" stroke="currentColor" strokeWidth="1.25"/>
    <rect x="9.5" y="2.5" width="5" height="11" rx="1" stroke="currentColor" strokeWidth="1.25"/>
    <path d="M8 4v8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
  </svg>
)

const PromoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 1L10 5.5L15 6L11.5 9.5L12.5 15L8 12L3.5 15L4.5 9.5L1 6L6 5.5L8 1Z"
      stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
  </svg>
)

const MODES: { id: EditorMode; label: string; icon: React.ReactNode }[] = [
  { id: 'editor', label: 'Editor', icon: <span aria-hidden="true">✂</span> },
  { id: 'shorts', label: 'Shorts', icon: <span aria-hidden="true">⚡</span> },
  { id: 'chapters', label: 'Chapters', icon: <ChaptersIcon /> },
  { id: 'promo', label: 'Promo', icon: <PromoIcon /> },
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
          {m.icon}
          <span className="hidden sm:inline">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
