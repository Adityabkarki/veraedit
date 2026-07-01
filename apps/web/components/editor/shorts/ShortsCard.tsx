'use client'

/**
 * ShortsCard — full card in the Shorts Mode grid.
 *
 * Contains:
 *   – 9:16 in-card video preview (plays exact short segment on click)
 *   – Hover on ring → ViralityBreakdown popover
 *   – Title, duration, timestamp
 *   – Platform score chips (Nepal priority order)
 *   – HookSelector (collapsed by default, expanded on "Change hook" click)
 *   – Export (re-export allowed any number of times)
 *   – Selection checkbox for bulk operations
 */

import { useState, useCallback } from 'react'
import { useShortsStore, PLATFORM_ORDER, PLATFORM_LABELS } from '@/stores/shortsStore'
import { useAssetStore }     from '@/stores/assetStore'
import { exportShortVideo, downloadShort } from '@/lib/shortsExport'
import { ViralityBreakdown } from '@/components/editor/shorts/ViralityBreakdown'
import { HookSelector }      from '@/components/editor/shorts/HookSelector'
import { ShortCardVideoPreview } from '@/components/editor/shorts/ShortCardVideoPreview'
import { ShortFramingControls } from '@/components/editor/shorts/ShortFramingControls'
import { ShortEnhancePanel } from '@/components/editor/shorts/ShortEnhancePanel'
import { stylingToExport } from '@/lib/shortStyling'
import type { Short, Platform } from '@/stores/shortsStore'

interface ShortsCardProps {
  short:      Short
  projectId?: string
  isSelected: boolean
}

function formatTime(s: number): string {
  const m  = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function PlatformScore({ platform, score }: { platform: Platform; score: number }) {
  const color = score >= 80 ? 'text-status-success' : score >= 65 ? 'text-status-warning' : 'text-status-error'
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1">
      <span className="text-[9px] text-text-disabled">{PLATFORM_LABELS[platform].slice(0, 2)}</span>
      <span data-testid={`score-${platform}`} className={`text-xs font-bold ${color}`}>{score}</span>
    </div>
  )
}

export function ShortsCard({ short, projectId, isSelected }: ShortsCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showHooks,     setShowHooks]     = useState(false)
  const [showEnhance,   setShowEnhance]   = useState(false)
  const [exporting,     setExporting]     = useState(false)
  const [exportError,   setExportError]   = useState<string | null>(null)

  const { approveShort, toggleShortSelection, activePlatform } = useShortsStore()
  const assetId = useAssetStore((s) => s.asset?.id ?? null)
  const videoUrl = useAssetStore((s) => s.asset?.videoUrl ?? null)

  const handlePreviewError = useCallback((message: string) => {
    setExportError(message)
  }, [])

  const handleExport = useCallback(async () => {
    if (!projectId || !assetId) {
      setExportError('Upload a video before exporting shorts.')
      return
    }
    setExporting(true)
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
      undefined,
      short.framing.panX,
      short.framing.reframeStrategy,
      stylingToExport(short.styling),
      short.segments?.map((s) => ({ start_time: s.startTime, end_time: s.endTime })),
    )
    setExporting(false)
    if (res.error) {
      setExportError(res.error)
      return
    }
    if (res.downloadUrl) {
      const dl = await downloadShort(
        res.downloadUrl,
        short.title,
        projectId,
        res.renderId ?? undefined,
      )
      if (!dl.ok) setExportError(dl.error)
    }
  }, [projectId, assetId, activePlatform, short])

  const score = short.viralityScore
  const scoreColor = score >= 80 ? '#22C55E' : score >= 65 ? '#F59E0B' : '#EF4444'
  const r     = 20
  const circ  = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)

  return (
    <div
      data-testid={`shorts-card-${short.id}`}
      className={[
        'flex flex-col rounded-xl border overflow-hidden transition-all',
        isSelected
          ? 'border-accent shadow-lg shadow-accent/10'
          : 'border-bg-overlay hover:border-bg-elevated',
        'bg-bg-surface',
      ].join(' ')}
    >
      {/* ── In-card video preview (9:16) ───────────────────────────────────── */}
      <div className="relative">
        <ShortCardVideoPreview
          shortId={short.id}
          videoUrl={videoUrl}
          startTime={short.startTime}
          endTime={short.endTime}
          duration={short.duration}
          placeholderColor={short.thumbnailColor}
          framing={short.framing}
          styling={short.styling}
          segments={short.segments}
          onLoadError={handlePreviewError}
        />

        {short.segmentCount && short.segmentCount > 1 && (
          <div
            className="absolute top-2 left-2 z-10 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white font-medium"
            data-testid={`compiled-badge-${short.id}`}
          >
            Compiled from {short.segmentCount} moments
          </div>
        )}

        {/* Virality ring — top right (over preview) */}
        <div
          className="absolute top-2 right-2 z-10 cursor-pointer"
          onMouseEnter={() => setShowBreakdown(true)}
          onMouseLeave={() => setShowBreakdown(false)}
          data-testid={`virality-ring-${short.id}`}
        >
          <div className="relative w-12 h-12">
            <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r={r} fill="rgba(0,0,0,0.6)" stroke="#333" strokeWidth="3"/>
              <circle
                cx="24" cy="24" r={r}
                fill="none"
                stroke={scoreColor}
                strokeWidth="3"
                strokeDasharray={circ}
                strokeDashoffset={offset}
                strokeLinecap="round"
                transform="rotate(-90 24 24)"
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white"
            >
              {score}
            </span>
          </div>

          {showBreakdown && (
            <div className="relative">
              <ViralityBreakdown short={short} />
            </div>
          )}
        </div>

        {/* Selection checkbox */}
        <button
          data-testid={`select-short-${short.id}`}
          onClick={(e) => { e.stopPropagation(); toggleShortSelection(short.id) }}
          aria-label={isSelected ? 'Deselect' : 'Select'}
          aria-pressed={isSelected}
          className="absolute top-2 left-2 z-10 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors"
          style={{
            background:   isSelected ? '#C41E3A' : 'rgba(0,0,0,0.5)',
            borderColor:  isSelected ? '#C41E3A' : 'rgba(255,255,255,0.5)',
          }}
        >
          {isSelected && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Card body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 p-3">
        {/* Title + timestamp */}
        <div>
          <p className="text-sm font-semibold text-text-primary leading-snug mb-0.5">
            {short.title}
          </p>
          <p className="text-[11px] font-mono text-text-disabled">
            {formatTime(short.startTime)} – {formatTime(short.endTime)}
          </p>
        </div>

        {/* Platform scores */}
        <div
          data-testid={`platform-scores-${short.id}`}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-bg-elevated"
        >
          {PLATFORM_ORDER.map((p) => (
            <PlatformScore key={p} platform={p} score={short.platformScores[p]} />
          ))}
        </div>

        <ShortFramingControls short={short} />

        <button
          type="button"
          data-testid={`short-enhance-toggle-${short.id}`}
          onClick={() => setShowEnhance((v) => !v)}
          className="w-full py-1 rounded-lg text-[10px] font-medium bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors"
        >
          {showEnhance ? '▲ Hide styling' : '▼ Brand, templates & effects'}
        </button>

        {showEnhance && <ShortEnhancePanel short={short} projectId={projectId} />}

        {/* Active hook preview */}
        <div className="px-2 py-1.5 rounded-lg bg-bg-elevated">
          <p className="text-[10px] text-text-disabled mb-0.5">Hook</p>
          <p
            data-testid={`active-hook-${short.id}`}
            className="text-xs text-text-secondary italic leading-snug line-clamp-2"
          >
            {short.activeHook}
          </p>
          <button
            data-testid={`change-hook-${short.id}`}
            onClick={() => setShowHooks((v) => !v)}
            className="mt-1 text-[10px] text-accent hover:text-accent-glow transition-colors"
          >
            {showHooks ? '▲ Close' : '▼ Change hook'}
          </button>
        </div>

        {/* Hook selector (expanded) */}
        {showHooks && (
          <div className="border-t border-bg-overlay pt-2">
            <HookSelector short={short} onClose={() => setShowHooks(false)} />
          </div>
        )}

        {exportError && (
          <p className="text-[10px] text-status-error" data-testid={`short-export-error-${short.id}`}>
            {exportError}
          </p>
        )}

        {/* Action row */}
        <div className="flex items-center gap-1.5 mt-1">
          {short.status === 'pending' && (
            <button
              data-testid={`approve-short-${short.id}`}
              onClick={() => approveShort(short.id)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            >
              ✓ Approve
            </button>
          )}

          <button
            data-testid={`export-short-${short.id}`}
            onClick={() => void handleExport()}
            disabled={exporting}
            className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-bg-overlay text-text-secondary hover:text-text-primary hover:border-text-disabled transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <span className="flex items-center justify-center gap-1">
                <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                Exporting
              </span>
            ) : (
              '↓ Export'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
