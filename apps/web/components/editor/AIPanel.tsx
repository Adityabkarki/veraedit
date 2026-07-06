'use client'

/**
 * AIPanel — right panel: full AI Suggestions experience.
 *
 * Layout:
 *   Header: "AI Suggestions" + pending count badge
 *   AIPromptBar: natural-language input + quick-action chips
 *   Filter tabs: All / Cuts / Captions / Shorts
 *   Batch-accept CTA: "Apply X high-confidence suggestions"
 *   Suggestion cards: SuggestionCard list
 *   BatchAcceptModal: rendered at root level
 */

import { useSuggestionsStore } from '@/stores/suggestionsStore'
import type { SuggestionFilter } from '@/stores/suggestionsStore'
import { useUIStore }        from '@/stores/uiStore'
import { useEffectsStore }   from '@/stores/effectsStore'
import { useAssetStore }     from '@/stores/assetStore'
import { useDirectorStore }  from '@/stores/directorStore'
import { PanelTooltip }    from '@/components/editor/PanelTooltip'
import { AIPromptBar }     from '@/components/editor/ai/AIPromptBar'
import { SuggestionCard }  from '@/components/editor/ai/SuggestionCard'
import { BatchAcceptModal } from '@/components/editor/ai/BatchAcceptModal'
import { getConfidenceColor } from '@/components/editor/ai/ConfidenceBar'

const FILTERS: { id: SuggestionFilter; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'cuts',     label: 'Cuts'     },
  { id: 'visual',   label: 'Visuals'  },
  { id: 'captions', label: 'Captions' },
  { id: 'shorts',   label: 'Shorts'   },
  { id: 'audio',    label: 'Audio'    },
]

export function AIPanel({ projectId }: { projectId?: string }) {
  const {
    activeFilter,
    setFilter,
    filteredSuggestions,
    pendingCount,
    highConfidencePending,
    openBatchModal,
  } = useSuggestionsStore()

  const assetId = useAssetStore((s) => s.asset?.id ?? null)
  const useDirectorEngine = useDirectorStore((s) => s.useDirectorEngine)

  const { setRightPanelMode } = useUIStore()

  const visible   = filteredSuggestions()
  const pending   = pendingCount(activeFilter)
  const pendingAll = pendingCount('all')
  const highConf  = highConfidencePending()

  return (
    <>
      <div
        data-testid="ai-panel"
        className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden relative"
      >
        {/* First-time tooltip */}
        <PanelTooltip
          panelKey="ai"
          title="AI Suggestions"
          description="Edits the AI recommends: cuts, captions, visuals, and shorts. Preview to see the affected section, then Apply to update the timeline."
          placement="left"
        />

        <p className="px-4 py-2 text-[10px] text-text-disabled border-b border-bg-overlay leading-snug">
          Accepting a suggestion changes the timeline — cuts remove segments, visuals add clips
          on the Visuals track, captions enable the caption style. Save the project to persist.
        </p>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-overlay flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg
              width="16" height="16" viewBox="0 0 16 16" fill="none"
              className="text-accent" aria-hidden="true"
            >
              <path d="M8 1L9.5 5.5H14L10.5 8.5L12 13L8 10L4 13L5.5 8.5L2 5.5H6.5L8 1Z" fill="currentColor"/>
            </svg>
            <h2 className="text-sm font-semibold text-text-primary">AI Suggestions</h2>
          </div>
          {pendingAll > 0 && (
            <span
              data-testid="pending-count"
              className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full font-medium"
              title={
                activeFilter !== 'all' && pending !== pendingAll
                  ? `${pending} pending in this filter · ${pendingAll} total`
                  : undefined
              }
            >
              {activeFilter === 'all' ? pendingAll : `${pending}/${pendingAll}`} pending
            </span>
          )}
          <button
            data-testid="open-effects-panel"
            onClick={() => useEffectsStore.getState().openDrawer()}
            title="Open Effects & elements"
            className="text-[11px] text-text-disabled hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-bg-overlay ml-1"
          >
            ✨
          </button>
          <button
            data-testid="open-producer"
            onClick={() => setRightPanelMode('producer')}
            title="Open AI Producer (podcast tools)"
            className="text-[11px] text-text-disabled hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-bg-overlay ml-1"
          >
            🎙
          </button>
          {/* Switch to Caption Editor */}
          <button
            data-testid="open-caption-editor"
            onClick={() => setRightPanelMode('captions')}
            title="Open Caption Editor"
            className="text-[11px] text-text-disabled hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-bg-overlay"
          >
            Aa
          </button>
          {/* Switch to AI B-Roll */}
          <button
            data-testid="open-ai-broll"
            onClick={() => setRightPanelMode('ai-broll')}
            title="Open AI B-Roll suggestions"
            className="text-[11px] text-text-disabled hover:text-accent transition-colors px-1.5 py-0.5 rounded hover:bg-bg-overlay"
          >
            🎬
          </button>
          <button
            data-testid="open-director-auto-edit"
            onClick={() => setRightPanelMode('director')}
            title={
              useDirectorEngine
                ? 'Open Auto Edit (Director Engine)'
                : 'Open Auto Edit (enable Director Engine)'
            }
            className={[
              'text-[11px] transition-colors px-1.5 py-0.5 rounded hover:bg-bg-overlay',
              useDirectorEngine ? 'text-accent' : 'text-text-disabled hover:text-accent',
            ].join(' ')}
          >
            ✂️
          </button>
        </div>

        <AIPromptBar />

        <div
          role="tablist"
          aria-label="Suggestion filters"
          className="flex gap-1 px-2 py-2 border-b border-bg-overlay flex-shrink-0 overflow-x-auto"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={activeFilter === f.id}
              data-testid={`ai-filter-${f.id}`}
              onClick={() => setFilter(f.id)}
              className={[
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                activeFilter === f.id
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Batch accept CTA ─────────────────────────────────────────────── */}
        {highConf.length > 0 && (
          <div className="px-3 py-2 border-b border-bg-overlay flex-shrink-0">
            <button
              data-testid="batch-accept-button"
              onClick={openBatchModal}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-status-success/10 border border-status-success/30 hover:bg-status-success/20 transition-colors group"
            >
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                className="text-status-success flex-shrink-0"
                aria-hidden="true"
              >
                <path d="M2 7L6 11L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="flex-1 text-left text-xs text-status-success font-medium">
                Apply {highConf.length} high-confidence suggestion{highConf.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-text-disabled group-hover:text-status-success transition-colors">
                ≥80% →
              </span>
            </button>
          </div>
        )}

        {/* ── Suggestion list ──────────────────────────────────────────────── */}
        <div
          data-testid="ai-suggestions-list"
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 space-y-2"
        >
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12 px-4">
              <div className="w-10 h-10 rounded-full bg-bg-overlay flex items-center justify-center text-text-disabled">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path d="M9 1.5L11 7H16.5L12 10.5L14 16L9 12.5L4 16L6 10.5L1.5 7H7L9 1.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <p className="text-sm text-text-secondary font-medium mb-1">
                  {pendingAll > 0 && activeFilter !== 'all'
                    ? `No ${activeFilter} suggestions`
                    : 'No suggestions'}
                </p>
                <p className="text-xs text-text-disabled leading-relaxed">
                  {pendingAll > 0 && activeFilter !== 'all'
                    ? `You have ${pendingAll} pending in other categories — switch to All or Visuals.`
                    : 'Process a video to generate AI suggestions.'}
                </p>
              </div>
            </div>
          ) : (
            visible.map((s) => (
              <SuggestionCard key={s.id} suggestion={s} projectId={projectId} assetId={assetId} />
            ))
          )}
        </div>

        {/* ── Summary footer ───────────────────────────────────────────────── */}
        {visible.length > 0 && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-bg-overlay">
            <p className="text-[11px] text-text-disabled text-center">
              {visible.filter((s) => s.status === 'accepted').length} applied
              {' · '}
              {visible.filter((s) => s.status === 'rejected').length} rejected
              {' · '}
              {visible.filter((s) => s.status === 'pending').length} pending
            </p>
          </div>
        )}
      </div>

      {/* Batch accept modal — rendered outside so it can cover the full editor */}
      <BatchAcceptModal projectId={projectId} assetId={assetId} />
    </>
  )
}
