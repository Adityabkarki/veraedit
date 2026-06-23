'use client'

/**
 * KeyboardShortcutsModal — full reference table of editor shortcuts.
 *
 * Opened by pressing `?` or clicking the shortcuts button in EditorHeader.
 * Closed by Escape, clicking the backdrop, or clicking the ✕ button.
 */

import { useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'

interface ShortcutRow {
  keys: string[]
  action: string
}

const SECTIONS: { heading: string; rows: ShortcutRow[] }[] = [
  {
    heading: 'Playback',
    rows: [
      { keys: ['Space'],        action: 'Play / Pause' },
      { keys: ['J'],            action: 'Rewind 5 s' },
      { keys: ['L'],            action: 'Forward 5 s' },
      { keys: ['K'],            action: 'Jump to start' },
      { keys: ['←', '→'],      action: 'Step one frame' },
      { keys: ['Shift', '←'],  action: 'Step back 1 s' },
      { keys: ['Shift', '→'],  action: 'Step forward 1 s' },
    ],
  },
  {
    heading: 'Editing',
    rows: [
      { keys: ['Ctrl', 'Z'],   action: 'Undo' },
      { keys: ['Ctrl', 'Y'],   action: 'Redo' },
      { keys: ['Ctrl', 'S'],   action: 'Save' },
      { keys: ['Delete'],      action: 'Delete selected clip' },
      { keys: ['C'],           action: 'Split clip at playhead' },
      { keys: ['Ctrl', 'D'],   action: 'Duplicate clip' },
    ],
  },
  {
    heading: 'Panels',
    rows: [
      { keys: ['['],           action: 'Toggle left panel' },
      { keys: [']'],           action: 'Toggle AI panel' },
      { keys: ['\\'],          action: 'Reset panel layout' },
      { keys: ['?'],           action: 'Show keyboard shortcuts' },
    ],
  },
  {
    heading: 'Export',
    rows: [
      { keys: ['Ctrl', 'E'],   action: 'Export project' },
      { keys: ['Ctrl', 'Shift', 'E'], action: 'Export all shorts' },
    ],
  },
]

export function KeyboardShortcutsModal() {
  const { shortcutsOpen, closeShortcuts } = useUIStore()

  useEffect(() => {
    if (!shortcutsOpen) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeShortcuts()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [shortcutsOpen, closeShortcuts])

  if (!shortcutsOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      data-testid="shortcuts-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={closeShortcuts}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-2xl bg-bg-surface border border-bg-overlay rounded-xl shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bg-overlay sticky top-0 bg-bg-surface">
          <h2 className="text-lg font-semibold text-text-primary font-display">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={closeShortcuts}
            aria-label="Close shortcuts"
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Shortcuts table */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-disabled mb-3">
                {section.heading}
              </h3>
              <div className="space-y-2">
                {section.rows.map((row) => (
                  <div
                    key={row.action}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm text-text-secondary">{row.action}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {row.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <kbd className="px-2 py-0.5 rounded bg-bg-overlay border border-bg-elevated text-xs font-mono text-text-primary">
                            {k}
                          </kbd>
                          {i < row.keys.length - 1 && (
                            <span className="text-text-disabled text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
