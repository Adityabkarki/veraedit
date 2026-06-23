/**
 * Pipeline regeneration API — costs, confirmations, retry actions.
 */

import { api } from '@/lib/api'

export interface SpendActionRow {
  task: string
  label: string
  provider: string
  provider_label: string
  model: string
  cost_usd: number
  call_count: number
  input_tokens?: number
  output_tokens?: number
  audio_seconds?: number
}

export interface AssetSpendSummary {
  total_usd: number
  call_count: number
  elevenlabs_usd: number
  openai_usd: number
  by_provider: Record<
    string,
    { provider: string; label: string; cost_usd: number }
  >
  by_action: SpendActionRow[]
}

export interface PipelineCostsResponse {
  asset_id: string
  duration_seconds: number
  transcript: {
    exists: boolean
    ready: boolean
    partial: boolean
    completed_chunks: number
    total_chunks: number
  }
  chapters: { exists: boolean; count: number }
  shorts: { exists: boolean; count: number }
  costs_usd: {
    transcription_full: number
    transcription_resume: number
    chapters_analysis: number
    shorts_regeneration: number
  }
  confirmations: {
    transcription: string
    chapters: string
    shorts: string
  }
  spend?: AssetSpendSummary
}

export interface RegenerateErrorDetail {
  message: string
  requires_confirmation?: boolean
  confirmation_phrase?: string
  estimated_cost_usd?: number
  estimated_cost_label?: string
}

export async function fetchPipelineCosts(projectId: string, assetId: string) {
  return api.get<PipelineCostsResponse>(
    `/projects/${projectId}/assets/${assetId}/pipeline-costs`,
  )
}

export async function regenerateTranscript(
  projectId: string,
  assetId: string,
  body: { confirmation?: string; resume?: boolean } = {},
) {
  return api.post<{ status: string; message: string; asset_id: string; force?: boolean }>(
    `/projects/${projectId}/assets/${assetId}/retranscribe`,
    body,
  )
}

export async function runChapterAnalysis(
  projectId: string,
  assetId: string,
  body: { confirmation?: string; scope?: 'chapters' | 'shorts' | 'all' } = {},
) {
  return api.post<{ status: string; message: string; asset_id: string; scope?: string }>(
    `/projects/${projectId}/assets/${assetId}/analyze`,
    { scope: 'chapters', ...body },
  )
}

export async function regenerateShorts(
  projectId: string,
  assetId: string,
  body: { confirmation?: string } = {},
) {
  return api.post<{ status: string; message: string; asset_id: string; scope?: string }>(
    `/projects/${projectId}/assets/${assetId}/analyze`,
    { scope: 'shorts', ...body },
  )
}

export function parseRegenerateError(error: string | undefined): RegenerateErrorDetail | null {
  if (!error) return null
  try {
    const parsed = JSON.parse(error) as RegenerateErrorDetail
    if (parsed && typeof parsed.message === 'string') return parsed
  } catch {
    /* plain string */
  }
  return null
}
