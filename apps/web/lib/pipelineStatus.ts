/**
 * Pipeline polling — keeps editor UI in sync while transcription / analysis run.
 */

import { loadEditorProject } from '@/lib/editorData'
import type { AssetStatus } from '@/stores/assetStore'

export const PIPELINE_POLL_MS = 3000
/** Show worker hint if still on uploaded/transcribing after this many ms. */
export const PIPELINE_STALE_MS = 90_000

export type PipelinePhase = 'idle' | 'processing' | 'done' | 'error'

export interface PipelinePollState {
  phase: PipelinePhase
  assetStatus: AssetStatus | null
  errorMessage: string | null
  transcriptReady: boolean
  detailMessage: string | null
  elapsedMs: number
  progressPercent: number
}

const STAGE_HINT: Record<string, string> = {
  uploading: 'Finishing upload…',
  uploaded: 'Waiting for transcription to start…',
  transcribing: 'Transcribing speech in Nepali (ElevenLabs Scribe)…',
  analyzing: 'Finding chapters and editing suggestions (OpenAI)…',
}

export function pipelineDetailMessage(
  status: AssetStatus | null,
  transcriptStatus: string | null,
  elapsedMs: number,
): string | null {
  if (!status || status === 'ready' || status === 'error') return null

  const base = STAGE_HINT[status] ?? `Processing (${status})…`

  if (
    elapsedMs >= PIPELINE_STALE_MS &&
    (status === 'uploaded' || status === 'transcribing')
  ) {
    return (
      `${base} Taking longer than usual — ensure the Celery worker is running ` +
      '(run scripts\\worker.bat all in the project folder).'
    )
  }

  if (status === 'transcribing' && transcriptStatus === 'processing') {
    return 'Transcription is in progress. This usually takes 1–3 minutes.'
  }

  return base
}

function estimatePipelineProgress(
  status: AssetStatus | null,
  transcriptStatus: string | null,
  elapsedMs: number,
): number {
  if (!status) return 0
  if (status === 'ready') return 100
  if (status === 'error') return 0

  // Conservative stage-based estimation until WS events are consumed in the editor.
  if (status === 'uploading' || status === 'uploaded') return 8
  if (status === 'transcribing') {
    const base = transcriptStatus === 'processing' ? 12 : 10
    const ramp = Math.min(23, Math.floor(elapsedMs / 3500))
    return Math.min(35, base + ramp)
  }
  if (status === 'analyzing') {
    const ramp = Math.min(59, Math.floor(elapsedMs / 3000))
    return Math.min(94, 35 + ramp)
  }
  return 5
}

export async function pollEditorPipeline(
  projectId: string,
  startedAt: number,
): Promise<PipelinePollState> {
  const result = await loadEditorProject(projectId, { reloadTimeline: false })
  const elapsedMs = Date.now() - startedAt

  if (result.error || result.assetStatus === 'error') {
    return {
      phase: 'error',
      assetStatus: result.assetStatus ?? 'error',
      errorMessage: result.error ?? 'Processing failed.',
      transcriptReady: false,
      detailMessage: result.error,
      elapsedMs,
      progressPercent: 0,
    }
  }

  if (result.assetStatus === 'ready' && result.transcriptLoaded) {
    return {
      phase: 'done',
      assetStatus: 'ready',
      errorMessage: null,
      transcriptReady: true,
      detailMessage: null,
      elapsedMs,
      progressPercent: 100,
    }
  }

  const transcriptReady =
    result.transcriptLoaded ||
    result.transcriptStatus === 'ready' ||
    result.assetStatus === 'analyzing' ||
    result.assetStatus === 'ready'

  return {
    phase: 'processing',
    assetStatus: result.assetStatus,
    errorMessage: null,
    transcriptReady,
    detailMessage: pipelineDetailMessage(
      result.assetStatus,
      result.transcriptStatus,
      elapsedMs,
    ),
    elapsedMs,
    progressPercent: estimatePipelineProgress(
      result.assetStatus,
      result.transcriptStatus,
      elapsedMs,
    ),
  }
}
