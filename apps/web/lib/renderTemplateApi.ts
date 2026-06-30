/**
 * Template render API (Phase 06).
 */
import { api } from '@/lib/api'
import type { AnnotatedTemplate } from '@/lib/gapResolutionApi'

export interface TemplateRenderJobStatus {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  result?: {
    step?: string
    key?: string
    url?: string
    captions_included?: boolean
    caption_note?: string
  }
  error?: string
}

export async function startRenderFromTemplate(input: {
  projectId: string
  template: AnnotatedTemplate
  resolvedAssets: Record<string, { storageKey: string; url?: string }>
  textValues: Record<string, string>
}) {
  const resolved_assets = Object.fromEntries(
    Object.entries(input.resolvedAssets).map(([slotId, asset]) => [
      slotId,
      { storage_key: asset.storageKey, url: asset.url ?? '' },
    ]),
  )

  return api.post<{ job_id: string; status: string }>('/render/from-template', {
    project_id: input.projectId,
    template: input.template,
    resolved_assets,
    text_values: input.textValues,
  })
}

export async function getTemplateRenderJob(jobId: string) {
  return api.get<TemplateRenderJobStatus>(`/render/jobs/${jobId}`)
}
