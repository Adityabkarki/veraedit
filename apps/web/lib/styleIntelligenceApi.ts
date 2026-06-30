/**
 * Style intelligence API (Phase 01).
 */
import { api } from '@/lib/api'

export interface SlotRequirement {
  shot_type: string
  energy_level: string
  min_duration: number
  max_duration: number
  needs_face: boolean
  setting_hint?: string | null
  description: string
}

export interface TemplateSlot {
  slot_id: string
  type: 'video_placeholder' | 'text_overlay' | 'image_placeholder' | 'logo_placeholder'
  start: number
  end: number
  label: string
  requirement: SlotRequirement | null
}

export interface StyleTemplateV2 {
  version: string
  source_url?: string | null
  duration: number
  aspect_ratio: string
  color_palette: string[]
  pacing: 'fast' | 'medium' | 'slow'
  visual_style: string
  caption_style: Record<string, unknown>
  music_mood?: string | null
  slots: TemplateSlot[]
  transitions: Array<{ at: number; effect: string }>
}

export interface StyleIntelligenceJobStatus {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  result?: {
    step?: string
    template_id?: string
    template_key?: string
    template?: StyleTemplateV2
  }
  error?: string
}

export async function startStyleAnalysis(
  projectId: string,
  input: { url?: string; videoKey?: string; name?: string }
) {
  return api.post<{ job_id: string; status: string }>('/style-intelligence/analyze', {
    project_id: projectId,
    url: input.url,
    video_key: input.videoKey,
    name: input.name ?? 'Style template',
  })
}

export async function getStyleIntelligenceJob(jobId: string) {
  return api.get<StyleIntelligenceJobStatus>(`/style-intelligence/jobs/${jobId}`)
}
