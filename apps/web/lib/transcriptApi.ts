/**
 * Transcript API — fetch and regenerate.
 */

import { api } from '@/lib/api'

export interface TranscriptQualityMetrics {
  avg_confidence?: number
  low_confidence_count?: number
  quality_grade?: string
  word_count?: number
    language_warning?: string
    needs_review?: boolean
}

export interface TranscriptResponse {
  status: string
  transcript_id?: string
  full_text?: string
  language?: string
  words?: unknown[]
  speakers?: unknown[]
  filler_words?: unknown[]
  quality_metrics?: TranscriptQualityMetrics
  model_used?: string
  message?: string
}

export async function fetchTranscript(projectId: string, assetId: string) {
  return api.get<TranscriptResponse>(
    `/projects/${projectId}/assets/${assetId}/transcript`,
  )
}

export async function regenerateTranscript(
  projectId: string,
  assetId: string,
  body: { confirmation?: string; resume?: boolean } = {},
) {
  return api.post<{ status: string; message: string; asset_id: string }>(
    `/projects/${projectId}/assets/${assetId}/retranscribe`,
    body,
  )
}
