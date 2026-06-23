/**
 * Shorts export — queue a trimmed short render via the asset API, poll, download.
 * Shorts are suggestion records (not the shorts DB table) — export uses start/end times.
 */

import { api } from '@/lib/api'
import { triggerDownload, saveProjectTimeline } from '@/lib/renderExport'

import type { ShortStylingExport } from '@/lib/shortStyling'

interface RenderStatus {
  id: string
  status: string
  progress_percent: number
  error_message?: string | null
}

export async function exportShortVideo(
  projectId: string,
  assetId: string,
  startTime: number,
  endTime: number,
  platform: 'youtube_shorts' | 'tiktok' | 'instagram_reels' = 'youtube_shorts',
  name = 'Short',
  onProgress?: (pct: number, status: string) => void,
  panX = 0.5,
  reframeStrategy?: string,
  styling?: ShortStylingExport,
  segments?: { start_time: number; end_time: number }[],
): Promise<{ error: string | null; downloadUrl: string | null }> {
  // Best-effort: persist editor timeline when available (backend also auto-creates if missing)
  await saveProjectTimeline(projectId, `Short export: ${name}`)

  const created = await api.post<{ render_id: string; id?: string }>(
    `/projects/${projectId}/assets/${assetId}/short-clips/render`,
    {
      start_time: startTime,
      end_time: endTime,
      platform,
      name,
      pan_x: Math.max(0, Math.min(1, panX)),
      reframe_strategy: reframeStrategy ?? null,
      short_styling: styling ?? null,
      segments: segments && segments.length > 1 ? segments : null,
    },
  )

  const renderId = created.data?.render_id ?? created.data?.id
  if (created.error || !renderId) {
    return { error: created.error ?? 'Could not start short export.', downloadUrl: null }
  }

  let ready = false
  for (let i = 0; i < 60; i++) {
    const st = await api.get<RenderStatus>(`/projects/${projectId}/renders/${renderId}`)
    if (st.error || !st.data) {
      return { error: st.error ?? 'Could not check render status.', downloadUrl: null }
    }
    const status = st.data.status?.toLowerCase() ?? ''
    onProgress?.(st.data.progress_percent ?? 0, status)
    if (status === 'ready') {
      ready = true
      break
    }
    if (status === 'error') {
      return {
        error: st.data.error_message ?? 'Short export failed.',
        downloadUrl: null,
      }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }

  if (!ready) {
    return {
      error: 'Export timed out. Make sure scripts\\worker.bat all is running.',
      downloadUrl: null,
    }
  }

  const dl = await api.get<{ download_url: string }>(
    `/projects/${projectId}/renders/${renderId}/download`,
  )
  if (dl.error || !dl.data?.download_url) {
    return { error: dl.error ?? 'Export finished but download is unavailable.', downloadUrl: null }
  }

  return { error: null, downloadUrl: dl.data.download_url }
}

export function downloadShort(url: string, title: string) {
  const safe = title.replace(/[^\w\-]+/g, '_').slice(0, 40)
  triggerDownload(url, `${safe || 'short'}.mp4`)
}
