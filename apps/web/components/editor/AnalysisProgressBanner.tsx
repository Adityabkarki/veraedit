'use client'

/**
 * AnalysisProgressBanner — compact single-line pipeline status during upload → ready.
 */

import { useState } from 'react'
import { useAssetStore, type AssetStatus } from '@/stores/assetStore'
import { useEditorPipelinePoll, shouldPollAssetStatus } from '@/hooks/useEditorPipelinePoll'
import { RegenerateConfirmDialog } from '@/components/editor/RegenerateConfirmDialog'
import { usePipelineRegenerate } from '@/lib/usePipelineRegenerate'
import type { RegenerateErrorDetail } from '@/lib/pipelineApi'

const STEPS = [
  { key: 'uploaded', label: 'Uploaded' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'analyzing', label: 'Finding chapters' },
] as const

function computeStepStates(
  status: AssetStatus,
  transcriptReady: boolean,
): { done: boolean; active: boolean }[] {
  if (status === 'error') {
    return STEPS.map(() => ({ done: false, active: false }))
  }

  const uploadedDone = status !== 'uploading' && status !== 'uploaded'
  const transcribeDone =
    transcriptReady || status === 'analyzing' || status === 'ready'
  const analyzeDone = status === 'ready'
  const transcribeActive = status === 'transcribing' && !transcribeDone
  const analyzeActive = status === 'analyzing'

  return [
    { done: uploadedDone, active: status === 'uploaded' || status === 'uploading' },
    { done: transcribeDone, active: transcribeActive },
    { done: analyzeDone, active: analyzeActive },
  ]
}

function activeStepLabel(states: { done: boolean; active: boolean }[]): string {
  const active = STEPS.find((_, i) => states[i].active)
  if (active) return active.label
  const next = STEPS.find((_, i) => !states[i].done)
  return next?.label ?? 'Finishing'
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

interface AnalysisProgressBannerProps {
  projectId: string
}

export function AnalysisProgressBanner({ projectId }: AnalysisProgressBannerProps) {
  const asset = useAssetStore((s) => s.asset)
  const polling = asset && shouldPollAssetStatus(asset.status)
  const poll = useEditorPipelinePoll(polling ? projectId : '')
  const { loading: retryLoading, loadCosts, runChapters } = usePipelineRegenerate(
    projectId,
    asset?.id,
  )
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMeta, setConfirmMeta] = useState<RegenerateErrorDetail | null>(null)

  const handleRetryChapters = async () => {
    const c = await loadCosts()
    if (c?.chapters.exists) {
      setConfirmMeta({
        message:
          'Chapters already exist. Type "regenerate chapters" to replace them.',
        requires_confirmation: true,
        confirmation_phrase: c.confirmations.chapters,
        estimated_cost_usd: c.costs_usd.chapters_analysis,
        estimated_cost_label: `~$${c.costs_usd.chapters_analysis.toFixed(2)} OpenAI (chapter detection + edit suggestions)`,
      })
      setConfirmOpen(true)
      return
    }
    await runChapters()
  }

  if (!asset || asset.status === 'ready') return null

  const isError = asset.status === 'error' || poll.phase === 'error'
  const transcriptReady = poll.transcriptReady
  const stepStates = computeStepStates(asset.status, transcriptReady)
  const detail =
    asset.errorMessage ?? poll.errorMessage ?? poll.detailMessage ?? null
  const progress = Math.max(0, Math.min(100, Math.round(poll.progressPercent)))
  const step = activeStepLabel(stepStates)

  if (!isError && !polling && asset.status !== 'uploading') return null

  if (isError) {
    return (
      <div
        data-testid="analysis-progress-banner"
        className="flex-shrink-0 h-9 flex items-center gap-3 px-4 border-b border-status-error/40 bg-status-error/10 text-[11px]"
        role="alert"
      >
        <span className="font-semibold text-status-error shrink-0">Processing failed</span>
        {detail && (
          <span className="flex-1 min-w-0 truncate text-status-error/90" title={detail}>
            {detail}
          </span>
        )}
        {projectId && asset?.id && asset.status === 'error' && (
          <>
            <RegenerateConfirmDialog
              open={confirmOpen}
              title="Retry chapter analysis"
              description="Re-runs chapter detection and edit suggestions (OpenAI, not ElevenLabs)."
              costLabel={
                confirmMeta?.estimated_cost_label ??
                '~$0.02 OpenAI (chapter detection + suggestions)'
              }
              confirmPhrase={confirmMeta?.confirmation_phrase ?? 'regenerate chapters'}
              confirmButtonLabel="Retry chapters"
              loading={retryLoading}
              onClose={() => setConfirmOpen(false)}
              onConfirm={async (typed) => {
                const r = await runChapters(typed)
                if (r.ok) setConfirmOpen(false)
              }}
            />
            <button
              type="button"
              data-testid="retry-chapters-btn"
              disabled={retryLoading}
              onClick={() => void handleRetryChapters()}
              className="shrink-0 px-2 py-0.5 rounded text-[10px] font-medium bg-accent/20 text-accent hover:bg-accent/30 disabled:opacity-50"
            >
              {retryLoading ? 'Starting…' : 'Retry'}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      data-testid="analysis-progress-banner"
      className="flex-shrink-0 h-9 flex items-center gap-2.5 px-3 border-b border-accent/25 bg-accent/5 text-[11px]"
      role="status"
      aria-live="polite"
      title={detail ?? undefined}
    >
      <span className="shrink-0 font-semibold text-accent">AI editing</span>

      <div className="flex-1 min-w-[80px] max-w-[140px] h-1 rounded-full bg-bg-overlay overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${Math.max(2, progress)}%` }}
        />
      </div>

      <span className="shrink-0 tabular-nums font-semibold text-accent w-8 text-right">
        {progress}%
      </span>

      <span className="flex-1 min-w-0 truncate text-text-secondary">
        {step}
        {detail ? ` · ${detail}` : ''}
      </span>

      {poll.elapsedMs > 0 && (
        <span className="shrink-0 tabular-nums text-text-disabled">
          {formatElapsed(poll.elapsedMs)}
        </span>
      )}
    </div>
  )
}
