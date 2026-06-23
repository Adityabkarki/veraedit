'use client'

/**
 * SubtitleEditorPanel — VEED-style caption editor in the right panel.
 *
 * Layout:
 *   ┌── header: "Caption Editor" ← Back to AI  ──────────────────────────────┐
 *   ├── StylePicker (4 presets + custom controls) ─────────────────────────────┤
 *   ├── [FindReplace-bar — toggled by 🔍 button] ─────────────────────────────┤
 *   ├── scrollable CaptionRow list ────────────────────────────────────────────┤
 *   └── ExportOptions (SRT / VTT / Burn) ─────────────────────────────────────┘
 *
 * Caption list live-updates the VideoPreview overlay via playerStore.activeCaptionText.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useCaptionsStore }  from '@/stores/captionsStore'
import { usePlayerStore }    from '@/stores/playerStore'
import { useUIStore }        from '@/stores/uiStore'
import { CaptionRow }        from '@/components/editor/captions/CaptionRow'
import { StylePicker }       from '@/components/editor/captions/StylePicker'
import { FindReplaceBar }    from '@/components/editor/captions/FindReplaceBar'
import { ExportOptions }     from '@/components/editor/captions/ExportOptions'

export function SubtitleEditorPanel() {
  const { captions, editingId, selectedId, searchMatchIds } = useCaptionsStore()
  const { currentTime, setActiveCaptionText }                = usePlayerStore()
  const { setRightPanelMode }                                = useUIStore()

  const [showFindReplace, setShowFindReplace] = useState(false)

  // ── Sync active caption text to player overlay ────────────────────────────
  useEffect(() => {
    const active = captions.find(
      (c) => currentTime >= c.startTime && currentTime < c.endTime
    )
    setActiveCaptionText(active?.text ?? null)
  }, [currentTime, captions, setActiveCaptionText])

  // ── Ctrl+F shortcut ────────────────────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowFindReplace(true)
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [])

  const searchMatchSet = useMemo(() => new Set(searchMatchIds), [searchMatchIds])

  return (
    <div
      data-testid="subtitle-editor-panel"
      className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-bg-overlay flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-accent" aria-hidden="true">
            <path d="M2 3h10v8H2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
            <path d="M4 6h6M4 8.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          <h2 className="text-sm font-semibold text-text-primary">Caption Editor</h2>
          <span className="text-[10px] text-text-disabled bg-bg-overlay px-1.5 py-0.5 rounded">
            {captions.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Find & Replace */}
          <button
            data-testid="open-find-replace"
            onClick={() => setShowFindReplace((v) => !v)}
            aria-label="Find & Replace (Ctrl+F)"
            title="Find & Replace (Ctrl+F)"
            aria-pressed={showFindReplace}
            className={[
              'p-1.5 rounded transition-colors',
              showFindReplace
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
            ].join(' ')}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M8 8L10.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Back to AI */}
          <button
            data-testid="back-to-ai"
            onClick={() => setRightPanelMode('ai')}
            aria-label="Back to AI Suggestions"
            title="Back to AI panel"
            className="text-[11px] text-accent hover:text-accent-glow transition-colors px-1.5"
          >
            ← AI
          </button>
        </div>
      </div>

      {/* ── Style Picker ───────────────────────────────────────────────────── */}
      <StylePicker />

      {/* ── Find/Replace Bar ───────────────────────────────────────────────── */}
      {showFindReplace && (
        <FindReplaceBar onClose={() => setShowFindReplace(false)} />
      )}

      {/* ── Caption list ───────────────────────────────────────────────────── */}
      <div
        data-testid="caption-list"
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
      >
        {captions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-6">
            <p className="text-sm text-text-secondary">No captions yet.</p>
            <p className="text-xs text-text-disabled">
              Captions appear after transcription finishes. They also show as clips on the
              Captions track in the timeline.
            </p>
          </div>
        ) : (
          captions.map((cap) => (
            <CaptionRow
              key={cap.id}
              caption={cap}
              isEditing={editingId === cap.id}
              isSelected={selectedId === cap.id}
              isSearchMatch={searchMatchSet.has(cap.id)}
            />
          ))
        )}
      </div>

      {/* ── Export Options ──────────────────────────────────────────────────── */}
      <ExportOptions />
    </div>
  )
}
