/**
 * Cloned style templates API (Module 02).
 */
import { api } from '@/lib/api'

export interface TemplateLayer {
  type: string
  slot?: string
  label?: string
  start?: number
  end?: number
  at?: number
  effect?: string
}

export interface ClonedTemplate {
  id: string
  name: string
  project_id: string | null
  data: {
    version?: string
    duration: number
    aspect_ratio: string
    pacing: string
    visual_style: string
    color_palette?: string[]
    layers: TemplateLayer[]
    caption_style?: Record<string, unknown>
    audio?: Record<string, unknown>
  } | null
  thumb_key?: string | null
  is_public?: boolean
}

export interface StyleCloneJob {
  job_id: string
  status: string
}

export async function listTemplates() {
  return api.get<ClonedTemplate[]>('/templates')
}

export async function createTemplate(
  name: string,
  data: Record<string, unknown>,
  projectId?: string
) {
  return api.post<ClonedTemplate>('/templates', {
    name,
    data,
    project_id: projectId ?? null,
  })
}

export async function startStyleClone(
  projectId: string,
  videoKey: string,
  name: string
) {
  return api.post<StyleCloneJob>('/style-clone/analyze', {
    project_id: projectId,
    video_key: videoKey,
    name,
  })
}

export async function getStyleCloneJob(jobId: string) {
  return api.get<{
    id: string
    status: string
    result?: { template_id: string; template: ClonedTemplate['data']; name: string }
    error?: string
  }>(`/style-clone/jobs/${jobId}`)
}
