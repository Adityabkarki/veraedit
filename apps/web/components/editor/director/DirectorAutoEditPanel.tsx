'use client'

/**
 * DirectorAutoEditPanel — Auto Edit per content pillar, trigger log, Phase 6 overrides.
 * Visible only when useDirectorEngine is enabled for the project.
 */

import { useCallback, useEffect, useState } from 'react'
import { useDirectorStore } from '@/stores/directorStore'
import { useUIStore } from '@/stores/uiStore'
import { useAssetStore } from '@/stores/assetStore'
import { usePlayerStore } from '@/stores/playerStore'
import { fetchDirectorTimelineTriggers } from '@/lib/directorApi'
import {
  DIRECTOR_PILLARS,
  entryForTrigger,
  triggerLabel,
  type DirectorContentType,
  type TriggerLogEntry,
} from '@/types/director'

interface DirectorAutoEditPanelProps {
  projectId: string
}

export function DirectorAutoEditPanel({ projectId }: DirectorAutoEditPanelProps) {
  const {
    useDirectorEngine,
    timeline,
    timelineId,
    compiling,
    compileError,
    hasManualOverrides,
    lastCompileLabel,
    version,
    runAutoEdit,
    applyOverride,
    enableEngine,
  } = useDirectorStore()

  const assetId = useAssetStore((s) => s.asset?.id ?? null)
  const setRightPanelMode = useUIStore((s) => s.setRightPanelMode)

  const handleCompile = useCallback(
    async (pillar: DirectorContentType) => {
      const ok = await runAutoEdit(projectId, pillar, {
        assetId: assetId ?? undefined,
        overwrite: hasManualOverrides,
      })
      if (ok) {
        setRightPanelMode('director')
      }
    },
    [projectId, assetId, hasManualOverrides, runAutoEdit, setRightPanelMode],
  )

  if (!useDirectorEngine) {
    return (
      <div data-testid="director-enable-panel" className="p-4 space-y-3">
        <h2 className="text-sm font-semibold text-text-primary">Director Engine (beta)</h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          Enable the new Auto Edit pipeline for this project. Your legacy editor timeline stays
          unchanged until you export with Director Engine enabled.
        </p>
        <button
          type="button"
          data-testid="director-enable-button"
          onClick={() => enableEngine(projectId)}
          className="w-full px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90"
        >
          Enable Auto Edit
        </button>
        {compileError && (
          <p className="text-xs text-status-error" role="alert">
            {compileError}
          </p>
        )}
      </div>
    )
  }

  const realized = timeline?.triggers.filter((t) => t.status === 'realized') ?? []
  const suppressed = timeline?.triggers.filter((t) => t.status === 'suppressed') ?? []

  return (
    <div data-testid="director-auto-edit-panel" className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-bg-overlay flex-shrink-0">
        <h2 className="text-sm font-semibold text-text-primary">Auto Edit</h2>
        <p className="text-[10px] text-text-secondary mt-1 leading-snug">
          Compile a Director timeline from your transcript. Review triggers below, then delete or
          promote entries before export.
        </p>
      </div>

      <div className="p-4 space-y-2 flex-shrink-0 border-b border-bg-overlay">
        <p className="text-[10px] uppercase tracking-wide text-text-disabled font-semibold">
          Content type
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DIRECTOR_PILLARS.map((pillar) => (
            <button
              key={pillar.id}
              type="button"
              data-testid={`auto-edit-${pillar.id}`}
              disabled={compiling}
              onClick={() => handleCompile(pillar.id)}
              className="text-left px-3 py-2 rounded-lg border border-bg-overlay hover:border-accent/50 hover:bg-accent/5 disabled:opacity-50 transition-colors"
            >
              <span className="text-xs font-semibold text-text-primary block">{pillar.label}</span>
              <span className="text-[10px] text-text-secondary">{pillar.hint}</span>
            </button>
          ))}
        </div>
        {compiling && (
          <p className="text-xs text-text-secondary" aria-live="polite">
            Compiling timeline…
          </p>
        )}
        {compileError && (
          <p className="text-xs text-status-error" role="alert">
            {compileError}
          </p>
        )}
        {timeline && (
          <p className="text-[10px] text-status-success">
            v{version} compiled
            {lastCompileLabel ? ` (${lastCompileLabel})` : ''}
            — {realized.length} realized, {suppressed.length} suppressed
            {hasManualOverrides ? ' · manual edits' : ''}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        <PaginatedTriggerSection
          title="On timeline"
          status="realized"
          timelineId={timelineId}
          timeline={timeline}
          fallbackTriggers={realized}
          onDelete={(entryId) => applyOverride(projectId, { action: 'delete_entry', entry_id: entryId })}
        />
        <PaginatedTriggerSection
          title="Held back"
          status="suppressed"
          timelineId={timelineId}
          timeline={timeline}
          fallbackTriggers={suppressed}
          onPromote={(triggerId) =>
            applyOverride(projectId, { action: 'promote_trigger', trigger_id: triggerId })
          }
        />
        {!timeline && (
          <p className="text-xs text-text-disabled text-center py-8">
            Run Auto Edit for a content type to see why elements were placed.
          </p>
        )}
      </div>
    </div>
  )
}

function PaginatedTriggerSection({
  title,
  status,
  timelineId,
  timeline,
  fallbackTriggers,
  onDelete,
  onPromote,
}: {
  title: string
  status: 'realized' | 'suppressed'
  timelineId: string | null
  timeline: ReturnType<typeof useDirectorStore.getState>['timeline']
  fallbackTriggers: TriggerLogEntry[]
  onDelete?: (entryId: string) => void
  onPromote?: (triggerId: string) => void
}) {
  const [triggers, setTriggers] = useState<TriggerLogEntry[]>(fallbackTriggers)
  const [total, setTotal] = useState(fallbackTriggers.length)
  const [cursor, setCursor] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const usePagination = Boolean(timelineId) && fallbackTriggers.length > 50

  useEffect(() => {
    setTriggers(fallbackTriggers)
    setTotal(fallbackTriggers.length)
    setCursor(fallbackTriggers.length)
    setHasMore(false)
  }, [fallbackTriggers, timelineId])

  const loadPage = useCallback(
    async (nextCursor: number, append: boolean) => {
      if (!timelineId || !usePagination) return
      setLoading(true)
      const { data } = await fetchDirectorTimelineTriggers(timelineId, {
        cursor: nextCursor,
        limit: 50,
        status,
      })
      setLoading(false)
      if (!data) return
      setTriggers((prev) => (append ? [...prev, ...data.triggers] : data.triggers))
      setTotal(data.total)
      setCursor(data.nextCursor ?? data.total)
      setHasMore(data.hasMore)
    },
    [timelineId, status, usePagination],
  )

  useEffect(() => {
    if (usePagination && timelineId) {
      void loadPage(0, false)
    }
  }, [usePagination, timelineId, loadPage])

  return (
    <TriggerSection
      title={title}
      triggers={triggers}
      totalCount={usePagination ? total : triggers.length}
      timeline={timeline}
      loading={loading}
      hasMore={usePagination && hasMore}
      onLoadMore={() => loadPage(cursor, true)}
      onDelete={onDelete}
      onPromote={onPromote}
    />
  )
}

function TriggerSection({
  title,
  triggers,
  totalCount,
  timeline,
  loading,
  hasMore,
  onLoadMore,
  onDelete,
  onPromote,
}: {
  title: string
  triggers: TriggerLogEntry[]
  totalCount?: number
  timeline: ReturnType<typeof useDirectorStore.getState>['timeline']
  loading?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  onDelete?: (entryId: string) => void
  onPromote?: (triggerId: string) => void
}) {
  if (!triggers.length && !loading) return null
  const countLabel = totalCount ?? triggers.length

  return (
    <section data-testid={`trigger-section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <h3 className="text-[10px] uppercase tracking-wide text-text-disabled font-semibold mb-2">
        {title} ({countLabel})
      </h3>
      <ul className="space-y-2">
        {triggers.map((trigger) => {
          const entry = timeline ? entryForTrigger(timeline, trigger) : undefined
          const source = trigger.confidenceSource ?? 'heuristic'
          return (
            <li
              key={trigger.id}
              data-testid={`trigger-log-${trigger.id}`}
              className="rounded-lg border border-bg-overlay px-3 py-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary truncate">
                    {triggerLabel(trigger.type)}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    {trigger.transcriptStart.toFixed(1)}s – {trigger.transcriptEnd.toFixed(1)}s ·
                    confidence {(trigger.confidence * 100).toFixed(0)}% ·{' '}
                    <span className={source === 'ml' ? 'text-status-success' : 'text-text-disabled'}>
                      {source}
                    </span>
                  </p>
                  {entry && (
                    <p className="text-[10px] text-text-disabled mt-0.5 truncate">
                      → {entry.componentId}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  {entry && onDelete && (
                    <button
                      type="button"
                      data-testid={`delete-trigger-${trigger.id}`}
                      onClick={() => {
                        onDelete(entry.id)
                        usePlayerStore.getState().seek(trigger.transcriptStart)
                      }}
                      className="px-2 py-0.5 rounded text-[10px] border border-status-error/40 text-status-error hover:bg-status-error/10"
                    >
                      Delete
                    </button>
                  )}
                  {trigger.status === 'suppressed' && onPromote && (
                    <button
                      type="button"
                      data-testid={`promote-trigger-${trigger.id}`}
                      onClick={() => {
                        onPromote(trigger.id)
                        usePlayerStore.getState().seek(trigger.transcriptStart)
                      }}
                      className="px-2 py-0.5 rounded text-[10px] border border-accent/40 text-accent hover:bg-accent/10"
                    >
                      Add
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`seek-trigger-${trigger.id}`}
                    onClick={() => usePlayerStore.getState().seek(trigger.transcriptStart)}
                    className="px-2 py-0.5 rounded text-[10px] text-text-secondary hover:text-text-primary"
                  >
                    Preview
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {hasMore && onLoadMore && (
        <button
          type="button"
          data-testid={`load-more-triggers-${title.toLowerCase().replace(/\s+/g, '-')}`}
          disabled={loading}
          onClick={onLoadMore}
          className="mt-2 w-full px-3 py-1.5 rounded-lg border border-bg-overlay text-[10px] text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more triggers'}
        </button>
      )}
    </section>
  )
}
