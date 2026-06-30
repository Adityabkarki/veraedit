/**
 * Live AI spend API (Phase 07).
 */
import { api } from '@/lib/api'

export interface ProjectSpend {
  project_id: string
  total_usd: number
  total_cost_usd: number
  by_action: Record<string, number>
  call_count: number
  row_count: number
  budget_used_percent: number
}

export interface WorkspaceSpend {
  workspace_id: string
  total_usd: number
  by_provider: Record<string, number>
  by_action: Record<string, number>
  call_count: number
  period_days: number
}

export async function getProjectSpend(projectId: string) {
  return api.get<ProjectSpend>(`/ai-spend/project/${projectId}`)
}

export async function getWorkspaceSpend(workspaceId: string, periodDays = 30) {
  return api.get<WorkspaceSpend>(
    `/ai-spend/workspace/${workspaceId}?period_days=${periodDays}`,
  )
}

export const ACTION_LABELS: Record<string, string> = {
  asset_tagging: 'Tagging your assets',
  style_analyze: 'Analyzing reference video',
  image_gen: 'Generating images',
  transcribe: 'Transcribing audio',
  chapter_detect: 'Finding chapters',
  sizzle_detect: 'Finding highlights',
  virality_score: 'Scoring clips',
  gap_generate_image: 'Generating slot images',
}
