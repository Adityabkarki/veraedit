'use client'

/**
 * SuggestionCard — one AI suggestion with full interactive UI.
 *
 * Face (always visible):
 *   [type icon]  Title                         [time badge]
 *   ████████░░  94%
 *   Impact: one-line summary
 *   [Why?]  [What changes?]    [✓ Accept]  [✗ Reject]
 *
 * Expanded states (toggleable independently):
 *   "Why did AI suggest this?" — full reasoning paragraph
 *   "What will this change?"   — DiffPreview entry list
 *
 * Accepted state: green border, checkmark, "Undo" button
 * Rejected state: dimmed, strikethrough title, "Undo" button
 */

import { useState } from 'react'
import { useSuggestionsStore } from '@/stores/suggestionsStore'
import type { Suggestion } from '@/stores/suggestionsStore'
import {
  acceptSuggestionApi,
  regenerateScopedApi,
  rejectSuggestionApi,
  scopeForSuggestionType,
} from '@/lib/suggestionActions'
import { RegeneratePromptDialog } from '@/components/editor/RegeneratePromptDialog'
import { useTimelineStore } from '@/stores/timelineStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useAssetStore } from '@/stores/assetStore'
import { ConfidenceBar } from '@/components/editor/ai/ConfidenceBar'
import { DiffPreview }   from '@/components/editor/ai/DiffPreview'

// ── Type icons ────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<Suggestion['type'], React.ReactNode> = {
  cut:     <span className="text-sm" aria-hidden="true">✂</span>,
  trim:    <span className="text-sm" aria-hidden="true">⬡</span>,
  caption: <span className="text-sm" aria-hidden="true">CC</span>,
  short:   <span className="text-base leading-none" aria-hidden="true">⚡</span>,
  audio:   <span className="text-sm" aria-hidden="true">🔊</span>,
  visual:  <span className="text-sm" aria-hidden="true">📊</span>,
}

function formatTime(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return m > 0 ? `${m}:${String(ss).padStart(2, '0')}` : `0:${String(ss).padStart(2, '0')}`
}

interface SuggestionCardProps {
  suggestion: Suggestion
  projectId?: string
  assetId?: string | null
}

export function SuggestionCard({ suggestion: s, projectId, assetId }: SuggestionCardProps) {
  const { acceptSuggestion, rejectSuggestion, undoSuggestion } = useSuggestionsStore()
  const [whyOpen,    setWhyOpen]    = useState(false)
  const [diffOpen,   setDiffOpen]   = useState(false)
  const [regenOpen,  setRegenOpen]  = useState(false)
  const [regenLoading, setRegenLoading] = useState(false)

  const handleAccept = async () => {
    acceptSuggestion(s.id)
    if (projectId && assetId) {
      const res = await acceptSuggestionApi(
        projectId,
        assetId,
        s.id,
        (s.action ?? undefined) as import('@/lib/applySuggestionClient').SuggestionAction | undefined,
        s.apiType,
      )
      if (!res.ok) undoSuggestion(s.id)
    } else if (s.action) {
      const { applySuggestionToEditor, syncOverlaysToVisualLibrary } = await import('@/lib/applySuggestionClient')
      applySuggestionToEditor(s.action as import('@/lib/applySuggestionClient').SuggestionAction, s.apiType)
      syncOverlaysToVisualLibrary(useTimelineStore.getState().clips)
    }
  }

  const handleReject = async () => {
    rejectSuggestion(s.id)
    if (projectId && assetId) {
      const res = await rejectSuggestionApi(projectId, assetId, s.id)
      if (!res.ok) undoSuggestion(s.id)
    }
  }

  const handlePreview = () => {
    const action = s.action as Record<string, unknown> | null
    const start =
      s.timeRange?.start ??
      Number(action?.start_time ?? action?.start ?? 0)
    const end =
      s.timeRange?.end ??
      Number(action?.end_time ?? action?.end ?? start + 5)
    useTimelineStore.getState().setPlayheadTime(start)
    const videoUrl = useAssetStore.getState().asset?.videoUrl
    if (videoUrl && end > start) {
      usePlayerStore.getState().previewShort(start, end)
    } else {
      usePlayerStore.getState().seek(start)
    }
  }

  const isAccepted = s.status === 'accepted'
  const isRejected = s.status === 'rejected'

  const regenScope = scopeForSuggestionType(s.apiType)

  return (
    <div
      data-testid={`suggestion-card-${s.id}`}
      aria-label={`Suggestion: ${s.title}`}
    >
      <RegeneratePromptDialog
        open={regenOpen}
        title="Improve this suggestion"
        description="Reject and tell the AI what to find instead. We will regenerate this category."
        confirmPhrase="regenerate"
        confirmButtonLabel="Regenerate"
        loading={regenLoading}
        onClose={() => setRegenOpen(false)}
        onConfirm={async (typed, userPrompt) => {
          if (!projectId || !assetId) return
          setRegenLoading(true)
          await rejectSuggestionApi(projectId, assetId, s.id)
          rejectSuggestion(s.id)
          const res = await regenerateScopedApi(
            projectId,
            assetId,
            regenScope,
            userPrompt,
            typed,
            [s.id],
          )
          setRegenLoading(false)
          if (res.ok) setRegenOpen(false)
        }}
      />
    <div
      className={[
        'rounded-lg border p-3 transition-all',
        isAccepted ? 'border-status-success/50 bg-status-success/5' :
        isRejected ? 'border-bg-overlay bg-bg-surface opacity-50'   :
                     'border-bg-overlay bg-bg-elevated hover:border-accent/30',
      ].join(' ')}
    >
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 mb-2">
        {/* Type icon */}
        <span className={`flex-shrink-0 mt-0.5 ${isRejected ? 'text-text-disabled' : 'text-text-secondary'}`}>
          {TYPE_ICONS[s.type]}
        </span>

        {/* Title */}
        <span
          data-testid={`suggestion-title-${s.id}`}
          className={[
            'flex-1 text-sm font-medium leading-snug',
            isRejected  ? 'text-text-disabled line-through' :
            isAccepted  ? 'text-status-success'             :
                          'text-text-primary',
          ].join(' ')}
        >
          {s.title}
        </span>

        {/* Time range badge */}
        {s.timeRange && (
          <span className="text-[10px] font-mono text-text-disabled bg-bg-overlay px-1.5 py-0.5 rounded flex-shrink-0">
            {formatTime(s.timeRange.start)}–{formatTime(s.timeRange.end)}
          </span>
        )}
      </div>

      {/* ── Confidence bar ──────────────────────────────────────────────────── */}
      {!isRejected && (
        <ConfidenceBar
          confidence={s.confidence}
          className="mb-2"
        />
      )}

      {/* ── Impact summary ──────────────────────────────────────────────────── */}
      <p
        data-testid={`suggestion-impact-${s.id}`}
        className="text-xs text-text-secondary leading-relaxed mb-3"
      >
        {s.impact}
      </p>

      {/* ── Expandable: Why? ────────────────────────────────────────────────── */}
      {whyOpen && (
        <div
          data-testid={`why-section-${s.id}`}
          className="mb-3 p-2.5 rounded bg-bg-overlay border border-bg-overlay animate-fade-in"
        >
          <p className="text-xs font-semibold text-text-secondary mb-1">Why did AI suggest this?</p>
          <p className="text-xs text-text-secondary leading-relaxed">{s.reasoning}</p>
        </div>
      )}

      {/* ── Expandable: Diff ─────────────────────────────────────────────────── */}
      {diffOpen && (
        <div
          data-testid={`diff-section-${s.id}`}
          className="mb-3 animate-fade-in"
        >
          <p className="text-xs font-semibold text-text-secondary mb-1">What will this change?</p>
          <DiffPreview diff={s.diff} />
        </div>
      )}

      {/* ── Action row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Expand buttons — only when pending */}
        {!isAccepted && !isRejected && (
          <>
            <button
              data-testid={`why-toggle-${s.id}`}
              onClick={() => setWhyOpen((v) => !v)}
              aria-expanded={whyOpen}
              className={[
                'px-2 py-1 rounded text-xs transition-colors',
                whyOpen
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-disabled hover:text-text-secondary hover:bg-bg-overlay',
              ].join(' ')}
            >
              Why?
            </button>

            <button
              data-testid={`diff-toggle-${s.id}`}
              onClick={() => setDiffOpen((v) => !v)}
              aria-expanded={diffOpen}
              className={[
                'px-2 py-1 rounded text-xs transition-colors',
                diffOpen
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-disabled hover:text-text-secondary hover:bg-bg-overlay',
              ].join(' ')}
            >
              What changes?
            </button>
          </>
        )}

        <div className="flex-1" />

        {/* Accept / Reject / Undo */}
        {isAccepted ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-status-success flex items-center gap-1">
              <span aria-hidden="true">✓</span> Applied
            </span>
            <button
              data-testid={`undo-suggestion-${s.id}`}
              onClick={() => undoSuggestion(s.id)}
              className="px-2 py-1 rounded text-xs text-text-disabled hover:text-text-secondary hover:bg-bg-overlay transition-colors"
            >
              Undo
            </button>
          </div>
        ) : isRejected ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-disabled flex items-center gap-1">
              <span aria-hidden="true">✕</span> Rejected
            </span>
            <button
              data-testid={`undo-suggestion-${s.id}`}
              onClick={() => undoSuggestion(s.id)}
              className="px-2 py-1 rounded text-xs text-text-disabled hover:text-text-secondary hover:bg-bg-overlay transition-colors"
            >
              Undo
            </button>
          </div>
        ) : (
          <>
            <button
              data-testid={`preview-suggestion-${s.id}`}
              onClick={handlePreview}
              className="px-2 py-1 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors"
            >
              Preview
            </button>

            <button
              type="button"
              data-testid={`improve-suggestion-${s.id}`}
              onClick={() => setRegenOpen(true)}
              className="px-2 py-1 rounded text-xs text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors"
              title="Reject and regenerate with your prompt"
            >
              Improve
            </button>

            <button
              data-testid={`reject-suggestion-${s.id}`}
              onClick={() => void handleReject()}
              aria-label={`Reject: ${s.title}`}
              className="p-1.5 rounded text-text-disabled hover:text-status-error hover:bg-status-error/10 transition-colors"
              title="Reject"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>

            <button
              data-testid={`accept-suggestion-${s.id}`}
              onClick={() => void handleAccept()}
              aria-label={`Accept: ${s.title}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent hover:bg-accent-glow text-white text-xs font-medium transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Apply
            </button>
          </>
        )}
      </div>
    </div>
    </div>
  )
}
