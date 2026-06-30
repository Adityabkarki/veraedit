/**
 * Asset Library API client (Phase 00).
 */
import { api } from '@/lib/api'

export interface AssetTags {
  shot_type: string
  subject_count: number
  has_face: boolean
  setting: string
  energy_level: string
  emotion: string
  dominant_colors: string[]
  aspect_ratio: string
  is_landscape_orientation: boolean
  has_text_overlay: boolean
  has_spoken_audio: boolean
  duration_seconds: number | null
  description: string
  tagging_confidence: number
}

export interface LibraryAsset {
  id: string
  storage_key: string
  thumb_key: string | null
  asset_type: 'video' | 'image' | 'logo'
  source: 'uploaded' | 'ai_generated'
  tags: AssetTags
  thumb_url?: string | null
}

export async function listLibraryAssets() {
  return api.get<LibraryAsset[]>('/library')
}

export async function uploadLibraryAsset(file: File) {
  const form = new FormData()
  form.append('file', file)
  return api.postForm<LibraryAsset>('/library/upload', form)
}
