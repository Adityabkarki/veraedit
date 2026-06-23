/**
 * Highlights Store — promo clips with per-platform aspect packs.
 */

import { create } from 'zustand'

export type HighlightPlatform =
  | 'youtube'
  | 'tiktok'
  | 'reels'
  | 'instagram_feed'
  | 'linkedin'

export interface PlatformPack {
  platform: HighlightPlatform
  aspect_ratio: string
  width: number
  height: number
  crop: string
  thumbnail_url?: string | null
}

export interface Highlight {
  id: string
  startTime: number
  endTime: number
  duration: number
  title: string
  summary: string
  promoCopyEn: string
  promoCaptionNe: string
  highlightScore: number
  platformPacks: PlatformPack[]
  thumbnailUrl: string | null
  status: string
}

export interface ApiHighlight {
  id: string
  start_time: number
  end_time: number
  duration?: number
  title?: string
  summary?: string
  promo_copy_en?: string
  promo_caption_ne?: string
  highlight_score?: number
  platform_packs?: PlatformPack[]
  thumbnail_url?: string | null
  status?: string
}

interface HighlightsState {
  highlights: Highlight[]
  selectedPlatform: HighlightPlatform | 'all'
  loadFromApi: (rows: ApiHighlight[]) => void
  setSelectedPlatform: (p: HighlightPlatform | 'all') => void
  resetHighlights: () => void
}

export const useHighlightsStore = create<HighlightsState>((set) => ({
  highlights: [],
  selectedPlatform: 'all',

  loadFromApi: (rows) => {
    set({
      highlights: rows.map((h) => ({
        id: h.id,
        startTime: h.start_time,
        endTime: h.end_time,
        duration: h.duration ?? h.end_time - h.start_time,
        title: h.title ?? 'Highlight',
        summary: h.summary ?? '',
        promoCopyEn: h.promo_copy_en ?? '',
        promoCaptionNe: h.promo_caption_ne ?? '',
        highlightScore: Math.round((h.highlight_score ?? 0.7) * 100),
        platformPacks: h.platform_packs ?? [],
        thumbnailUrl: h.thumbnail_url ?? null,
        status: h.status ?? 'detected',
      })),
    })
  },

  setSelectedPlatform: (p) => set({ selectedPlatform: p }),

  resetHighlights: () => set({ highlights: [], selectedPlatform: 'all' }),
}))
