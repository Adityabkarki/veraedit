'use client'

/**
 * ShortsTab — left panel content for the "Shorts" tab.
 *
 * Shows a grid of viral short candidates:
 *   – Platform filter tabs: All | YouTube | Facebook | TikTok | Instagram
 *   – Each short card: thumbnail, title, duration, virality score ring,
 *     hook text (editable inline), platform score chips
 *
 * Clicking a short seeks the player to its startTime.
 * Nepal platform priority: YouTube › Facebook › TikTok › Instagram
 */

import { useCallback, useState } from 'react'
import { RegenerateConfirmDialog } from '@/components/editor/RegenerateConfirmDialog'
import type { RegenerateErrorDetail } from '@/lib/pipelineApi'
import { usePipelineRegenerate } from '@/lib/usePipelineRegenerate'
import {
  useShortsStore,
  PLATFORM_ORDER,
  PLATFORM_LABELS,
  type Platform,
} from '@/stores/shortsStore'
import { usePlayerStore }    from '@/stores/playerStore'
import { useTimelineStore }  from '@/stores/timelineStore'
import { exportShortVideo, downloadShort } from '@/lib/shortsExport'
import { stylingToExport } from '@/lib/shortStyling'
import { useAssetStore } from '@/stores/assetStore'
import type { Short } from '@/stores/shortsStore'

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function ViralityRing({ score }: { score: number }) {
  const r       = 14
  const circ    = 2 * Math.PI * r
  const offset  = circ * (1 - score / 100)
  const color   = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444'

  return (
    <div
      data-testid="virality-ring"
      className="relative w-10 h-10 flex-shrink-0"
      title={`Virality: ${score}%`}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        {/* Background ring */}
        <circle cx="20" cy="20" r={r} fill="none" stroke="#2a2a2e" strokeWidth="3"/>
        {/* Progress ring */}
        <circle
          cx="20" cy="20" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  )
}

export function ShortsTab({ projectId }: { projectId?: string }) {
  const {
    activePlatform,
    setActivePlatform,
    filteredShorts,
  } = useShortsStore()

  const { previewShort } = usePlayerStore()
  const { setPlayheadTime } = useTimelineStore()
  const asset = useAssetStore((s) => s.asset)
  const assetId = asset?.id ?? null
  const videoUrl = asset?.videoUrl ?? null
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportPct, setExportPct] = useState<number>(0)
  const [exportError, setExportError] = useState<string | null>(null)
  const { loading: pipelineLoading, loadCosts, runShorts } = usePipelineRegenerate(
    projectId,
    assetId ?? undefined,
  )
  const [shortsDialogOpen, setShortsDialogOpen] = useState(false)
  const [shortsConfirmMeta, setShortsConfirmMeta] = useState<RegenerateErrorDetail | null>(null)

  const handleRegenerateShorts = useCallback(async () => {
    const c = await loadCosts()
    if (c?.shorts.exists) {
      setShortsConfirmMeta({
        message: 'Shorts already exist. Type "regenerate shorts" to replace them.',
        requires_confirmation: true,
        confirmation_phrase: c.confirmations.shorts,
        estimated_cost_usd: c.costs_usd.shorts_regeneration,
        estimated_cost_label: 'Free (rule-based shorts engine, no API cost)',
      })
      setShortsDialogOpen(true)
      return
    }
    const r = await runShorts()
    if (r.needsConfirm && r.detail) {
      setShortsConfirmMeta(r.detail)
      setShortsDialogOpen(true)
    }
  }, [loadCosts, runShorts])

  const shorts = filteredShorts()

  const handleShortClick = useCallback(
    (startTime: number, endTime: number) => {
      if (!videoUrl) {
        setExportError('Video is still loading. Wait a moment and try again.')
        return
      }
      setExportError(null)
      setPlayheadTime(startTime)
      previewShort(startTime, endTime)
    },
    [previewShort, setPlayheadTime, videoUrl],
  )

  const handleExport = useCallback(
    async (short: Short) => {
      if (!projectId || !assetId) {
        setExportError('Upload a video before exporting shorts.')
        return
      }
      setExportingId(short.id)
      setExportPct(0)
      setExportError(null)
      const platform =
        activePlatform === 'tiktok' ? 'tiktok'
        : activePlatform === 'instagram' ? 'instagram_reels'
        : 'youtube_shorts'
      const res = await exportShortVideo(
        projectId,
        assetId,
        short.startTime,
        short.endTime,
        platform,
        short.title,
        (pct) => setExportPct(Math.max(0, Math.min(100, Math.round(pct)))),
        short.framing.panX,
        short.framing.reframeStrategy,
        stylingToExport(short.styling),
      )
      setExportingId(null)
      setExportPct(0)
      if (res.error) {
        setExportError(res.error)
        return
      }
      if (res.downloadUrl) downloadShort(res.downloadUrl, short.title)
    },
    [projectId, assetId, activePlatform],
  )

  const canRunShorts =
    projectId &&
    assetId &&
    asset?.status !== 'transcribing' &&
    asset?.status !== 'uploading'

  return (
    <div data-testid="shorts-tab" className="flex flex-col h-full overflow-hidden">
      <RegenerateConfirmDialog
        open={shortsDialogOpen}
        title="Regenerate shorts"
        description="Replaces short-clip candidates. Requires chapters already generated. No API cost (rule-based engine)."
        costLabel={
          shortsConfirmMeta?.estimated_cost_label ?? 'Free (no API cost)'
        }
        confirmPhrase={shortsConfirmMeta?.confirmation_phrase ?? 'regenerate shorts'}
        confirmButtonLabel="Regenerate shorts"
        loading={pipelineLoading}
        onClose={() => setShortsDialogOpen(false)}
        onConfirm={async (typed) => {
          const r = await runShorts(typed)
          if (r.ok) setShortsDialogOpen(false)
        }}
      />
      {/* Platform filter tabs */}
      <div className="px-2 py-2 border-b border-bg-overlay flex-shrink-0">
        <div
          role="tablist"
          aria-label="Platform filter"
          className="flex gap-1 flex-wrap"
        >
          <button
            role="tab"
            aria-selected={activePlatform === 'all'}
            data-testid="shorts-platform-all"
            onClick={() => setActivePlatform('all')}
            className={[
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              activePlatform === 'all'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
            ].join(' ')}
          >
            All
          </button>
          {PLATFORM_ORDER.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={activePlatform === p}
              data-testid={`shorts-platform-${p}`}
              onClick={() => setActivePlatform(p)}
              className={[
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                activePlatform === p
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
              ].join(' ')}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Header stats */}
      <div className="px-3 py-1.5 border-b border-bg-overlay flex-shrink-0 flex items-center justify-between gap-2">
        <p className="text-xs text-text-disabled">
          {shorts.length} short{shorts.length !== 1 ? 's' : ''} found
          {activePlatform !== 'all' && (
            <span className="text-accent ml-1">
              · sorted by {PLATFORM_LABELS[activePlatform as Platform]} score
            </span>
          )}
        </p>
        {canRunShorts && (
          <button
            type="button"
            data-testid="regenerate-shorts-btn"
            disabled={pipelineLoading || asset?.status === 'analyzing'}
            onClick={() => void handleRegenerateShorts()}
            className="px-2 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50 shrink-0"
          >
            {shorts.length > 0 ? '↻ Regenerate' : 'Extract shorts'}
          </button>
        )}
      </div>

      {/* Shorts list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {exportError && (
          <p className="text-xs text-status-error px-2" data-testid="shorts-export-error">{exportError}</p>
        )}
        {shorts.map((short) => (
          <div
            key={short.id}
            data-testid={`short-card-${short.id}`}
            className="rounded-lg border border-bg-overlay hover:border-accent/30 bg-bg-elevated transition-all overflow-hidden"
          >
            {/* Thumbnail row */}
            <button
              className="w-full flex items-center gap-2 p-2 hover:bg-bg-overlay/50 transition-colors"
              onClick={() => handleShortClick(short.startTime, short.endTime)}
              aria-label={`Preview: ${short.title}`}
            >
              {/* Thumbnail */}
              <div
                className="w-16 h-10 rounded flex-shrink-0 flex items-center justify-center text-white/50 text-xs font-mono"
                style={{ background: short.thumbnailColor }}
                aria-hidden="true"
              >
                ▶
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-medium text-text-primary truncate">{short.title}</p>
                <p className="text-[10px] text-text-disabled">
                  {formatDuration(short.duration)}
                  {' · '}
                  {String(Math.floor(short.startTime / 60)).padStart(2, '0')}:
                  {String(Math.floor(short.startTime % 60)).padStart(2, '0')}
                  {' – '}
                  {String(Math.floor(short.endTime / 60)).padStart(2, '0')}:
                  {String(Math.floor(short.endTime % 60)).padStart(2, '0')}
                </p>
              </div>

              {/* Virality ring */}
              <ViralityRing score={short.viralityScore} />
            </button>

            {/* Hook preview */}
            <div className="px-3 py-2 border-t border-bg-overlay/50">
              <p className="text-[10px] text-text-disabled mb-0.5">Hook</p>
              <p
                data-testid={`short-hook-${short.id}`}
                className="text-xs text-text-secondary italic leading-snug line-clamp-2"
              >
                {short.activeHook}
              </p>
            </div>

            {/* Platform scores */}
            <div className="px-3 py-2 border-t border-bg-overlay/50 flex items-center gap-3">
              {PLATFORM_ORDER.map((p) => (
                <div key={p} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-text-disabled">{PLATFORM_LABELS[p].slice(0, 2)}</span>
                  <span
                    data-testid={`short-score-${short.id}-${p}`}
                    className="text-[11px] font-semibold"
                    style={{
                      color: short.platformScores[p] >= 80 ? '#22C55E'
                           : short.platformScores[p] >= 60 ? '#F59E0B'
                           : '#EF4444',
                    }}
                  >
                    {short.platformScores[p]}
                  </span>
                </div>
              ))}

              <div className="flex-1" />

              <button
                type="button"
                data-testid={`short-play-${short.id}`}
                onClick={() => handleShortClick(short.startTime, short.endTime)}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors"
              >
                Play
              </button>

              <button
                type="button"
                data-testid={`short-export-${short.id}`}
                disabled={exportingId === short.id}
                onClick={(e) => {
                  e.stopPropagation()
                  void handleExport(short)
                }}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-status-success/10 text-status-success hover:bg-status-success/20 transition-colors disabled:opacity-50"
              >
                {exportingId === short.id ? `Exporting ${exportPct}%` : 'Export'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
