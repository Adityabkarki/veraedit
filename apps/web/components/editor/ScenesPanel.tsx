'use client'

/**
 * Chapters panel — large story segments (hook, problem, solution, CTA…).
 */

import { useCallback, useState } from 'react'
import { useScenesStore, INTENT_META } from '@/stores/scenesStore'
import { usePlayerStore }              from '@/stores/playerStore'
import { useTimelineStore }            from '@/stores/timelineStore'
import { useAssetStore }               from '@/stores/assetStore'
import { RegenerateConfirmDialog } from '@/components/editor/RegenerateConfirmDialog'
import { usePipelineRegenerate } from '@/lib/usePipelineRegenerate'
import type { RegenerateErrorDetail } from '@/lib/pipelineApi'
import { downloadShort, exportShortVideo } from '@/lib/shortsExport'
import { ChapterExtractor } from '@/components/chapters/ChapterExtractor'

function formatRange(start: number, end: number): string {
  const fmt = (s: number) => {
    const m  = Math.floor(s / 60)
    const ss = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  }
  const dur  = end - start
  const mins = Math.floor(dur / 60)
  const secs = Math.floor(dur % 60)
  const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  return `${fmt(start)} – ${fmt(end)}  (${durStr})`
}

export function ScenesPanel({ projectId }: { projectId?: string }) {
  const { scenes, selectedSceneId, selectScene } = useScenesStore()
  const asset = useAssetStore((s) => s.asset)
  const { previewShort } = usePlayerStore()
  const { setPlayheadTime } = useTimelineStore()
  const videoUrl = useAssetStore((s) => s.asset?.videoUrl ?? null)
  const { loading, loadCosts, runChapters } = usePipelineRegenerate(projectId, asset?.id)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmMeta, setConfirmMeta] = useState<RegenerateErrorDetail | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportPct, setExportPct] = useState<number>(0)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleRunChapters = useCallback(async () => {
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
      setDialogOpen(true)
      return
    }
    const result = await runChapters()
    if (result.needsConfirm && result.detail) {
      setConfirmMeta(result.detail)
      setDialogOpen(true)
    }
  }, [loadCosts, runChapters])

  const handleSceneClick = useCallback(
    (sceneId: string, startTime: number, endTime: number) => {
      selectScene(sceneId)
      setPlayheadTime(startTime)
      if (videoUrl) previewShort(startTime, endTime)
      else {
        usePlayerStore.getState().seek(startTime)
      }
    },
    [selectScene, previewShort, setPlayheadTime, videoUrl],
  )

  const canRun =
    asset?.id &&
    projectId &&
    asset.status !== 'transcribing' &&
    asset.status !== 'uploading'

  const handleDownloadChapter = useCallback(
    async (sceneId: string, startTime: number, endTime: number, title?: string) => {
      if (!projectId || !asset?.id) return
      setExportingId(sceneId)
      setExportPct(0)
      setExportError(null)
      const res = await exportShortVideo(
        projectId,
        asset.id,
        startTime,
        endTime,
        'youtube_shorts',
        title ? `Chapter - ${title}` : 'Chapter',
        (pct) => setExportPct(Math.max(0, Math.min(100, Math.round(pct)))),
      )
      setExportingId(null)
      setExportPct(0)
      if (res.error) {
        setExportError(res.error)
        return
      }
      if (res.downloadUrl) {
        downloadShort(res.downloadUrl, title ? `chapter_${title}` : 'chapter')
      }
    },
    [projectId, asset?.id],
  )

  return (
    <div
      data-testid="scenes-panel"
      className="flex flex-col h-full overflow-y-auto"
    >
      <RegenerateConfirmDialog
        open={dialogOpen}
        title="Regenerate chapters"
        description="Replaces chapter boundaries and AI edit suggestions. Shorts are kept unless you regenerate them separately. Uses OpenAI, not ElevenLabs."
        costLabel={
          confirmMeta?.estimated_cost_label ??
          '~$0.02 OpenAI (chapter detection + suggestions)'
        }
        confirmPhrase={confirmMeta?.confirmation_phrase ?? 'regenerate chapters'}
        confirmButtonLabel="Regenerate chapters"
        loading={loading}
        onClose={() => setDialogOpen(false)}
        onConfirm={async (typed) => {
          const r = await runChapters(typed)
          if (r.ok) setDialogOpen(false)
        }}
      />

      {projectId && asset?.storageKey && (
        <ChapterExtractor projectId={projectId} videoKey={asset.storageKey} />
      )}

      <div className="px-3 py-2 border-b border-bg-overlay flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-text-disabled">
            {scenes.length} chapter{scenes.length !== 1 ? 's' : ''}
          </p>
          {canRun && (
            <button
              type="button"
              data-testid="run-chapters-btn"
              disabled={loading || asset?.status === 'analyzing'}
              onClick={() => void handleRunChapters()}
              className="px-2 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              {scenes.length > 0 ? '↻ Regenerate' : 'Run chapters'}
            </button>
          )}
        </div>
        <p className="text-[10px] text-text-disabled leading-snug">
          Chapters are large story segments — hook, problem, solution, CTA. Click one to
          preview on the timeline. Shorts are clipped from these chapters.
        </p>
      </div>

      <div className="space-y-1 p-2">
        {exportError && (
          <p className="px-2 text-[11px] text-status-error">{exportError}</p>
        )}
        {scenes.map((scene) => {
          const meta      = INTENT_META[scene.intent]
          const isSelected = scene.id === selectedSceneId

          return (
            <div
              key={scene.id}
              data-testid={`scene-item-${scene.id}`}
              onClick={() => handleSceneClick(scene.id, scene.startTime, scene.endTime)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSceneClick(scene.id, scene.startTime, scene.endTime)
                }
              }}
              role="button"
              tabIndex={0}
              className={[
                'w-full text-left p-2 rounded-lg transition-all border',
                isSelected
                  ? 'border-accent/50 bg-accent/5'
                  : 'border-transparent hover:border-bg-overlay hover:bg-bg-overlay',
              ].join(' ')}
            >
              <div className="flex gap-2">
                <div
                  className="w-14 h-9 rounded flex-shrink-0 flex items-center justify-center text-white/40 text-xs overflow-hidden bg-bg-overlay"
                  style={
                    scene.thumbnailUrl
                      ? {
                          backgroundImage: `url(${scene.thumbnailUrl})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : { background: scene.thumbnailColor }
                  }
                  aria-hidden="true"
                >
                  {!scene.thumbnailUrl && '▶'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-[10px] font-mono text-text-disabled">
                      {formatRange(scene.startTime, scene.endTime)}
                    </span>
                    <span
                      data-testid={`scene-intent-${scene.id}`}
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: `${meta.color}22`, color: meta.color }}
                    >
                      {meta.emoji} {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-snug line-clamp-2">
                    {scene.summary}
                  </p>
                  {scene.titleReason && (
                    <p className="mt-1 text-[10px] text-text-disabled leading-snug">
                      Why this title: {scene.titleReason}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div
                      data-testid={`scene-score-bar-${scene.id}`}
                      className="flex-1 h-1 rounded-full bg-bg-overlay overflow-hidden"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${scene.score}%`, background: meta.color }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-text-disabled">{scene.score}</span>
                    <button
                      type="button"
                      data-testid={`download-chapter-${scene.id}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleDownloadChapter(
                          scene.id,
                          scene.startTime,
                          scene.endTime,
                          scene.title || scene.summary,
                        )
                      }}
                      disabled={exportingId === scene.id}
                      className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
                    >
                      {exportingId === scene.id ? `Exporting ${exportPct}%` : 'Download'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
