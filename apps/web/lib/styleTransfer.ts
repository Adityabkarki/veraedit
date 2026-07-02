/**
 * Style Transfer API — extract, library, apply, delete presets.
 * Backend: apps/api/routers/styles.py (EP-2.8)
 */

import type { ApplySummary, StyleGapReport } from '@/lib/styleGapReport'
import { api } from '@/lib/api'
import type { ApiTimelineData } from '@/lib/timelineApi'

export interface StylePreset {
  id: string
  name: string
  source_url?: string
  source_title?: string
  platform?: string
  components?: string[]
  created_at?: string
  has_dna?: boolean
  is_template?: boolean
  effect_count?: number
  edit_event_count?: number
  reference_duration_s?: number
  supported_coverage_pct?: number
  coverage_pct?: number
  gap_report?: StyleGapReport
  fidelity_score?: number
  missing_capabilities?: { id: string; name: string; dev_epic?: string }[]
  detected_effects?: string[]
  tool_ids?: string[]
  has_vision?: boolean
}

export interface EditToolboxTool {
  id: string
  name: string
  status: 'supported' | 'partial' | 'missing'
  renderer: string
  category: string
  description?: string
  discovered: boolean
  available?: boolean
  is_core?: boolean
  from_template?: boolean
  min_apply_strength?: number
  discovered_from_presets?: string[]
}

export interface StyleToolboxResponse {
  tool_count: number
  discovered_count: number
  tools: EditToolboxTool[]
  by_category: Record<string, EditToolboxTool[]>
  categories: string[]
}

export interface StyleLibraryResponse {
  preset_count: number
  presets: StylePreset[]
}

export interface StyleExtractResponse {
  task_id: string
  status: string
  platform?: string
  preset_name?: string
  message?: string
}

export interface StyleApplyResponse {
  timeline_id: string
  version: number
  source_timeline_version?: number
  label: string
  preset_name: string
  data?: ApiTimelineData
  message?: string
  apply_summary?: ApplySummary
}

const STYLE_COMPONENTS = [
  'pacing', 'color', 'captions', 'transitions', 'audio', 'hook', 'visuals', 'broll', 'vision',
] as const

export type StyleComponent = (typeof STYLE_COMPONENTS)[number]

export const STYLE_COMPONENT_LABELS: Record<StyleComponent, string> = {
  pacing:      'Cut pacing',
  color:       'Color grade',
  captions:    'Caption style',
  transitions: 'Transitions',
  audio:       'Audio energy',
  hook:        'Hook structure',
  visuals:     'On-screen visuals',
  broll:       'B-roll frequency',
  vision:      'Vision analysis (OCR + layouts)',
}

export async function fetchStyleLibrary(projectId: string) {
  return api.get<StyleLibraryResponse>(`/projects/${projectId}/style-library`)
}

export async function fetchStyleToolbox(projectId: string) {
  return api.get<StyleToolboxResponse>(`/projects/${projectId}/style-toolbox`)
}

/** Core edit-element catalog (global — not gated behind style extraction). */
export async function fetchEditToolbox(projectId?: string) {
  if (projectId) {
    return api.get<StyleToolboxResponse>(`/projects/${projectId}/style-toolbox`)
  }
  return api.get<StyleToolboxResponse>('/edit-toolbox')
}

export async function extractStyleFromUrl(
  projectId: string,
  sourceUrl: string,
  presetName: string,
  components: string[] = [...STYLE_COMPONENTS],
) {
  return api.post<StyleExtractResponse>(`/projects/${projectId}/style-extract`, {
    source_url: sourceUrl.trim(),
    preset_name: presetName,
    components: components.length > 0 ? components : [...STYLE_COMPONENTS],
  })
}

export async function extractStyleFromFile(
  projectId: string,
  file: File,
  presetName: string,
) {
  const form = new FormData()
  form.append('file', file)
  form.append('preset_name', presetName)
  return api.postForm<StyleExtractResponse>(
    `/projects/${projectId}/style-extract-upload`,
    form,
  )
}

export async function applyStylePreset(
  projectId: string,
  presetId: string,
  strength: number,
  components: string[] = [],
) {
  return api.post<StyleApplyResponse>(`/projects/${projectId}/style-apply`, {
    preset_id: presetId,
    strength,
    components,
    label: '',
  })
}

export async function deleteStylePreset(projectId: string, presetId: string) {
  return api.delete<{ deleted: boolean }>(
    `/projects/${projectId}/style-library/${presetId}`,
  )
}

/** Style extract often needs 3–5 min (download + vision). 150 × 3s ≈ 7.5 min. */
export const STYLE_EXTRACT_POLL_ATTEMPTS = 150
export const STYLE_LIBRARY_POLL_ATTEMPTS = 50

/** Poll Celery task status (when worker is running). */
export async function pollTaskStatus(
  taskId: string,
  maxAttempts = 20,
  onAttempt?: (
    attempt: number,
    status?: string,
    progress?: number,
    message?: string,
  ) => void,
): Promise<{ ok: boolean; error?: string; tasksEndpointMissing?: boolean }> {
  if (taskId.startsWith('offline-')) {
    return {
      ok: false,
      error:
        'Background worker was not running when extraction started. Run scripts\\worker.bat all, then try again.',
    }
  }

  let sawProcessing = false
  let pendingStreak = 0

  for (let i = 0; i < maxAttempts; i++) {
    const res = await api.get<{
      status?: string
      error?: string
      message?: string
      progress_percent?: number
      stage?: string
      result?: { status?: string; error?: string }
    }>(`/tasks/${taskId}`)

    if (res.status === 404) {
      return {
        ok: false,
        tasksEndpointMissing: true,
        error: 'Task status API is unavailable. Restart the API (npm run api) and try again.',
      }
    }

    if (res.error) {
      return { ok: false, error: res.error }
    }

    const st = res.data?.status?.toLowerCase() ?? ''
    const pct = res.data?.progress_percent
    const msg = res.data?.message ?? res.data?.stage
    onAttempt?.(i + 1, st, pct, msg)

    if (st === 'processing') {
      sawProcessing = true
      pendingStreak = 0
    } else if (st === 'pending') {
      pendingStreak += 1
    } else {
      pendingStreak = 0
    }

    const resultErr =
      res.data?.error ??
      (res.data?.result?.status === 'failed' ? res.data.result.error : undefined)

    if (st === 'success' || st === 'complete') {
      if (res.data?.result?.status === 'failed') {
        return { ok: false, error: resultErr ?? 'Style extraction failed.' }
      }
      return { ok: true }
    }
    if (st === 'failure' || st === 'error') {
      return { ok: false, error: resultErr ?? 'Background task failed.' }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }

  if (!sawProcessing && pendingStreak > 5) {
    return {
      ok: false,
      error:
        'Extraction never started — the Celery worker is probably not running. ' +
        'In a terminal run: scripts\\worker.bat all',
    }
  }
  return {
    ok: false,
    error: sawProcessing
      ? 'Extraction is still running but took too long in the browser. ' +
        'Check scripts\\worker.bat all is running, then refresh — your template may already be in the library.'
      : 'Task timed out. Run scripts\\worker.bat all and try again with a shorter reference clip (under 3 minutes).',
  }
}

/**
 * Fallback when GET /tasks/{id} is missing — poll style library until a new preset appears.
 */
export async function pollStyleLibraryForPreset(
  projectId: string,
  presetName: string,
  previousCount: number,
  maxAttempts = STYLE_LIBRARY_POLL_ATTEMPTS,
): Promise<{ ok: boolean; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetchStyleLibrary(projectId)
    const list = res.data?.presets ?? []
    if (list.length > previousCount) {
      const match = list.find((p) => p.name === presetName)
      if (match || list.length > previousCount) return { ok: true }
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  return {
    ok: false,
    error: 'Style extraction timed out. Ensure the Celery worker is running (scripts\\worker.bat all).',
  }
}
