/**
 * Render export — save timeline, queue FFmpeg render, poll, download MP4.
 */

import { api } from '@/lib/api'
import { storeToApiTimeline } from '@/lib/timelineApi'
import { useTimelineStore } from '@/stores/timelineStore'
import { useAssetStore } from '@/stores/assetStore'

export type ExportPlatform =
  | 'youtube'
  | 'youtube_shorts'
  | 'tiktok'
  | 'instagram_reels'
  | 'facebook'

export const EXPORT_PLATFORMS: { id: ExportPlatform; label: string; hint: string }[] = [
  { id: 'youtube',         label: 'YouTube',         hint: '1920×1080 landscape' },
  { id: 'youtube_shorts',  label: 'YouTube Shorts',  hint: '1080×1920 vertical' },
  { id: 'tiktok',          label: 'TikTok',          hint: '1080×1920 vertical' },
  { id: 'instagram_reels', label: 'Instagram Reels', hint: '1080×1920 vertical' },
  { id: 'facebook',        label: 'Facebook',        hint: '1280×720 landscape' },
]

interface RenderStatus {
  id: string
  status: string
  progress_percent: number
  error_message?: string | null
  storage_key?: string | null
}

export interface ExportResult {
  renderId: string
  downloadUrl: string | null
  error: string | null
}

/** Persist the current editor timeline to the backend. */
export async function saveProjectTimeline(
  projectId: string,
  label = 'Editor save',
): Promise<{ ok: boolean; error: string | null }> {
  const asset = useAssetStore.getState().asset
  if (!asset?.id) {
    return { ok: false, error: 'Upload a video before saving the timeline.' }
  }

  const { tracks, clips } = useTimelineStore.getState()
  const videoClips = clips.filter((c) => c.trackId === 'video')
  if (videoClips.length === 0) {
    return { ok: false, error: 'Add at least one video clip to the timeline before saving.' }
  }

  const duration = Math.max(
    asset.durationSeconds ?? 0,
    ...clips.map((c) => c.startTime + c.duration),
  )

  const data = storeToApiTimeline(tracks, clips, asset.id, duration)
  const res = await api.put<{ version: number }>(
    `/projects/${projectId}/timeline`,
    { data, label },
  )

  if (res.error) return { ok: false, error: res.error }
  return { ok: true, error: null }
}

/** Poll render status until ready or error (max ~3 min). */
async function pollRender(
  projectId: string,
  renderId: string,
  onProgress?: (pct: number, status: string) => void,
): Promise<RenderStatus> {
  const maxAttempts = 60
  for (let i = 0; i < maxAttempts; i++) {
    const res = await api.get<RenderStatus>(
      `/projects/${projectId}/renders/${renderId}`,
    )
    if (res.error || !res.data) {
      throw new Error(res.error ?? 'Could not check render status.')
    }
    const st = res.data.status?.toLowerCase() ?? ''
    onProgress?.(res.data.progress_percent ?? 0, st)
    if (st === 'ready' || st === 'complete') return res.data
    if (st === 'error') {
      throw new Error(res.data.error_message ?? 'Render failed.')
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(
    'Render timed out. Make sure the Celery worker is running (scripts\\worker.bat all) and FFmpeg is installed.',
  )
}

/**
 * Full export flow: save timeline → queue render → poll → return download URL.
 */
export async function exportProjectVideo(
  projectId: string,
  platform: ExportPlatform,
  onProgress?: (pct: number, status: string) => void,
): Promise<ExportResult> {
  const saved = await saveProjectTimeline(projectId, `Export ${platform}`)
  if (!saved.ok) {
    return { renderId: '', downloadUrl: null, error: saved.error }
  }

  onProgress?.(5, 'queued')

  const created = await api.post<RenderStatus>(
    `/projects/${projectId}/renders`,
    { platform, name: `Export ${platform}` },
  )
  if (created.error || !created.data) {
    return { renderId: '', downloadUrl: null, error: created.error ?? 'Could not start render.' }
  }

  const renderId = created.data.id
  try {
    await pollRender(projectId, renderId, onProgress)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Render failed.'
    return { renderId, downloadUrl: null, error: msg }
  }

  const dl = await api.get<{ download_url: string }>(
    `/projects/${projectId}/renders/${renderId}/download`,
  )
  if (dl.error || !dl.data?.download_url) {
    return {
      renderId,
      downloadUrl: null,
      error: dl.error ?? 'Render finished but download link is unavailable.',
    }
  }

  return { renderId, downloadUrl: dl.data.download_url, error: null }
}

/** Trigger browser download from a presigned URL. */
export function triggerDownload(url: string, filename = 'viraedit-export.mp4') {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.target = '_blank'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
