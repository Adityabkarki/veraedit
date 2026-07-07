/**
 * Suggestion actions — accept/reject sync with backend + reload timeline.
 */

import { api } from '@/lib/api'
import { type ApiTimelineData } from '@/lib/timelineApi'
import { applySuggestionToEditor, syncOverlaysToVisualLibrary } from '@/lib/applySuggestionClient'
import { useTimelineStore } from '@/stores/timelineStore'
import type { SuggestionAction } from '@/lib/applySuggestionClient'

interface AcceptResponse {
  suggestion_id: string
  status: string
  applied_to_timeline: boolean
  timeline?: { data: ApiTimelineData } | null
  message?: string
}

export async function acceptSuggestionApi(
  projectId: string,
  assetId: string,
  suggestionId: string,
  action?: SuggestionAction | null,
  suggestionType?: string,
): Promise<{ ok: boolean; error: string | null; applied: boolean }> {
  // Optimistic client apply for instant feedback
  if (action) {
    applySuggestionToEditor(action, suggestionType)
  }

  const res = await api.post<AcceptResponse>(
    `/projects/${projectId}/assets/${assetId}/suggestions/${suggestionId}/accept`,
    {},
  )

  if (res.error) {
    return { ok: false, error: res.error, applied: false }
  }

  let applied = res.data?.applied_to_timeline ?? false

  // Prefer server timeline when available
  if (res.data?.timeline?.data) {
    useTimelineStore.getState().loadFromApi(res.data.timeline.data, {
      preservePlayhead: true,
    })
    syncOverlaysToVisualLibrary(useTimelineStore.getState().getFullClips())
    applied = true
  } else {
    const tl = await api.get<{ data: ApiTimelineData }>(`/projects/${projectId}/timeline`)
    if (tl.data?.data) {
      useTimelineStore.getState().loadFromApi(tl.data.data, { preservePlayhead: true })
      syncOverlaysToVisualLibrary(useTimelineStore.getState().getFullClips())
      applied = true
    } else if (action) {
      syncOverlaysToVisualLibrary(useTimelineStore.getState().getFullClips())
      applied = true
    }
  }

  return { ok: true, error: null, applied }
}

export async function rejectSuggestionApi(
  projectId: string,
  assetId: string,
  suggestionId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const res = await api.post<unknown>(
    `/projects/${projectId}/assets/${assetId}/suggestions/${suggestionId}/reject`,
    {},
  )
  if (res.error) return { ok: false, error: res.error }
  return { ok: true, error: null }
}

export type RegenerateScope =
  | 'chapters'
  | 'shorts'
  | 'highlights'
  | 'suggestions'
  | 'master_edit'

export function scopeForSuggestionType(apiType?: string): RegenerateScope {
  const t = (apiType ?? '').toUpperCase()
  if (t === 'SHORT_CLIP') return 'shorts'
  if (t === 'HIGHLIGHT') return 'highlights'
  if (t === 'HOOK_REWRITE' || t === 'REMOVE_FILLER' || t === 'CUT') return 'master_edit'
  return 'suggestions'
}

export async function regenerateScopedApi(
  projectId: string,
  assetId: string,
  scope: RegenerateScope,
  userPrompt: string,
  confirmation: string,
  rejectIds: string[] = [],
): Promise<{ ok: boolean; error: string | null }> {
  const res = await api.post<unknown>(
    `/projects/${projectId}/assets/${assetId}/regenerate`,
    {
      scope,
      user_prompt: userPrompt,
      confirmation,
      reject_ids: rejectIds,
    },
  )
  if (res.error) return { ok: false, error: res.error }
  return { ok: true, error: null }
}

export async function batchAcceptSuggestionsApi(
  projectId: string,
  assetId: string,
  items: { id: string; action?: SuggestionAction | null; type?: string }[],
): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  for (const item of items) {
    const res = await acceptSuggestionApi(
      projectId,
      assetId,
      item.id,
      item.action,
      item.type,
    )
    if (res.ok) ok++
    else failed++
  }
  return { ok, failed }
}
