'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { useAssetStore } from '@/stores/assetStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { RightPanelHeader } from '@/components/editor/RightPanelHeader'
import { PanelTooltip } from '@/components/editor/PanelTooltip'
import { BrollStockSearch } from './BrollStockSearch'
import { loadEditorProject } from '@/lib/editorData'
import { saveProjectTimeline } from '@/lib/renderExport'
import { toast } from 'sonner'

interface BrollSuggestion {
  id: string
  title: string
  description: string
  start_time: number | null
  end_time: number | null
  confidence: number
  status: string
  broll_prompt: string
  broll_reason: string
  generation_status: string
  text_excerpt: string
  generated_asset_url?: string
  generated_asset_id?: string
  error_message?: string
}

interface BatchTask {
  suggestion_id: string
  task_id: string
  method: string
}

type CardStatus = 'idle' | 'generating' | 'generated' | 'error'

function formatTime(seconds: number | null): string {
  if (seconds == null) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const REASON_LABELS: Record<string, string> = {
  abstract_concept: 'Abstract',
  technical_term: 'Technical',
  dead_air: 'Dead Air',
  topic_transition: 'Transition',
  emotional_beat: 'Emotional',
  story_narrative: 'Narrative',
  explanation: 'Explanation',
}

const REASON_COLORS: Record<string, string> = {
  abstract_concept: 'bg-purple-500/10 text-purple-400',
  technical_term: 'bg-blue-500/10 text-blue-400',
  dead_air: 'bg-orange-500/10 text-orange-400',
  topic_transition: 'bg-green-500/10 text-green-400',
  emotional_beat: 'bg-pink-500/10 text-pink-400',
  story_narrative: 'bg-yellow-500/10 text-yellow-400',
  explanation: 'bg-cyan-500/10 text-cyan-400',
}

const STRATEGIES = [
  { value: 'prefer_stock', label: 'Prefer stock (Pexels)', desc: 'Stock footage first, AI fallback' },
  { value: 'prefer_ai', label: 'Prefer AI images', desc: 'AI generation first, stock fallback' },
  { value: 'all_stock', label: 'Stock only', desc: 'Use stock footage only' },
  { value: 'all_ai', label: 'AI only', desc: 'Use AI images only' },
]

export function AIBRollPanel({ projectId }: { projectId?: string }) {
  const [suggestions, setSuggestions] = useState<BrollSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cardStatus, setCardStatus] = useState<Record<string, CardStatus>>({})
  const [cardError, setCardError] = useState<Record<string, string>>({})
  const [stockSearchSuggestion, setStockSearchSuggestion] = useState<string | null>(null)
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [fillingDeadAir, setFillingDeadAir] = useState(false)
  const [strategy, setStrategy] = useState('prefer_stock')
  const [directSearchQuery, setDirectSearchQuery] = useState('')
  const [directStockOpen, setDirectStockOpen] = useState(false)
  const [directGenerating, setDirectGenerating] = useState(false)

  const assetId = useAssetStore((s) => s.asset?.id ?? null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const notifiedGenerated = useRef<Set<string>>(new Set())
  const directPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [directTaskId, setDirectTaskId] = useState<string | null>(null)

  const hasGenerating = Object.values(cardStatus).some((s) => s === 'generating')

  const fetchSuggestions = useCallback(async () => {
    if (!assetId || !projectId) return
    const res = await api.get<{
      status: string
      broll_count: number
      broll_suggestions: BrollSuggestion[]
    }>(`/projects/${projectId}/assets/${assetId}/broll-suggestions`)
    if (!res.error && res.data?.broll_suggestions) {
      setSuggestions(res.data.broll_suggestions)
    }
  }, [assetId, projectId])

  useEffect(() => {
    if (!assetId || !projectId) return
    setLoading(true)
    fetchSuggestions().finally(() => setLoading(false))
  }, [assetId, projectId, fetchSuggestions])

  useEffect(() => {
    if (!hasGenerating) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(fetchSuggestions, 2000)
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [hasGenerating, fetchSuggestions])

  const pendingCount = suggestions.filter(
    (s) => !cardStatus[s.id] || cardStatus[s.id] === 'idle' || cardStatus[s.id] === 'error'
  ).length

  const deadAirCount = suggestions.filter(
    (s) => s.broll_reason === 'dead_air' && (!cardStatus[s.id] || cardStatus[s.id] === 'idle' || cardStatus[s.id] === 'error')
  ).length

  useEffect(() => {
    const next: Record<string, CardStatus> = {}
    const errs: Record<string, string> = {}
    let hasNewlyGenerated = false

    for (const s of suggestions) {
      const gs = s.generation_status
      if (gs === 'generated' || gs === 'generating_image' || gs === 'rendering_video' || gs === 'uploading' || gs === 'downloading' || gs === 'queued') {
        const newStatus: CardStatus = gs === 'generated' ? 'generated' : 'generating'
        next[s.id] = newStatus

        if (newStatus === 'generated' && !notifiedGenerated.current.has(s.id)) {
          notifiedGenerated.current.add(s.id)
          hasNewlyGenerated = true
          toast.success('B-roll added to timeline', {
            description: s.broll_prompt.slice(0, 80),
            duration: 4000,
          })
        }
      } else if (gs === 'error') {
        next[s.id] = 'error'
        errs[s.id] = s.error_message || 'Generation failed'
        if (!notifiedGenerated.current.has(s.id)) {
          notifiedGenerated.current.add(s.id)
          toast.error('B-roll generation failed', {
            description: errs[s.id],
            duration: 5000,
          })
        }
      }
    }

    if (Object.keys(next).length > 0) {
      setCardStatus((prev) => ({ ...prev, ...next }))
    }
    if (Object.keys(errs).length > 0) {
      setCardError((prev) => ({ ...prev, ...errs }))
    }

    if (hasNewlyGenerated && projectId) {
      loadEditorProject(projectId, { reloadTimeline: true, preservePlayhead: true })
    }
  }, [suggestions, projectId])

  useEffect(() => {
    if (!directTaskId || !projectId) {
      if (directPollRef.current) {
        clearInterval(directPollRef.current)
        directPollRef.current = null
      }
      return
    }

    let attempts = 0
    const maxAttempts = 60

    if (directPollRef.current) {
      clearInterval(directPollRef.current)
    }

    directPollRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        if (directPollRef.current) {
          clearInterval(directPollRef.current)
          directPollRef.current = null
        }
        setDirectTaskId(null)
        toast.error('Stock B-roll timed out', {
          description: 'The task took too long. Please try again.',
        })
        return
      }

      const res = await api.get<{ status: string; result?: { asset_id?: string }; error?: string }>(
        `/tasks/${directTaskId}`,
      )

      if (res.error) return

      const status = res.data?.status

      if (status === 'success') {
        if (directPollRef.current) {
          clearInterval(directPollRef.current)
          directPollRef.current = null
        }
        setDirectTaskId(null)
        toast.success('Stock B-roll added to timeline')
        loadEditorProject(projectId, { reloadTimeline: true, preservePlayhead: true })
      } else if (status === 'failure' || status === 'error') {
        if (directPollRef.current) {
          clearInterval(directPollRef.current)
          directPollRef.current = null
        }
        setDirectTaskId(null)
        toast.error('Stock B-roll failed', {
          description: res.data?.error || 'Unknown error',
        })
      }
    }, 2000)

    return () => {
      if (directPollRef.current) {
        clearInterval(directPollRef.current)
        directPollRef.current = null
      }
    }
  }, [directTaskId, projectId])

  const handleGenerate = async (s: BrollSuggestion) => {
    if (!projectId) {
      toast.error('Project ID missing')
      return
    }
    setCardStatus((prev) => ({ ...prev, [s.id]: 'generating' }))
    setCardError((prev) => { const n = { ...prev }; delete n[s.id]; return n })

    const res = await api.post<{ status: string; task_id: string }>(
      `/projects/${projectId}/broll/generate`,
      {
        suggestion_id: s.id,
        prompt: s.broll_prompt,
        start_time: s.start_time,
        end_time: s.end_time,
        broll_reason: s.broll_reason,
      },
    )

    if (res.error) {
      setCardStatus((prev) => ({ ...prev, [s.id]: 'error' }))
      setCardError((prev) => ({ ...prev, [s.id]: res.error! }))
    }
  }

  const handleSearchStock = (s: BrollSuggestion) => {
    setStockSearchSuggestion(s.id)
  }

  const handleStockSelected = async (
    suggestionId: string,
    stockUrl: string,
    prompt: string,
  ) => {
    if (!projectId) return
    setStockSearchSuggestion(null)
    const s = suggestions.find((x) => x.id === suggestionId)
    if (!s) return

    setCardStatus((prev) => ({ ...prev, [suggestionId]: 'generating' }))
    setCardError((prev) => { const n = { ...prev }; delete n[suggestionId]; return n })

    const saved = await saveProjectTimeline(projectId, 'Pre-stock B-roll save')
    if (!saved.ok) {
      setCardStatus((prev) => ({ ...prev, [suggestionId]: 'error' }))
      setCardError((prev) => ({ ...prev, [suggestionId]: saved.error ?? 'Could not save timeline' }))
      return
    }

    const res = await api.post<{ status: string; task_id: string }>(
      `/projects/${projectId}/broll/use-stock`,
      {
        suggestion_id: suggestionId,
        stock_url: stockUrl,
        prompt,
        start_time: s.start_time,
        end_time: s.end_time,
        broll_reason: s.broll_reason,
      },
    )

    if (res.error) {
      setCardStatus((prev) => ({ ...prev, [suggestionId]: 'error' }))
      setCardError((prev) => ({ ...prev, [suggestionId]: res.error! }))
    }
  }

  const handleDirectStockSelected = async (
    _suggestionId: string | null,
    stockUrl: string,
    prompt: string,
  ) => {
    if (!projectId) return
    setDirectStockOpen(false)
    setDirectGenerating(true)

    const saved = await saveProjectTimeline(projectId, 'Pre-stock B-roll save')
    if (!saved.ok) {
      setDirectGenerating(false)
      toast.error('Could not save timeline', { description: saved.error ?? undefined })
      return
    }

    const playheadTime = useTimelineStore.getState().playheadTime
    const startTime = playheadTime
    const endTime = playheadTime + 4.0

    const res = await api.post<{ status: string; task_id: string }>(
      `/projects/${projectId}/broll/insert-stock`,
      {
        stock_url: stockUrl,
        prompt,
        start_time: startTime,
        end_time: endTime,
      },
    )

    setDirectGenerating(false)

    if (res.error) {
      toast.error('Failed to insert stock footage', { description: res.error })
      return
    }

    const taskId = res.data?.task_id
    if (!taskId) {
      toast.error('No task ID returned')
      return
    }

    toast.success('Stock B-roll queued', {
      description: 'Waiting for processing to complete...',
    })

    setDirectTaskId(taskId)
  }

  const handleApplyAll = async () => {
    if (!projectId || !assetId) return
    setBatchProcessing(true)

    const res = await api.post<{
      status: string
      total: number
      launched: number
      tasks: BatchTask[]
      message: string
    }>(`/projects/${projectId}/broll/batch-generate`, {
      suggestion_ids: [],
      strategy,
    })

    setBatchProcessing(false)

    if (res.error) {
      toast.error('Batch generation failed', { description: res.error })
      return
    }

    if (res.data && res.data.launched > 0) {
      for (const t of res.data.tasks) {
        setCardStatus((prev) => ({ ...prev, [t.suggestion_id]: 'generating' }))
      }
      toast.success(`Launched ${res.data.launched} B-roll task(s)`, {
        description: res.data.message,
      })
    } else {
      toast.message(res.data?.message || 'No suggestions to process')
    }
  }

  const handleFillDeadAir = async () => {
    if (!projectId) return
    setFillingDeadAir(true)

    const res = await api.post<{
      status: string
      total: number
      filled: number
      tasks: BatchTask[]
      message: string
    }>(`/projects/${projectId}/broll/fill-dead-air`, {
      max_suggestions: 10,
      strategy,
    })

    setFillingDeadAir(false)

    if (res.error) {
      toast.error('Dead-air fill failed', { description: res.error })
      return
    }

    if (res.data && res.data.filled > 0) {
      for (const t of res.data.tasks) {
        setCardStatus((prev) => ({ ...prev, [t.suggestion_id]: 'generating' }))
      }
      toast.success(`Filling ${res.data.filled} dead-air segment(s)`, {
        description: res.data.message,
      })
    } else {
      toast.message(res.data?.message || 'No dead air to fill')
    }
  }

  const handleSkip = (id: string) => {
    setSuggestions((prev) => prev.filter((x) => x.id !== id))
  }

  return (
    <>
      <div
        data-testid="ai-broll-panel"
        className="flex flex-col h-full min-h-0 bg-bg-surface border-l border-bg-overlay overflow-hidden"
      >
        <PanelTooltip
          panelKey="ai-broll"
          title="AI B-Roll"
          description="AI-suggested moments to insert B-roll footage. Generate images or search stock footage for each suggestion."
          placement="left"
        />
        <RightPanelHeader title="AI B-Roll" testId="ai-broll-panel-close" />

        <div className="px-4 py-2 border-b border-bg-overlay">
          <p className="text-xs text-text-secondary leading-relaxed">
            AI scanned your transcript and found moments where B-roll footage would enhance the video.
          </p>
        </div>

        {/* Batch action bar */}
        {!loading && suggestions.length > 0 && (
          <div className="flex-shrink-0 px-3 py-2 border-b border-bg-overlay space-y-1.5">
            {/* Strategy picker */}
            <div className="flex gap-1.5">
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="flex-1 px-2 py-1 rounded bg-bg-elevated border border-bg-overlay text-[11px] text-text-secondary outline-none focus:border-accent/50"
                aria-label="Generation strategy"
              >
                {STRATEGIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={handleApplyAll}
                disabled={batchProcessing || pendingCount === 0}
                className="flex-1 text-[11px] font-medium px-2 py-1.5 rounded bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {batchProcessing ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  `Apply All (${pendingCount})`
                )}
              </button>

              {deadAirCount > 0 && (
                <button
                  onClick={handleFillDeadAir}
                  disabled={fillingDeadAir}
                  className="text-[11px] font-medium px-2 py-1.5 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {fillingDeadAir ? 'Filling...' : `Fill Dead Air (${deadAirCount})`}
                </button>
              )}
              <button
                onClick={() => setDirectStockOpen(true)}
                disabled={directGenerating}
                className="text-[11px] font-medium px-2 py-1.5 rounded bg-bg-overlay text-text-secondary hover:text-text-primary hover:bg-bg-overlay/80 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Search Stock
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-text-disabled">
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Scanning transcript for B-roll moments...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12 px-4">
              <div className="w-10 h-10 rounded-full bg-status-error/10 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="text-status-error">
                  <path d="M9 1.5L16.5 15.5H1.5L9 1.5Z" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M9 6.5V10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                  <circle cx="9" cy="12.5" r="0.75" fill="currentColor" />
                </svg>
              </div>
              <p className="text-sm text-text-secondary font-medium">Could not load suggestions</p>
              <p className="text-xs text-text-disabled">{error}</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12 px-4">
              <div className="w-10 h-10 rounded-full bg-bg-overlay flex items-center justify-center text-text-disabled">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect x="2" y="3" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                  <path d="M7 7L11 9L7 11V7Z" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-text-secondary font-medium mb-1">No B-roll suggestions</p>
                <p className="text-xs text-text-disabled leading-relaxed">
                  The AI didn&apos;t find B-roll opportunities in the transcript, or the analysis hasn&apos;t run yet.
                </p>
                <button
                  onClick={async () => {
                    if (!assetId || !projectId) return
                    setLoading(true)
                    const res = await api.post<{ status: string; broll_count: number; message: string }>(
                      `/projects/${projectId}/broll/reanalyze`,
                      { asset_id: assetId },
                    )
                    if (res.error) {
                      toast.error(res.error)
                      setLoading(false)
                      return
                    }
                    const count = res.data?.broll_count ?? 0
                    if (count > 0) {
                      toast.success(`Found ${count} B-roll moment(s)`, {
                        description: 'Refresh suggestions below.',
                      })
                      await fetchSuggestions()
                      setLoading(false)
                    } else {
                      toast.message('No new B-roll opportunities found', {
                        description: res.data?.message ?? 'Try a different video or add B-roll manually.',
                      })
                      setLoading(false)
                    }
                  }}
                  className="mt-3 text-xs font-medium px-4 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
                >
                  Re-analyze for B-roll
                </button>
              </div>
              <div className="mt-4 pt-4 border-t border-bg-overlay w-full">
                <p className="text-[11px] text-text-disabled text-center mb-2">or search stock footage directly</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directSearchQuery}
                    onChange={(e) => setDirectSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setDirectStockOpen(true)}
                    placeholder="Describe B-roll you need..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-bg-elevated border border-bg-overlay text-xs text-text-primary placeholder:text-text-disabled outline-none focus:border-accent/50 transition-colors"
                  />
                  <button
                    onClick={() => setDirectStockOpen(true)}
                    disabled={!directSearchQuery.trim()}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Search
                  </button>
                </div>
              </div>
            </div>
          ) : (
            suggestions.map((s) => {
              const status = cardStatus[s.id] || 'idle'
              const errMsg = cardError[s.id]

              return (
                <div
                  key={s.id}
                  data-testid="broll-suggestion-card"
                  data-status={status}
                  className="rounded-lg border border-bg-overlay bg-bg-surface/50 p-3 space-y-2 hover:border-accent/30 transition-colors"
                >
                  {/* Header: time range + confidence */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-accent font-medium">
                      {formatTime(s.start_time)} – {formatTime(s.end_time)}
                    </span>
                    <span className="text-[11px] text-text-disabled">
                      {Math.round(s.confidence * 100)}%
                    </span>
                  </div>

                  {/* Reason badge */}
                  <div className="flex gap-1.5">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        REASON_COLORS[s.broll_reason] || 'bg-bg-overlay text-text-secondary'
                      }`}
                    >
                      {REASON_LABELS[s.broll_reason] || s.broll_reason}
                    </span>
                    {status === 'generated' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-status-success/10 text-status-success">
                        Generated ✓
                      </span>
                    )}
                    {status === 'generating' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent animate-pulse">
                        Generating...
                      </span>
                    )}
                  </div>

                  {/* B-roll prompt */}
                  <p className="text-xs text-text-primary leading-relaxed line-clamp-2">
                    {s.broll_prompt}
                  </p>

                  {/* Text excerpt */}
                  {s.text_excerpt && (
                    <p className="text-[11px] text-text-disabled italic line-clamp-1">
                      &ldquo;{s.text_excerpt}&rdquo;
                    </p>
                  )}

                  {/* Error message */}
                  {status === 'error' && errMsg && (
                    <p className="text-[11px] text-status-error line-clamp-2">{errMsg}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-1">
                    {status === 'generated' ? (
                      <>
                        <span className="flex-1 text-[11px] font-medium px-2 py-1 rounded bg-status-success/10 text-status-success text-center">
                          ✓ Added to timeline
                        </span>
                        {s.generated_asset_url && (
                          <a
                            href={s.generated_asset_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium px-2 py-1 rounded bg-bg-overlay text-text-secondary hover:text-text-primary hover:bg-bg-overlay/80 transition-colors"
                          >
                            Preview
                          </a>
                        )}
                      </>
                    ) : status === 'generating' ? (
                      <span className="flex-1 text-[11px] font-medium px-2 py-1 rounded bg-accent/10 text-accent text-center flex items-center justify-center gap-1.5">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Working...
                      </span>
                    ) : (
                      <>
                        <button
                          data-testid="broll-generate-btn"
                          onClick={() => handleGenerate(s)}
                          className="flex-1 text-[11px] font-medium px-2 py-1 rounded bg-accent text-white hover:bg-accent/90 transition-colors"
                        >
                          Generate
                        </button>
                        <button
                          data-testid="broll-stock-btn"
                          onClick={() => handleSearchStock(s)}
                          className="flex-1 text-[11px] font-medium px-2 py-1 rounded bg-bg-overlay text-text-secondary hover:text-text-primary hover:bg-bg-overlay/80 transition-colors"
                        >
                          Search Stock
                        </button>
                        <button
                          data-testid="broll-skip-btn"
                          onClick={() => handleSkip(s.id)}
                          className="flex-1 text-[11px] font-medium px-2 py-1 rounded text-text-disabled hover:text-text-secondary hover:bg-bg-overlay transition-colors"
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer summary */}
        {!loading && suggestions.length > 0 && (
          <div className="flex-shrink-0 px-4 py-2 border-t border-bg-overlay">
            <p className="text-[11px] text-text-disabled text-center">
              {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
              {hasGenerating ? ` · ${Object.values(cardStatus).filter(s => s === 'generating').length} generating` : ''}
              {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
            </p>
          </div>
        )}
      </div>

      {/* Stock search modal — from suggestion card */}
      {stockSearchSuggestion && (
        <BrollStockSearch
          suggestionId={stockSearchSuggestion}
          initialQuery={
            suggestions.find((s) => s.id === stockSearchSuggestion)?.broll_prompt || ''
          }
          projectId={projectId || ''}
          onSelect={handleStockSelected}
          onClose={() => setStockSearchSuggestion(null)}
        />
      )}

      {/* Stock search modal — direct insert (no suggestion) */}
      {directStockOpen && (
        <BrollStockSearch
          suggestionId={null}
          initialQuery={directSearchQuery}
          projectId={projectId || ''}
          onSelect={handleDirectStockSelected}
          onClose={() => setDirectStockOpen(false)}
        />
      )}
    </>
  )
}
