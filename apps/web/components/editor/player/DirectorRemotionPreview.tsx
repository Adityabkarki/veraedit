'use client'

/**
 * Remotion DirectorRender preview — same composition + props as unified export.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePlayerStore } from '@/stores/playerStore'
import { useEditorStore } from '@/stores/editorStore'
import { useTimelineStore } from '@/stores/timelineStore'
import {
  fetchDirectorRenderProps,
  unifiedRenderPreviewEnabled,
  type DirectorRenderPropsResponse,
} from '@/lib/directorApi'
import { saveProjectTimeline } from '@/lib/renderExport'

const DirectorRemotionPlayer = dynamic(
  () => import('@/remotion/DirectorRemotionPlayer'),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60 bg-black">
        Loading render preview…
      </div>
    ),
  },
)

interface DirectorRemotionPreviewProps {
  projectId: string
  onReady?: () => void
  onFailed?: () => void
}

export function DirectorRemotionPreview({
  projectId,
  onReady,
  onFailed,
}: DirectorRemotionPreviewProps) {
  const [resolved, setResolved] = useState<DirectorRenderPropsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const aspectRatio = useEditorStore((s) => s.aspectRatio)
  const version = usePlayerStore((s) => s.previewNonce)
  const lastEditAction = useTimelineStore((s) => s.lastEditAction)
  const timelineVersion = useTimelineStore((s) => s.timelineVersion)

  const dims = useMemo(() => {
    if (aspectRatio === '9:16' || aspectRatio === '1:1') {
      return { width: 1080, height: aspectRatio === '9:16' ? 1920 : 1080 }
    }
    return { width: 1920, height: 1080 }
  }, [aspectRatio])

  const onReadyRef = useRef(onReady)
  const onFailedRef = useRef(onFailed)

  useEffect(() => {
    onReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    onFailedRef.current = onFailed
  }, [onFailed])

  useEffect(() => {
    if (!unifiedRenderPreviewEnabled()) return
    let cancelled = false
    setResolved(null)
    setError(null)
    ;(async () => {
      // Only push local edits to the API — backend tasks (e.g. AI B-roll) already
      // update the saved timeline; saving here would wipe those clips.
      if (lastEditAction) {
        await saveProjectTimeline(projectId, 'Preview sync')
      }
      const { data, error: err } = await fetchDirectorRenderProps(
        projectId,
        dims.width,
        dims.height,
      )
      if (cancelled) return
      if (err || !data) {
        setError(err ?? 'Render preview unavailable.')
        setResolved(null)
        onFailedRef.current?.()
        return
      }
      const videoClips = data.inputProps.timeline?.tracks?.video ?? []
      if (videoClips.length === 0) {
        setError('Render preview has no video track — using standard player.')
        setResolved(null)
        onFailedRef.current?.()
        return
      }
      setResolved(data)
      setError(null)
      onReadyRef.current?.()
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, dims.width, dims.height, version, lastEditAction, timelineVersion])

  if (!unifiedRenderPreviewEnabled()) return null
  if (error) {
    return (
      <div
        data-testid="director-remotion-preview-error"
        className="absolute top-2 left-2 right-2 z-20 text-[10px] text-status-warning bg-black/70 px-2 py-1 rounded pointer-events-none text-center"
      >
        {error}
      </div>
    )
  }
  if (!resolved) return null

  return (
    <div data-testid="director-remotion-preview" className="absolute inset-0 z-10">
      <DirectorRemotionPlayer resolved={resolved} />
    </div>
  )
}

export function useUnifiedRenderPreviewActive(): boolean {
  return unifiedRenderPreviewEnabled()
}
