/**
 * Shared polling helpers for Celery FFmpeg render jobs.
 */

import { api } from '@/lib/api'
import { timelineVideoDuration } from '@/lib/playbackMapping'
import type { Clip } from '@/stores/timelineStore'

export const RENDER_POLL_INTERVAL_MS = 3000

export interface RenderPollStatus {
  id: string
  status: string
  progress_percent: number
  error_message?: string | null
  storage_key?: string | null
}

export interface RenderPollOptions {
  videoDurationSeconds?: number
  clipCount?: number
  hasCaptions?: boolean
  onProgress?: (pct: number, status: string) => void
}

/** How long to wait before giving up — scales with video length and clip count. */
export function renderPollMaxAttempts(options?: {
  videoDurationSeconds?: number
  clipCount?: number
  hasCaptions?: boolean
}): number {
  const dur = options?.videoDurationSeconds ?? 120
  const clips = options?.clipCount ?? 1
  const captionExtra = options?.hasCaptions ? 120 : 0
  // Multi-clip timelines re-encode each segment; caption burn adds another FFmpeg pass.
  const budgetSeconds = Math.min(
    900,
    Math.max(360, Math.ceil(dur * 2.5 + clips * 6 + captionExtra)),
  )
  return Math.ceil(budgetSeconds / (RENDER_POLL_INTERVAL_MS / 1000))
}

export function renderPollBudgetFromClips(
  clips: Clip[],
  hasCaptions = false,
): number {
  return renderPollMaxAttempts({
    videoDurationSeconds: timelineVideoDuration(clips) || undefined,
    clipCount: clips.filter((c) => c.trackId === 'video').length || 1,
    hasCaptions,
  })
}

export function renderTimeoutMessage(lastStatus: string): string {
  const st = lastStatus.toLowerCase()
  if (st === 'queued') {
    return (
      'Render is still queued. Start the Celery worker with the render queue: ' +
      'cd apps/api && celery -A celery_app worker ' +
      '--queues=transcription,analysis,render,ai --pool=solo --loglevel=info'
    )
  }
  if (st === 'processing') {
    return (
      'Render is still encoding. Long videos with many cuts and captions can take ' +
      '5–10 minutes. Check the Celery worker terminal — the export may still complete.'
    )
  }
  return (
    'Render timed out. Make sure the Celery worker is running and FFmpeg is installed.'
  )
}

export async function pollRenderJob(
  projectId: string,
  renderId: string,
  options?: RenderPollOptions,
): Promise<RenderPollStatus> {
  const maxAttempts = renderPollMaxAttempts(options)
  let lastStatus = 'queued'

  for (let i = 0; i < maxAttempts; i++) {
    const res = await api.get<RenderPollStatus>(
      `/projects/${projectId}/renders/${renderId}`,
    )
    if (res.error || !res.data) {
      throw new Error(res.error ?? 'Could not check render status.')
    }
    lastStatus = res.data.status?.toLowerCase() ?? lastStatus
    options?.onProgress?.(res.data.progress_percent ?? 0, lastStatus)
    if (lastStatus === 'ready' || lastStatus === 'complete') {
      return res.data
    }
    if (lastStatus === 'error') {
      throw new Error(res.data.error_message ?? 'Render failed.')
    }
    await new Promise((r) => setTimeout(r, RENDER_POLL_INTERVAL_MS))
  }

  throw new Error(renderTimeoutMessage(lastStatus))
}
