'use client'

/**
 * HighlightsTab — promo-style clips with per-platform aspect previews.
 */

import { useCallback, useState } from 'react'
import { useHighlightsStore, type HighlightPlatform } from '@/stores/highlightsStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useAssetStore } from '@/stores/assetStore'
import { RegeneratePromptDialog } from '@/components/editor/RegeneratePromptDialog'
import { api } from '@/lib/api'
import { downloadShort, exportShortVideo } from '@/lib/shortsExport'
import { SizzleGenerator } from '@/components/sizzle/SizzleGenerator'

const PLATFORM_LABELS: Record<HighlightPlatform, string> = {
  youtube: 'YouTube 16:9',
  tiktok: 'TikTok 9:16',
  reels: 'Reels 9:16',
  instagram_feed: 'Instagram 4:5',
  linkedin: 'LinkedIn 1:1',
}

function formatRange(start: number, end: number): string {
  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const ss = Math.floor(s % 60)
    return `${m}:${String(ss).padStart(2, '0')}`
  }
  return `${fmt(start)} – ${fmt(end)}`
}

interface HighlightsTabProps {
  projectId?: string
}

export function HighlightsTab({ projectId }: HighlightsTabProps) {
  const { highlights, selectedPlatform, setSelectedPlatform } = useHighlightsStore()
  const asset = useAssetStore((s) => s.asset)
  const videoUrl = useAssetStore((s) => s.asset?.videoUrl ?? null)
  const { previewShort } = usePlayerStore()
  const { setPlayheadTime } = useTimelineStore()
  const [promptOpen, setPromptOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [exportPct, setExportPct] = useState<number>(0)
  const [exportError, setExportError] = useState<string | null>(null)

  const filtered =
    selectedPlatform === 'all'
      ? highlights
      : highlights.filter((h) =>
          h.platformPacks.some((p) => p.platform === selectedPlatform),
        )

  const handlePlay = useCallback(
    (start: number, end: number) => {
      setPlayheadTime(start)
      if (videoUrl) previewShort(start, end)
      else usePlayerStore.getState().seek(start)
    },
    [previewShort, setPlayheadTime, videoUrl],
  )

  const runRegenerate = useCallback(
    async (typed: string, userPrompt: string) => {
      if (!projectId || !asset?.id) return
      setLoading(true)
      const res = await api.post(
        `/projects/${projectId}/assets/${asset.id}/regenerate`,
        {
          scope: 'highlights',
          user_prompt: userPrompt,
          confirmation: typed,
        },
      )
      setLoading(false)
      if (!res.error) setPromptOpen(false)
    },
    [projectId, asset?.id],
  )

  const aspectFor = (h: (typeof highlights)[0]) => {
    if (selectedPlatform === 'all') return '16:9'
    const pack = h.platformPacks.find((p) => p.platform === selectedPlatform)
    return pack?.aspect_ratio ?? '16:9'
  }

  const exportPlatform =
    selectedPlatform === 'tiktok'
      ? 'tiktok'
      : selectedPlatform === 'reels' || selectedPlatform === 'instagram_feed'
        ? 'instagram_reels'
        : 'youtube_shorts'

  const handleDownloadAll = useCallback(async () => {
    if (!projectId || !asset?.id || filtered.length === 0) return
    setExportError(null)
    setExportingAll(true)
    setExportPct(0)

    const ordered = [...filtered].sort((a, b) => a.startTime - b.startTime)
    const startTime = ordered[0].startTime
    const endTime = ordered[ordered.length - 1].endTime
    const segments = ordered.map((h) => ({
      start_time: h.startTime,
      end_time: h.endTime,
    }))

    const res = await exportShortVideo(
      projectId,
      asset.id,
      startTime,
      endTime,
      exportPlatform,
      `Promo Reel (${ordered.length} clips)`,
      (pct) => setExportPct(Math.max(0, Math.min(100, Math.round(pct)))),
      0.5,
      undefined,
      undefined,
      segments,
    )

    setExportingAll(false)
    setExportPct(0)
    if (res.error) {
      setExportError(res.error)
      return
    }
    if (res.downloadUrl) {
      downloadShort(res.downloadUrl, 'promo_reel_compiled')
    }
  }, [projectId, asset?.id, filtered, exportPlatform])

  return (
    <div data-testid="highlights-panel" className="flex flex-col h-full overflow-y-auto">
      <RegeneratePromptDialog
        open={promptOpen}
        title="Regenerate highlights"
        description="Describe what promo moment you want (topic, emotion, guest name)."
        confirmPhrase="regenerate"
        confirmButtonLabel="Regenerate highlights"
        loading={loading}
        onClose={() => setPromptOpen(false)}
        onConfirm={runRegenerate}
      />

      {projectId && asset?.storageKey && (
        <SizzleGenerator projectId={projectId} videoKey={asset.storageKey} />
      )}

      <div className="px-3 py-2 border-b border-bg-overlay space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-text-disabled">
            {highlights.length} highlight{highlights.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-1.5">
            {projectId && asset?.id && filtered.length > 0 && (
              <button
                type="button"
                data-testid="download-all-highlights-btn"
                onClick={() => void handleDownloadAll()}
                disabled={exportingAll}
                className="px-2 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
                title="Download one compiled promo reel"
              >
                {exportingAll ? `Compiling ${exportPct}%` : 'Download compiled video'}
              </button>
            )}
            {projectId && asset?.id && (
              <button
                type="button"
                data-testid="regenerate-highlights-btn"
                className="px-2 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent/10"
                onClick={() => setPromptOpen(true)}
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-text-disabled leading-snug">
          Promo-style sizzle clips for trailers and social. Pick a platform to preview aspect ratio.
        </p>
        <div className="flex flex-wrap gap-1">
          <FilterChip
            active={selectedPlatform === 'all'}
            label="All"
            onClick={() => setSelectedPlatform('all')}
          />
          {(Object.keys(PLATFORM_LABELS) as HighlightPlatform[]).map((p) => (
            <FilterChip
              key={p}
              active={selectedPlatform === p}
              label={PLATFORM_LABELS[p].split(' ')[0]}
              onClick={() => setSelectedPlatform(p)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1 p-2">
        {exportError && (
          <p className="text-[11px] text-status-error px-2">{exportError}</p>
        )}
        {filtered.length === 0 && (
          <p className="text-xs text-text-disabled px-2 py-4">
            No highlights yet. Run chapter analysis on a podcast upload.
          </p>
        )}
        {filtered.map((h) => (
          <button
            key={h.id}
            type="button"
            data-testid={`highlight-item-${h.id}`}
            onClick={() => handlePlay(h.startTime, h.endTime)}
            className="w-full text-left p-2 rounded-lg border border-transparent hover:border-bg-overlay hover:bg-bg-overlay transition-all"
          >
            <div className="flex gap-2">
              <div
                className="flex-shrink-0 rounded overflow-hidden bg-bg-overlay flex items-center justify-center text-[10px] text-text-disabled"
                style={{
                  width: aspectFor(h).startsWith('9') ? 36 : 56,
                  height: aspectFor(h).startsWith('9') ? 64 : 32,
                  backgroundImage: h.thumbnailUrl ? `url(${h.thumbnailUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {!h.thumbnailUrl && '▶'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary line-clamp-1">{h.title}</p>
                <p className="text-[10px] text-text-disabled">{formatRange(h.startTime, h.endTime)}</p>
                <p className="text-[10px] text-text-secondary line-clamp-2 mt-0.5">{h.promoCopyEn || h.summary}</p>
                <p className="text-[10px] text-accent mt-1">{aspectFor(h)} preview</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2 py-0.5 rounded text-[10px] font-medium',
        active ? 'bg-accent/20 text-accent' : 'text-text-disabled hover:bg-bg-overlay',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
