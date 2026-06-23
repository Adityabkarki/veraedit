'use client'

/**
 * EditorHeader — top bar of the editor.
 *
 * Left:   ← back to dashboard, project title
 * Centre: undo / redo buttons, save status
 * Right:  keyboard shortcuts button, Export button
 *
 * The header also listens for Ctrl+Z / Ctrl+Y so undo/redo work globally.
 */

import Link from 'next/link'
import { useEditorStore, SaveStatus } from '@/stores/editorStore'
import { useUIStore }     from '@/stores/uiStore'
import { ModeSelector }   from '@/components/editor/ModeSelector'

interface EditorHeaderProps {
  projectTitle: string
  projectId: string
  /** Optional handlers wired to the real undo/redo stack */
  onUndo?: () => void
  onRedo?: () => void
  onExport?: () => void
}

const SAVE_LABEL: Record<SaveStatus, { text: string; color: string }> = {
  saved:   { text: 'All changes saved',   color: 'text-status-success' },
  saving:  { text: 'Saving…',             color: 'text-text-secondary' },
  unsaved: { text: 'Unsaved changes',      color: 'text-status-warning' },
  error:   { text: 'Save failed',          color: 'text-status-error'  },
}

export function EditorHeader({
  projectTitle,
  projectId,
  onUndo,
  onRedo,
  onExport,
}: EditorHeaderProps) {
  const { saveStatus } = useEditorStore()
  const { openShortcuts } = useUIStore()

  const save = SAVE_LABEL[saveStatus]

  return (
    <header
      data-testid="editor-header"
      className="h-11 flex items-center justify-between px-3 sm:px-4 bg-bg-surface border-b border-bg-overlay flex-shrink-0 gap-2"
    >
      {/* ── Left ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          data-testid="back-to-dashboard"
          className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-sm hidden sm:inline">Dashboard</span>
        </Link>

        <div className="h-4 w-px bg-bg-overlay" />

        <h1
          data-testid="project-title"
          className="text-sm font-medium text-text-primary truncate max-w-[200px]"
          title={projectTitle}
        >
          {projectTitle}
        </h1>
      </div>

      {/* ── Centre ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Mode switcher */}
        <ModeSelector />
        <div className="h-4 w-px bg-bg-overlay" />
        <button
          data-testid="undo-button"
          onClick={onUndo}
          aria-label="Undo (Ctrl+Z)"
          title="Undo (Ctrl+Z)"
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 7H10C11.6569 7 13 8.34315 13 10C13 11.6569 11.6569 13 10 13H6"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M6 4L3 7L6 10"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <button
          data-testid="redo-button"
          onClick={onRedo}
          aria-label="Redo (Ctrl+Y)"
          title="Redo (Ctrl+Y)"
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M13 7H6C4.34315 7 3 8.34315 3 10C3 11.6569 4.34315 13 6 13H10"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 4L13 7L10 10"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div
          data-testid="save-status"
          className={`text-xs hidden sm:block ${save.color}`}
          aria-live="polite"
          aria-label={`Save status: ${save.text}`}
        >
          {save.text}
        </div>
      </div>

      {/* ── Right ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          data-testid="shortcuts-button"
          onClick={openShortcuts}
          aria-label="Keyboard shortcuts (?)"
          title="Keyboard shortcuts (?)"
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.25"/>
            <rect x="3" y="6" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
            <rect x="5.25" y="6" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
            <rect x="7.5" y="6" width="1" height="1.5" rx="0.3" fill="currentColor"/>
            <rect x="9.25" y="6" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
            <rect x="11.5" y="6" width="1.5" height="1.5" rx="0.3" fill="currentColor"/>
            <rect x="4.25" y="8.5" width="7.5" height="1.5" rx="0.3" fill="currentColor"/>
          </svg>
        </button>

        <button
          data-testid="export-button"
          onClick={onExport}
          aria-label="Export project"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-glow text-white text-sm font-medium transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 1V9M7 9L4 6M7 9L10 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Export
        </button>
      </div>
    </header>
  )
}
