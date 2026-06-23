/**
 * Effects Store — Zustand
 *
 * Manages the EffectsDrawer state: open/closed, active tab, search query,
 * recently-used effect IDs, and the catalogue of transitions / filters /
 * text templates / speed presets.
 *
 * Applying an effect updates the timeline (filters, transitions, speed, text)
 * and records it in recentlyUsed for the drawer UI.
 */

import { create } from 'zustand'
import { applyEffectToTimeline } from '@/lib/applyEffects'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type EffectTab = 'tools' | 'transitions' | 'filters' | 'text' | 'speed'

export interface Transition {
  id:           string
  name:         string
  description:  string
  /** Default duration in seconds */
  duration:     number
  category:     'cut' | 'smooth' | 'dynamic'
  /** Preview tile background colour */
  previewColor: string
  /** CSS animation class to show in the preview tile */
  previewAnim?: string
}

export interface ColorFilter {
  id:           string
  name:         string
  description:  string
  previewColor: string
  /** CSS filter string applied to preview tile */
  cssFilter:    string
}

export interface TextTemplate {
  id:             string
  name:           string
  category:       'lower-third' | 'title' | 'quote' | 'stat' | 'cta'
  style:          'bold' | 'minimal' | 'corporate' | 'fun'
  /** Preview text (Devanagari or English) */
  previewText:    string
  previewColor:   string
  /** Font class: font-nepali for Devanagari-capable templates */
  nepaliReady:    boolean
}

export interface SpeedPreset {
  id:          string
  name:        string
  description: string
  /** e.g. 2.0 = 2× fast */
  multiplier:  number
  /** Visual curve shape */
  curve:       'linear' | 'ramp-up' | 'ramp-down' | 'plateau'
  icon:        string
  color:       string
}

// ── Catalogues ────────────────────────────────────────────────────────────────

export const TRANSITIONS: Transition[] = [
  { id: 'cut',        name: 'Cut',        description: 'Instant cut',                      duration: 0,    category: 'cut',     previewColor: '#1F2937' },
  { id: 'dissolve',   name: 'Dissolve',   description: 'Smooth cross-dissolve',            duration: 0.5,  category: 'smooth',  previewColor: '#374151' },
  { id: 'fade-black', name: 'Fade Black', description: 'Dip to black between clips',       duration: 0.6,  category: 'smooth',  previewColor: '#111827' },
  { id: 'fade-white', name: 'Fade White', description: 'Dip to white between clips',       duration: 0.6,  category: 'smooth',  previewColor: '#F9FAFB' },
  { id: 'zoom-in',    name: 'Zoom In',    description: 'Zoom into the next clip',          duration: 0.5,  category: 'dynamic', previewColor: '#1D4ED8' },
  { id: 'zoom-out',   name: 'Zoom Out',   description: 'Zoom out from the current clip',   duration: 0.5,  category: 'dynamic', previewColor: '#1E40AF' },
  { id: 'slide-l',    name: 'Slide Left', description: 'Next clip slides in from right',   duration: 0.4,  category: 'smooth',  previewColor: '#065F46' },
  { id: 'slide-r',    name: 'Slide Right',description: 'Next clip slides in from left',    duration: 0.4,  category: 'smooth',  previewColor: '#064E3B' },
  { id: 'wipe',       name: 'Wipe',       description: 'Horizontal wipe transition',       duration: 0.4,  category: 'smooth',  previewColor: '#92400E' },
  { id: 'whip-pan',   name: 'Whip Pan',   description: 'Fast pan blur between clips',      duration: 0.3,  category: 'dynamic', previewColor: '#7C3AED' },
  { id: 'blur',       name: 'Blur',       description: 'Blur in / blur out',               duration: 0.5,  category: 'smooth',  previewColor: '#4C1D95' },
  { id: 'glitch',     name: 'Glitch',     description: 'Digital glitch effect',            duration: 0.3,  category: 'dynamic', previewColor: '#DC2626' },
]

export const COLOR_FILTERS: ColorFilter[] = [
  { id: 'none',     name: 'None',     description: 'No filter',                 previewColor: '#374151', cssFilter: 'none'                                            },
  { id: 'warm',     name: 'Warm',     description: 'Warm sunset tones',         previewColor: '#92400E', cssFilter: 'sepia(30%) saturate(120%) hue-rotate(-10deg)'   },
  { id: 'cold',     name: 'Cold',     description: 'Cool blue tones',           previewColor: '#1E3A5F', cssFilter: 'sepia(10%) saturate(80%) hue-rotate(200deg)'    },
  { id: 'vintage',  name: 'Vintage',  description: 'Aged film look',            previewColor: '#78350F', cssFilter: 'sepia(60%) contrast(90%) brightness(110%)'      },
  { id: 'dramatic', name: 'Dramatic', description: 'High contrast cinematic',   previewColor: '#1F2937', cssFilter: 'contrast(130%) saturate(80%)'                    },
  { id: 'bw',       name: 'B&W',      description: 'Classic black and white',   previewColor: '#6B7280', cssFilter: 'grayscale(100%)'                                 },
  { id: 'vibrant',  name: 'Vibrant',  description: 'Boosted saturation',        previewColor: '#047857', cssFilter: 'saturate(150%) contrast(110%)'                   },
  { id: 'fade',     name: 'Fade',     description: 'Lifted shadows film fade',  previewColor: '#9CA3AF', cssFilter: 'brightness(115%) contrast(85%) saturate(90%)'   },
]

export const TEXT_TEMPLATES: TextTemplate[] = [
  // Lower Third
  { id: 'lt-bold',    name: 'Bold Lower',    category: 'lower-third', style: 'bold',      previewText: 'Speaker Name',            previewColor: '#C41E3A', nepaliReady: true  },
  { id: 'lt-minimal', name: 'Clean Lower',   category: 'lower-third', style: 'minimal',   previewText: 'Speaker Name',            previewColor: '#374151', nepaliReady: true  },
  { id: 'lt-corp',    name: 'Corp Lower',    category: 'lower-third', style: 'corporate', previewText: 'Speaker · Role',          previewColor: '#1E3A5F', nepaliReady: false },
  { id: 'lt-fun',     name: 'Fun Lower',     category: 'lower-third', style: 'fun',       previewText: 'Speaker Name ✨',         previewColor: '#7C3AED', nepaliReady: true  },
  // Title Card
  { id: 'tc-bold',    name: 'Bold Title',    category: 'title',       style: 'bold',      previewText: 'Episode Title',           previewColor: '#111827', nepaliReady: true  },
  { id: 'tc-minimal', name: 'Clean Title',   category: 'title',       style: 'minimal',   previewText: 'Episode Title',           previewColor: '#1F2937', nepaliReady: true  },
  // Quote
  { id: 'qt-bold',    name: 'Bold Quote',    category: 'quote',       style: 'bold',      previewText: '"यो video महत्त्वपूर्ण छ"', previewColor: '#1D4ED8', nepaliReady: true  },
  { id: 'qt-minimal', name: 'Clean Quote',   category: 'quote',       style: 'minimal',   previewText: '"Key insight here"',      previewColor: '#374151', nepaliReady: true  },
  // Stat
  { id: 'st-bold',    name: 'Stat Card',     category: 'stat',        style: 'bold',      previewText: '90% of viewers',         previewColor: '#065F46', nepaliReady: false },
  { id: 'st-minimal', name: 'Stat Minimal',  category: 'stat',        style: 'minimal',   previewText: '1 लाख+ views',           previewColor: '#064E3B', nepaliReady: true  },
  // CTA
  { id: 'ct-bold',    name: 'Subscribe CTA', category: 'cta',         style: 'bold',      previewText: 'Subscribe Now!',         previewColor: '#C41E3A', nepaliReady: false },
  { id: 'ct-minimal', name: 'Follow CTA',    category: 'cta',         style: 'minimal',   previewText: 'Follow for more',        previewColor: '#374151', nepaliReady: false },
  { id: 'ct-nepali',  name: 'Nepali CTA',    category: 'cta',         style: 'bold',      previewText: 'Subscribe गर्नुस् →',    previewColor: '#92400E', nepaliReady: true  },
  { id: 'ct-fun',     name: 'Fun CTA',       category: 'cta',         style: 'fun',       previewText: 'Smash that like! 👍',     previewColor: '#7C3AED', nepaliReady: false },
  // Corporate / Tutorial style
  { id: 'ch-card',    name: 'Chapter Card',  category: 'title',       style: 'corporate', previewText: 'Chapter 1: Introduction', previewColor: '#1E3A5F', nepaliReady: true  },
  { id: 'br-card',    name: 'B-Roll Label',  category: 'lower-third', style: 'corporate', previewText: 'Location / Context',     previewColor: '#1F2937', nepaliReady: false },
]

export const SPEED_PRESETS: SpeedPreset[] = [
  { id: 'normal',   name: 'Normal',     description: 'Original speed',                multiplier: 1,    curve: 'linear',   icon: '→',  color: '#374151' },
  { id: 'fast-2x',  name: '2× Fast',    description: 'Double speed — great for B-roll', multiplier: 2,  curve: 'linear',   icon: '⚡',  color: '#1D4ED8' },
  { id: 'fast-3x',  name: '3× Fast',    description: 'Triple speed — time-lapse feel', multiplier: 3,   curve: 'linear',   icon: '⚡⚡', color: '#2563EB' },
  { id: 'slow-2x',  name: '½ Slow-mo',  description: 'Half speed — smooth motion',    multiplier: 0.5,  curve: 'linear',   icon: '🐢',  color: '#065F46' },
  { id: 'slow-4x',  name: '¼ Slow-mo',  description: 'Quarter speed — dramatic effect', multiplier: 0.25, curve: 'linear', icon: '🐢🐢', color: '#047857' },
  { id: 'ramp',     name: 'Speed Ramp', description: 'Starts slow, ramps to fast',   multiplier: 1,    curve: 'ramp-up',  icon: '📈',  color: '#7C3AED' },
]

const RECENTLY_USED_MAX = 8

// ── Store ─────────────────────────────────────────────────────────────────────

export interface EffectsState {
  isOpen:       boolean
  activeTab:    EffectTab
  searchQuery:  string
  /** IDs of recently applied effects (most recent first) */
  recentlyUsed: string[]
  /** Last effect applied (for display feedback) */
  lastApplied:  string | null
  /** In/Out markers for keyframed effect range (timeline seconds) */
  effectRangeIn:  number | null
  effectRangeOut: number | null
  /** Effect clip open in keyframe editor */
  editingEffectClipId: string | null
  /** Charts & processes: insert as fullscreen B-Roll layer instead of corner overlay */
  insertChartsAsBroll: boolean

  openDrawer:         () => void
  closeDrawer:        () => void
  toggleDrawer:       () => void
  setActiveTab:       (tab: EffectTab) => void
  setSearchQuery:     (q: string) => void
  applyEffect:        (effectId: string) => void
  clearLastApplied:   () => void
  setEffectRangeIn:   () => void
  setEffectRangeOut:  () => void
  clearEffectRange:   () => void
  startEditingEffect: (clipId: string) => void
  stopEditingEffect:  () => void
  setInsertChartsAsBroll: (on: boolean) => void

  filteredTransitions:   () => Transition[]
  filteredFilters:       () => ColorFilter[]
  filteredTextTemplates: () => TextTemplate[]
  filteredSpeedPresets:  () => SpeedPreset[]
}

function matchesSearch(name: string, description: string, q: string): boolean {
  const lower = q.toLowerCase()
  return name.toLowerCase().includes(lower) || description.toLowerCase().includes(lower)
}

export const useEffectsStore = create<EffectsState>((set, get) => ({
  isOpen:       false,
  activeTab:    'tools',
  searchQuery:  '',
  recentlyUsed: [],
  lastApplied:  null,
  effectRangeIn:  null,
  effectRangeOut: null,
  editingEffectClipId: null,
  insertChartsAsBroll: false,

  openDrawer: () => {
    useUIStore.setState({ aiPanelOpen: true, rightPanelMode: 'effects' })
    set({ isOpen: true })
  },

  closeDrawer: () => {
    const ui = useUIStore.getState()
    if (ui.rightPanelMode === 'effects') {
      ui.setRightPanelMode('ai')
    }
    set({ isOpen: false, searchQuery: '' })
  },

  toggleDrawer: () => {
    const open = get().isOpen
    if (open) {
      get().closeDrawer()
    } else {
      get().openDrawer()
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab, searchQuery: '' }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  applyEffect: (effectId) => {
    const tab = get().activeTab
    applyEffectToTimeline(effectId, tab)
    set((s) => {
      const updated = [effectId, ...s.recentlyUsed.filter((id) => id !== effectId)]
        .slice(0, RECENTLY_USED_MAX)
      return { recentlyUsed: updated, lastApplied: effectId }
    })
  },

  clearLastApplied: () => set({ lastApplied: null }),

  setEffectRangeIn: () => {
    const t = useTimelineStore.getState().playheadTime
    set({ effectRangeIn: t })
  },

  setEffectRangeOut: () => {
    const t = useTimelineStore.getState().playheadTime
    set({ effectRangeOut: t })
  },

  clearEffectRange: () => set({ effectRangeIn: null, effectRangeOut: null }),

  startEditingEffect: (clipId) => set({ editingEffectClipId: clipId }),
  stopEditingEffect:  () => set({ editingEffectClipId: null }),

  setInsertChartsAsBroll: (on) => set({ insertChartsAsBroll: on }),

  filteredTransitions: () => {
    const { searchQuery } = get()
    if (!searchQuery.trim()) return TRANSITIONS
    return TRANSITIONS.filter((t) => matchesSearch(t.name, t.description, searchQuery))
  },

  filteredFilters: () => {
    const { searchQuery } = get()
    if (!searchQuery.trim()) return COLOR_FILTERS
    return COLOR_FILTERS.filter((f) => matchesSearch(f.name, f.description, searchQuery))
  },

  filteredTextTemplates: () => {
    const { searchQuery } = get()
    if (!searchQuery.trim()) return TEXT_TEMPLATES
    return TEXT_TEMPLATES.filter((t) => matchesSearch(t.name, t.previewText, searchQuery))
  },

  filteredSpeedPresets: () => {
    const { searchQuery } = get()
    if (!searchQuery.trim()) return SPEED_PRESETS
    return SPEED_PRESETS.filter((p) => matchesSearch(p.name, p.description, searchQuery))
  },
}))
