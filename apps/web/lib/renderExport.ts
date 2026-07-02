/**
 * Render export — save timeline, queue FFmpeg render, poll, download MP4.
 */

import { api } from '@/lib/api'
import { downloadRenderFile, downloadRemoteFile } from '@/lib/downloadFile'
import { ensurePrimaryMediaClips, hasVideoLaneClip } from '@/lib/timelineLayers'
import { storeToApiTimeline, type ApiTimelineResponse } from '@/lib/timelineApi'
import { syncCaptionsToTimeline } from '@/lib/captionTimelineSync'
import { prepareTimelineForExport } from '@/lib/exportTimeline'
import { pollRenderJob } from '@/lib/renderPoll'
import { useCaptionsStore } from '@/stores/captionsStore'
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

  const state = useTimelineStore.getState()
  const restored = ensurePrimaryMediaClips(state.tracks, state.clips, {
    id: asset.id,
    filename: asset.filename ?? 'Main video',
    durationSeconds: asset.durationSeconds ?? 0,
  })
  const { tracks, clips } = restored
  if (!hasVideoLaneClip(clips)) {
    return { ok: false, error: 'Add at least one video clip to the timeline before saving.' }
  }

  const captionState = useCaptionsStore.getState()
  if (captionState.captions.length > 0) {
    syncCaptionsToTimeline(captionState.captions, { actionLabel: label })
  }

  const timelineRes = await api.get<ApiTimelineResponse>(`/projects/${projectId}/timeline`)
  const existingMetadata = timelineRes.data?.data?.metadata
  const prepared = await prepareTimelineForExport(
    projectId,
    existingMetadata && typeof existingMetadata === 'object'
      ? (existingMetadata as Record<string, unknown>)
      : undefined,
  )
  if (prepared.warnings.length > 0) {
    console.warn('[export] timeline prepare warnings:', prepared.warnings)
  }

  const timelineState = useTimelineStore.getState()
  const duration = Math.max(
    asset.durationSeconds ?? 0,
    ...timelineState.clips.map((c) => c.startTime + c.duration),
  )

  const data = storeToApiTimeline(
    prepared.tracks,
    prepared.clips,
    asset.id,
    duration,
    prepared.metadata,
  )
  console.info('[export] preview_to_render_snapshot', {
    label,
    clipCount: prepared.clips.length,
    trackCount: prepared.tracks.length,
    durationSeconds: duration,
    captionStyle: (prepared.metadata.caption_style as Record<string, unknown> | undefined) ?? null,
    captionFx: (prepared.metadata.caption_fx as Record<string, unknown> | undefined) ?? null,
    exportWarnings: prepared.warnings.length,
  })
  const res = await api.put<{ version: number }>(
    `/projects/${projectId}/timeline`,
    { data, label },
  )

  if (res.error) return { ok: false, error: res.error }
  return { ok: true, error: null }
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

  const captionState = useCaptionsStore.getState()
  const timelineState = useTimelineStore.getState()
  const videoDuration = Math.max(
    useAssetStore.getState().asset?.durationSeconds ?? 0,
    ...timelineState.clips.map((c) => c.startTime + c.duration),
  )
  const videoClipCount = timelineState.clips.filter((c) => c.trackId === 'video').length

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
    await pollRenderJob(projectId, renderId, {
      videoDurationSeconds: videoDuration,
      clipCount: videoClipCount,
      hasCaptions: captionState.captions.length > 0,
      onProgress,
    })
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

/** Download a finished render — prefers the authenticated API stream. */
export async function downloadProjectRender(
  projectId: string,
  renderId: string,
  platform: ExportPlatform,
  presignedUrl?: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  const filename = `viraedit-${platform}.mp4`
  const viaApi = await downloadRenderFile(projectId, renderId, filename)
  if (viaApi.ok) return viaApi
  if (presignedUrl) {
    return downloadRemoteFile(presignedUrl, filename)
  }
  return viaApi
}

export { downloadRemoteFile, downloadRenderFile } from '@/lib/downloadFile'
