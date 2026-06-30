/**
 * Gap resolution API (Phase 02).
 */
import { api } from '@/lib/api'
import type { StyleTemplateV2 } from '@/lib/styleIntelligenceApi'

export type SlotMatchStatus = 'matched' | 'partial' | 'missing'

export interface SlotMatch {
  status: SlotMatchStatus
  asset_id: string | null
  score: number
  storage_key: string | null
}

export interface AnnotatedSlot {
  slot_id: string
  type: string
  label: string
  start: number
  end: number
  requirement?: { description: string } | null
  match: SlotMatch | null
}

export interface AnnotatedTemplate extends StyleTemplateV2 {
  slots: AnnotatedSlot[]
}

export async function matchTemplateToLibrary(template: StyleTemplateV2) {
  return api.post<AnnotatedTemplate>('/gap-resolution/match', { template })
}

export async function generateSlotAsset(input: {
  slotType: 'video_placeholder' | 'image_placeholder'
  requirementDescription: string
  aspectRatio: string
}) {
  return api.post<{
    asset_id: string
    storage_key: string
    url: string
    type: 'image' | 'video'
    is_generated_standin: boolean
    source: 'ai_generated'
  }>('/gap-resolution/generate-slot', {
    slot_type: input.slotType,
    requirement_description: input.requirementDescription,
    aspect_ratio: input.aspectRatio,
  })
}
