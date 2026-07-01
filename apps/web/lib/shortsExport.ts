/**
 * Shorts export — queue a trimmed short render via the asset API, poll, download.
 * Shorts are suggestion records (not the shorts DB table) — export uses start/end times.
 */

import { api } from '@/lib/api'
import { downloadRenderFile, downloadRemoteFile } from '@/lib/downloadFile'
import { saveProjectTimeline } from '@/lib/renderExport'
import { pollRenderJob } from '@/lib/renderPoll'

import type { ShortStylingExport } from '@/lib/shortStyling'

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
): Promise<{ error: string | null; downloadUrl: string | null; renderId: string | null }> {
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
    return { error: created.error ?? 'Could not start short export.', downloadUrl: null, renderId: null }
  }

  let ready = false
  let pollError: string | null = null
  try {
    await pollRenderJob(projectId, renderId, {
      videoDurationSeconds: Math.max(0, endTime - startTime),
      clipCount: segments?.length ?? 1,
      hasCaptions: true,
      onProgress,
    })
    ready = true
  } catch (err) {
    pollError = err instanceof Error ? err.message : 'Short export failed.'
  }

  if (!ready) {
    return {
      error: pollError ?? 'Export timed out.',
      downloadUrl: null,
      renderId: null,
    }
  }

  const dl = await api.get<{ download_url: string }>(
    `/projects/${projectId}/renders/${renderId}/download`,
  )
  if (dl.error || !dl.data?.download_url) {
    return { error: dl.error ?? 'Export finished but download is unavailable.', downloadUrl: null, renderId }
  }

  return { error: null, downloadUrl: dl.data.download_url, renderId }
}

export async function downloadShort(
  url: string,
  title: string,
  projectId?: string,
  renderId?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const safe = title.replace(/[^\w\-]+/g, '_').slice(0, 40)
  const filename = `${safe || 'short'}.mp4`
  if (projectId && renderId) {
    const viaApi = await downloadRenderFile(projectId, renderId, filename)
    if (viaApi.ok) return viaApi
  }
  return downloadRemoteFile(url, filename)
}
