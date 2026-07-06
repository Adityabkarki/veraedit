/**
 * Director Engine API client.
 */

import { api } from '@/lib/api'
import type {
  DirectorCompileResponse,
  DirectorContentType,
  DirectorTimeline,
  DirectorTimelineResponse,
} from '@/types/director'

export async function fetchDirectorTimeline(
  projectId: string,
): Promise<{ data: DirectorTimelineResponse | null; error: string | null }> {
  const res = await api.get<DirectorTimelineResponse>(`/projects/${projectId}/director-timeline`)
  return { data: res.data, error: res.error }
}

export async function compileDirectorTimeline(
  projectId: string,
  contentType: DirectorContentType,
  options?: { density?: string; overwrite?: boolean; assetId?: string },
): Promise<{ data: DirectorCompileResponse | null; error: string | null; status: number | null }> {
  const res = await api.post<DirectorCompileResponse>('/director/compile', {
    project_id: projectId,
    content_type: contentType,
    density: options?.density ?? 'balanced',
    overwrite: options?.overwrite ?? false,
    asset_id: options?.assetId ?? undefined,
  })
  return { data: res.data, error: res.error, status: res.status }
}

export type DirectorOverrideAction =
  | { action: 'delete_entry'; entry_id: string }
  | { action: 'promote_trigger'; trigger_id: string; component_id?: string }
  | { action: 'swap_component'; entry_id: string; component_id: string }
  | { action: 'reroll_broll'; entry_id: string; search_query: string }

export async function patchDirectorTimeline(
  projectId: string,
  body: DirectorOverrideAction,
): Promise<{ data: { timeline: DirectorTimeline } | null; error: string | null }> {
  const res = await api.patch<{ timeline: DirectorTimeline }>(
    `/projects/${projectId}/director-timeline`,
    body,
  )
  return { data: res.data, error: res.error }
}

export async function enableDirectorEngine(
  projectId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const res = await api.put(`/projects/${projectId}`, {
    settings: { useDirectorEngine: true },
  })
  return { ok: !res.error, error: res.error }
}

export function projectUsesDirectorEngine(
  settings?: Record<string, unknown> | null,
): boolean {
  if (!settings) return false
  if (settings.useDirectorEngine === true) return true
  if (settings.use_director_engine === true) return true
  if (process.env.NEXT_PUBLIC_DIRECTOR_ENGINE === 'true') return true
  return false
}

export interface DirectorRenderPropsResponse {
  compositionId: 'DirectorRender'
  durationInFrames: number
  fps: number
  width: number
  height: number
  inputProps: {
    timeline: DirectorTimeline
    assetUrls: Record<string, string>
    primaryVideoSrc?: string
    dialogueSrc?: string
    cameraFeeds?: unknown[]
    sfxUrls?: Record<string, string>
    fontFamily?: string
  }
}

/** Same props resolution path as unified export (Preview/Export Parity Law). */
export async function fetchDirectorRenderProps(
  projectId: string,
  width = 1920,
  height = 1080,
): Promise<{ data: DirectorRenderPropsResponse | null; error: string | null }> {
  const res = await api.get<DirectorRenderPropsResponse>(
    `/projects/${projectId}/director-render-props?width=${width}&height=${height}`,
  )
  return { data: res.data, error: res.error }
}

export function unifiedRenderPreviewEnabled(): boolean {
  return process.env.NEXT_PUBLIC_UNIFIED_RENDER_PREVIEW !== 'false'
}
