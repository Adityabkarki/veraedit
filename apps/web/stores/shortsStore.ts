/**
 * Shorts Store — Zustand
 *
 * Manages the list of extracted short-clip candidates with virality scores,
 * per-platform scores, hook options, export status, and virality breakdown.
 *
 * Platform priority for Nepal: YouTube › Facebook › TikTok › Instagram
 */

import { create } from 'zustand'
import {
  DEFAULT_SHORT_FRAMING,
  framingFromReframe,
  type ShortFraming,
} from '@/lib/shortFraming'
import {
  DEFAULT_SHORT_STYLING,
  buildShortOverlayFromTemplate,
  buildShortOverlayFromTextEffect,
  resolveShortBrandKit,
  type ShortStyling,
} from '@/lib/shortStyling'
import type { BrandKit } from '@/stores/visualLibraryStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'

export type { ShortFraming, ShortStyling }

// ── Types ─────────────────────────────────────────────────────────────────────

export type Platform    = 'youtube' | 'facebook' | 'tiktok' | 'instagram'
export type ShortStatus = 'pending' | 'approved' | 'exporting' | 'exported'
export type SortBy      = 'virality' | 'duration' | 'created'

export interface ViralityFactor {
  label:    string
  points:   number    // positive = green, negative = red
  positive: boolean
}

export interface Short {
  id:              string
  title:           string
  activeHook:      string
  hooks:           string[]
  startTime:       number
  endTime:         number
  duration:        number
  viralityScore:   number
  platformScores:  Record<Platform, number>
  status:          ShortStatus
  thumbnailColor:  string
  /** Score breakdown shown in the virality popover */
  viralityFactors: ViralityFactor[]
  /** AI tip shown below breakdown */
  viralityTip?:    string
  /** 9:16 crop pan / auto reframe from AI */
  framing:         ShortFraming
  /** Brand, templates, effects — scoped to this short only */
  styling:         ShortStyling
  /** Multi-segment topic compilation */
  segments?:       { startTime: number; endTime: number }[]
  segmentCount?:   number
  compilationType?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const PLATFORM_ORDER: Platform[] = ['youtube', 'facebook', 'tiktok', 'instagram']

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube:   'YouTube',
  facebook:  'Facebook',
  tiktok:    'TikTok',
  instagram: 'Instagram',
}

// ── Placeholder data ──────────────────────────────────────────────────────────

export const INITIAL_SHORTS: Short[] = [
  {
    id: 'sh1',
    title: 'Strong hook at 1:12',
    activeHook: '"You\'ve been doing this wrong the whole time"',
    hooks: [
      '"You\'ve been doing this wrong the whole time"',
      '"Nobody talks about this — but it changes everything"',
      '"I tried this for 30 days — here\'s what happened"',
      '"The one thing experts don\'t want you to know"',
      '"This 30-second clip changed how I see everything"',
    ],
    startTime: 72, endTime: 105, duration: 33,
    viralityScore: 88,
    platformScores: { youtube: 91, facebook: 87, tiktok: 93, instagram: 84 },
    status: 'pending',
    thumbnailColor: '#3B82F6',
    viralityFactors: [
      { label: 'Strong hook (first 0.5s)',  points: 25, positive: true  },
      { label: 'Complete story arc',        points: 20, positive: true  },
      { label: 'High energy delivery',      points: 18, positive: true  },
      { label: 'Quotable insight',          points: 15, positive: true  },
      { label: 'Fast pacing',               points: 16, positive: true  },
      { label: 'No explicit CTA',           points: 10, positive: false },
    ],
    viralityTip: 'Add a "like and subscribe" CTA at the end to push past 90.',
    framing: { panX: 0.5, mode: 'auto' },
    styling: { ...DEFAULT_SHORT_STYLING },
  },
  {
    id: 'sh2',
    title: 'Surprising stat at 4:30',
    activeHook: '"90% of people miss this statistic completely"',
    hooks: [
      '"90% of people miss this statistic completely"',
      '"This number will shock you"',
      '"The data nobody is sharing"',
      '"I couldn\'t believe this stat when I first saw it"',
      '"Here\'s the number that changes everything"',
    ],
    startTime: 270, endTime: 315, duration: 45,
    viralityScore: 82,
    platformScores: { youtube: 85, facebook: 88, tiktok: 78, instagram: 80 },
    status: 'pending',
    thumbnailColor: '#8B5CF6',
    viralityFactors: [
      { label: 'Strong opening stat',       points: 22, positive: true  },
      { label: 'Clear narrative structure', points: 18, positive: true  },
      { label: 'Memorable hook line',       points: 17, positive: true  },
      { label: 'Good sharability',          points: 15, positive: true  },
      { label: 'Concise (< 60s)',           points: 12, positive: true  },
      { label: 'Slow intro (3s)',           points: 5,  positive: false },
      { label: 'No CTA',                   points: 7,  positive: false },
    ],
    viralityTip: 'Cut the first 3s to start directly with the statistic.',
    framing: { panX: 0.5, mode: 'auto' },
    styling: { ...DEFAULT_SHORT_STYLING },
  },
  {
    id: 'sh3',
    title: 'Key insight at 11:45',
    activeHook: '"The simplest trick that doubled my results"',
    hooks: [
      '"The simplest trick that doubled my results"',
      '"Why I stopped doing what everyone recommends"',
      '"This tiny change made a huge difference"',
      '"The insight I wish I\'d had years ago"',
      '"Here\'s the shortcut nobody tells you about"',
    ],
    startTime: 705, endTime: 746, duration: 41,
    viralityScore: 79,
    platformScores: { youtube: 82, facebook: 79, tiktok: 76, instagram: 77 },
    status: 'pending',
    thumbnailColor: '#10B981',
    viralityFactors: [
      { label: 'Actionable key insight',    points: 20, positive: true  },
      { label: 'Relatable topic',           points: 18, positive: true  },
      { label: 'Good pacing',               points: 15, positive: true  },
      { label: 'Personal story element',    points: 12, positive: true  },
      { label: 'Weak hook (< 60 score)',    points: 8,  positive: false },
      { label: 'Low visual energy',         points: 5,  positive: false },
    ],
    viralityTip: 'Strengthen the first 3 seconds with a bold statement.',
    framing: { panX: 0.5, mode: 'auto', reframeStrategy: 'speaker_track' },
    styling: { ...DEFAULT_SHORT_STYLING },
  },
  {
    id: 'sh4',
    title: 'Strong closing at 17:30',
    activeHook: '"If you remember one thing from this video, make it this"',
    hooks: [
      '"If you remember one thing from this video, make it this"',
      '"The most important lesson I\'ve learned"',
      '"This is the final piece of the puzzle"',
      '"Don\'t skip this — it ties everything together"',
      '"Here\'s the bottom line after everything we covered"',
    ],
    startTime: 1050, endTime: 1095, duration: 45,
    viralityScore: 71,
    platformScores: { youtube: 75, facebook: 73, tiktok: 68, instagram: 70 },
    status: 'pending',
    thumbnailColor: '#F59E0B',
    viralityFactors: [
      { label: 'Strong CTA',                points: 20, positive: true  },
      { label: 'Clear message',             points: 18, positive: true  },
      { label: 'Good clip length',          points: 15, positive: true  },
      { label: 'Concise delivery',          points: 14, positive: true  },
      { label: 'Weak opening hook',         points: 10, positive: false },
      { label: 'Low novelty angle',         points: 5,  positive: false },
    ],
    viralityTip: 'Move the CTA to the beginning — don\'t make viewers wait.',
    framing: { panX: 0.5, mode: 'auto' },
    styling: { ...DEFAULT_SHORT_STYLING },
  },
  {
    id: 'sh5',
    title: 'Story moment at 8:15',
    activeHook: '"This is the exact moment everything changed for me"',
    hooks: [
      '"This is the exact moment everything changed for me"',
      '"I remember this day clearly — it was a turning point"',
      '"The story behind why I started doing this"',
      '"Real story: what actually happened that day"',
      '"Behind the scenes of my biggest breakthrough"',
    ],
    startTime: 495, endTime: 553, duration: 58,
    viralityScore: 65,
    platformScores: { youtube: 68, facebook: 72, tiktok: 60, instagram: 64 },
    status: 'pending',
    thumbnailColor: '#EC4899',
    viralityFactors: [
      { label: 'Authentic storytelling',    points: 18, positive: true  },
      { label: 'Emotional resonance',       points: 15, positive: true  },
      { label: 'Relatable topic',           points: 14, positive: true  },
      { label: 'Weak hook',                 points: 12, positive: false },
      { label: 'Slow pacing (58s)',         points: 10, positive: false },
      { label: 'No hook pattern variety',   points: 5,  positive: false },
    ],
    viralityTip: 'Speed up the first 5 seconds — cut to the emotional moment faster.',
    framing: { panX: 0.5, mode: 'auto', reframeStrategy: 'speaker_track' },
    styling: { ...DEFAULT_SHORT_STYLING },
  },
]

// ── Store ─────────────────────────────────────────────────────────────────────

/** A short as returned by GET /projects/{id}/assets/{id}/shorts. */
export interface ApiShort {
  id:                  string
  title?:              string
  start_time?:         number | null
  end_time?:           number | null
  duration?:           number | null
  viral_score?:        number
  nepal_weighted_score?: number
  platform_scores?:    Record<string, number>
  nepali_hooks?:       string[]
  status?:             string
  action?:             Record<string, unknown>
  reframe?:            Record<string, unknown>
}

function shortScore(v: number | undefined, fallback = 70): number {
  if (v == null) return fallback
  return Math.round(v <= 1 ? v * 100 : v)
}

/** Resolve start/end/duration from API fields or nested suggestion action. */
export function resolveShortTimes(s: ApiShort): { startTime: number; endTime: number; duration: number } {
  const action = s.action ?? {}
  const startTime = Number(s.start_time ?? action.start_time ?? 0)
  const endTime = Number(
    s.end_time ?? action.end_time ?? startTime + Number(s.duration ?? action.duration ?? 30),
  )
  const safeEnd = endTime > startTime ? endTime : startTime + 30
  return {
    startTime,
    endTime: safeEnd,
    duration: Number(s.duration ?? action.duration ?? Math.round(safeEnd - startTime)),
  }
}

function mapShortStatus(s: string | undefined): ShortStatus {
  switch ((s || '').toLowerCase()) {
    case 'accepted':
    case 'approved':
    case 'rendered':
    case 'applied':
      return 'approved'
    case 'rendering':
      return 'exporting'
    default:
      return 'pending'
  }
}

const SHORT_PALETTE = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899']

export function mapApiShort(s: ApiShort, index: number): Short {
  const ps = s.platform_scores ?? {}
  const hooks = (s.nepali_hooks ?? []).filter(Boolean)
  const action = s.action ?? {}
  const startTime = Number(s.start_time ?? action.start_time ?? 0)
  const endTimeRaw = Number(
    s.end_time ?? action.end_time ?? startTime + Number(s.duration ?? action.duration ?? 30),
  )
  const endTime = endTimeRaw > startTime ? endTimeRaw : startTime + 30
  const duration = Number(s.duration ?? action.duration ?? Math.round(endTime - startTime))
  const reframe = (action.reframe ?? s.reframe) as Record<string, unknown> | undefined
  const segmentCount = Number(action.segment_count ?? (action.segments as unknown[] | undefined)?.length ?? 0)
  const compilationType = String(action.compilation_type ?? '')
  const rawSegments = (action.segments as { start_time?: number; end_time?: number; start?: number; end?: number }[] | undefined) ?? []
  const segments = rawSegments.length > 1
    ? rawSegments.map((seg) => ({
        startTime: Number(seg.start_time ?? seg.start ?? 0),
        endTime: Number(seg.end_time ?? seg.end ?? 0),
      })).filter((s) => s.endTime > s.startTime)
    : undefined
  const titleSuffix = segmentCount > 1 ? ` (${segmentCount} moments)` : ''
  return {
    id:             s.id,
    title:          (s.title || `Short ${index + 1}`) + titleSuffix,
    activeHook:     hooks[0] ?? '',
    hooks:          hooks.length > 0 ? hooks : [''],
    startTime,
    endTime,
    duration,
    viralityScore:  shortScore(s.viral_score ?? s.nepal_weighted_score),
    platformScores: {
      youtube:   shortScore(ps.youtube, 0),
      facebook:  shortScore(ps.facebook, 0),
      tiktok:    shortScore(ps.tiktok, 0),
      instagram: shortScore(ps.instagram, 0),
    },
    status:         mapShortStatus(s.status),
    thumbnailColor: SHORT_PALETTE[index % SHORT_PALETTE.length],
    viralityFactors: [],
    framing: framingFromReframe(reframe),
    styling: { ...DEFAULT_SHORT_STYLING },
    segments,
    segmentCount: segmentCount > 1 ? segmentCount : undefined,
    compilationType: compilationType || undefined,
  }
}

export interface ShortsState {
  shorts:           Short[]
  activePlatform:   Platform | 'all'
  sortBy:           SortBy
  /** IDs selected via checkbox (bulk operations) */
  selectedShortIds: string[]
  loaded:           boolean
  /** Card currently playing in-card preview (Shorts mode) */
  activePreviewId:  string | null

  loadFromApi:          (apiShorts: ApiShort[]) => void
  loadDemoData:         () => void
  setActivePlatform:    (p: Platform | 'all') => void
  setSortBy:            (s: SortBy) => void
  setActiveHook:        (shortId: string, hookIndex: number) => void
  setCustomHook:        (shortId: string, text: string) => void
  approveShort:         (shortId: string) => void
  approveSelected:      () => void
  exportShort:          (shortId: string, platform?: Platform) => void
  exportSelected:       () => void
  toggleShortSelection: (id: string) => void
  selectAllShorts:      () => void
  clearShortSelection:  () => void
  resetShorts:          () => void
  setActivePreviewId:   (id: string | null) => void
  setShortFraming:      (shortId: string, patch: Partial<ShortFraming>) => void
  resetShortFramingAuto:(shortId: string) => void
  applyShortBrandFromProject: (shortId: string, brandKit: BrandKit) => void
  applyShortFilter:           (shortId: string, filterId: string) => void
  applyShortSpeed:            (shortId: string, speedId: string) => void
  addShortTemplate:           (shortId: string, templateId: string) => void
  addShortTextEffect:         (shortId: string, effectId: string) => void
  removeShortOverlay:         (shortId: string, overlayId: string) => void
  applyShortStylePreset:      (shortId: string, presetId: string, presetName: string) => void
  clearShortStyling:          (shortId: string) => void

  sortedShorts: () => Short[]
  filteredShorts: () => Short[]   // sorted + filtered by platform
}

export const useShortsStore = create<ShortsState>((set, get) => ({
  shorts:           [],
  activePlatform:   'all',
  sortBy:           'virality',
  selectedShortIds: [],
  loaded:           false,
  activePreviewId:  null,

  loadFromApi: (apiShorts) =>
    set({
      shorts: apiShorts.map((s, i) => mapApiShort(s, i)),
      selectedShortIds: [],
      loaded: true,
    }),

  loadDemoData: () =>
    set({
      shorts:           INITIAL_SHORTS.map((s) => ({ ...s })),
      activePlatform:   'all',
      sortBy:           'virality',
      selectedShortIds: [],
      loaded:           false,
    }),

  setActivePlatform: (p) => set({ activePlatform: p }),
  setSortBy:         (s) => set({ sortBy: s }),

  setActiveHook: (shortId, hookIndex) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId && hookIndex >= 0 && hookIndex < sh.hooks.length
          ? { ...sh, activeHook: sh.hooks[hookIndex] }
          : sh
      ),
    })),

  setCustomHook: (shortId, text) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId ? { ...sh, activeHook: text } : sh
      ),
    })),

  approveShort: (shortId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId ? { ...sh, status: 'approved' } : sh
      ),
    })),

  approveSelected: () =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        s.selectedShortIds.includes(sh.id) ? { ...sh, status: 'approved' } : sh
      ),
      selectedShortIds: [],
    })),

  exportShort: (shortId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId ? { ...sh, status: 'exporting' } : sh
      ),
    })),

  exportSelected: () =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        s.selectedShortIds.includes(sh.id) && sh.status === 'approved'
          ? { ...sh, status: 'exporting' }
          : sh
      ),
      selectedShortIds: [],
    })),

  toggleShortSelection: (id) =>
    set((s) => ({
      selectedShortIds: s.selectedShortIds.includes(id)
        ? s.selectedShortIds.filter((x) => x !== id)
        : [...s.selectedShortIds, id],
    })),

  selectAllShorts: () =>
    set((s) => ({ selectedShortIds: s.shorts.map((sh) => sh.id) })),

  clearShortSelection: () => set({ selectedShortIds: [] }),

  setActivePreviewId: (id) => set({ activePreviewId: id }),

  setShortFraming: (shortId, patch) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId
          ? { ...sh, framing: { ...sh.framing, ...patch } }
          : sh
      ),
    })),

  resetShortFramingAuto: (shortId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) => {
        if (sh.id !== shortId) return sh
        return {
          ...sh,
          framing: {
            panX: 0.5,
            mode: 'auto',
            reframeStrategy: sh.framing.reframeStrategy,
          },
        }
      }),
    })),

  applyShortBrandFromProject: (shortId, brandKit) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId
          ? {
              ...sh,
              styling: {
                ...sh.styling,
                brandKit: { ...brandKit },
                brandApplied: true,
                overlays: sh.styling.overlays.map((o) => ({
                  ...o,
                  color: brandKit.primaryColor,
                })),
              },
            }
          : sh
      ),
    })),

  applyShortFilter: (shortId, filterId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId
          ? { ...sh, styling: { ...sh.styling, filterId } }
          : sh
      ),
    })),

  applyShortSpeed: (shortId, speedId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId
          ? { ...sh, styling: { ...sh.styling, speedId } }
          : sh
      ),
    })),

  addShortTemplate: (shortId, templateId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) => {
        if (sh.id !== shortId) return sh
        const brand = resolveShortBrandKit(sh.styling)
        const overlay = buildShortOverlayFromTemplate(
          templateId,
          sh.duration,
          brand,
          sh.styling.brandApplied,
          useVisualLibraryStore.getState().contentLanguage,
        )
        if (!overlay) return sh
        return {
          ...sh,
          styling: {
            ...sh.styling,
            overlays: [...sh.styling.overlays, overlay],
          },
        }
      }),
    })),

  addShortTextEffect: (shortId, effectId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) => {
        if (sh.id !== shortId) return sh
        const brand = resolveShortBrandKit(sh.styling)
        const overlay = buildShortOverlayFromTextEffect(
          effectId,
          sh.duration,
          brand,
          sh.styling.brandApplied,
          useVisualLibraryStore.getState().contentLanguage,
        )
        if (!overlay) return sh
        return {
          ...sh,
          styling: {
            ...sh.styling,
            overlays: [...sh.styling.overlays, overlay],
          },
        }
      }),
    })),

  removeShortOverlay: (shortId, overlayId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId
          ? {
              ...sh,
              styling: {
                ...sh.styling,
                overlays: sh.styling.overlays.filter((o) => o.id !== overlayId),
              },
            }
          : sh
      ),
    })),

  applyShortStylePreset: (shortId, presetId, presetName) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId
          ? {
              ...sh,
              styling: {
                ...sh.styling,
                stylePresetId: presetId,
                stylePresetName: presetName,
              },
            }
          : sh
      ),
    })),

  clearShortStyling: (shortId) =>
    set((s) => ({
      shorts: s.shorts.map((sh) =>
        sh.id === shortId
          ? { ...sh, styling: { ...DEFAULT_SHORT_STYLING } }
          : sh
      ),
    })),

  resetShorts: () =>
    set({
      shorts:           [],
      activePlatform:   'all',
      sortBy:           'virality',
      selectedShortIds: [],
      loaded:           false,
      activePreviewId:  null,
    }),

  sortedShorts: () => {
    const { shorts, sortBy } = get()
    return [...shorts].sort((a, b) => {
      if (sortBy === 'virality')  return b.viralityScore - a.viralityScore
      if (sortBy === 'duration')  return a.duration - b.duration
      return 0 // 'created' — preserve insertion order
    })
  },

  filteredShorts: () => {
    const { activePlatform } = get()
    const sorted = get().sortedShorts()
    if (activePlatform === 'all') return sorted
    return [...sorted].sort(
      (a, b) => b.platformScores[activePlatform] - a.platformScores[activePlatform]
    )
  },
}))
