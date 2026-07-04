/**
 * Visual Library Store — Zustand
 *
 * Manages the visual template catalogue for EP-4.11 (Canva-style).
 *
 * Templates are SVG/CSS overlays that can be inserted onto the timeline.
 * Each has English and Nepali text variants, plus a style (bold/minimal/
 * corporate/fun).
 *
 * Brand Kit:
 *   Stores primary/secondary/accent colours and font preference.
 *   "Apply brand" re-colours all template previews to brand colours.
 *   Uses font-nepali (Noto Sans Devanagari) when fontStyle = 'nepali'.
 *
 * Placed Overlays:
 *   Records which templates have been inserted and their timeline position.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  insertVisualTemplateAt,
  insertVisualElementAt,
  removeVisualFromTimeline,
  updateVisualOnTimeline,
} from '@/lib/visualTimelineSync'
import { setPreviewBrandTheme } from '@/lib/brandPreviewTheme'
import { syncMotionClipsToBrandKit } from '@/lib/syncMotionClipsToBrandKit'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TemplateCategory = 'chart' | 'stat' | 'quote' | 'list' | 'lower-third' | 'title'
export type TemplateStyle    = 'bold' | 'minimal' | 'corporate' | 'fun'
export type VisualTab        = 'templates' | 'elements' | 'text' | 'brand' | 'styles'
export type ContentLanguage  = 'en' | 'ne'

export interface VisualTemplate {
  id:               string
  name:             string
  nameNe:           string           // Nepali label
  category:         TemplateCategory
  style:            TemplateStyle
  previewBg:        string           // CSS background colour of preview tile
  previewAccent:    string           // accent/text colour in preview
  textEn:           string           // placeholder text (English)
  textNe:           string           // placeholder text (Nepali)
  subtitleEn?:      string           // secondary line (charts, lower-thirds)
  subtitleNe?:      string
  visualType?:      string           // renderer key on preview + export
  defaultDuration:  number           // seconds when inserted
}

export interface BrandKit {
  primaryColor:   string     // main brand colour
  secondaryColor: string     // secondary/background colour
  accentColor:    string     // highlight / CTA colour
  fontStyle:      'default' | 'nepali'
  logoText:       string     // placeholder logo initials / text
}

export interface PlacedOverlay {
  id:         string
  templateId: string
  startTime:  number   // seconds
  duration:   number   // seconds
  text:       string   // customised text
  secondaryText?: string
  language:   ContentLanguage
  color:      string   // may be brand-coloured
  /** Position on preview (0–100%, top-left origin) */
  xPct?:      number
  yPct?:      number
  /** Scale multiplier (1 = default) */
  scale?:     number
  /** element | template */
  overlayKind?: 'template' | 'element'
  /** visualType key for renderer (emoji_element, bar_chart, …) */
  visualType?: string
  /** For emoji/shape elements */
  emoji?:     string
  widthPct?:  number
  heightPct?: number
  rotation?:  number
  overlayMode?: 'corner' | 'fullscreen'
}

// ── Default brand kit ─────────────────────────────────────────────────────────

export const DEFAULT_BRAND_KIT: BrandKit = {
  primaryColor:   '#C41E3A',
  secondaryColor: '#111113',
  accentColor:    '#F59E0B',
  fontStyle:      'nepali',
  logoText:       'VE',
}

// ── Template catalogue ────────────────────────────────────────────────────────

export const VISUAL_TEMPLATES: VisualTemplate[] = [
  // ── Charts ──────────────────────────────────────────────────────────────────
  {
    id: 'ch-bar',   name: 'Bar Chart',   nameNe: 'बार चार्ट',
    category: 'chart',   style: 'bold', visualType: 'bar_chart',
    previewBg: '#1D4ED8', previewAccent: '#93C5FD',
    textEn: 'Monthly Revenue', textNe: 'मासिक आम्दानी',
    subtitleEn: 'Jan – Jun 2026', subtitleNe: 'जनवरी – जुन २०२६',
    defaultDuration: 5,
  },
  {
    id: 'ch-line',  name: 'Line Chart',  nameNe: 'लाइन चार्ट',
    category: 'chart',   style: 'minimal', visualType: 'line_chart',
    previewBg: '#065F46', previewAccent: '#6EE7B7',
    textEn: 'Growth Trend',    textNe: 'वृद्धि प्रवृत्ति',
    subtitleEn: '+42% YoY', subtitleNe: '+४२% वार्षिक',
    defaultDuration: 5,
  },
  {
    id: 'ch-donut', name: 'Donut Chart', nameNe: 'डोनट चार्ट',
    category: 'chart',   style: 'fun', visualType: 'donut_chart',
    previewBg: '#5B21B6', previewAccent: '#C4B5FD',
    textEn: '68%', textNe: '६८%',
    subtitleEn: 'Market share', subtitleNe: 'बजार हिस्सा',
    defaultDuration: 5,
  },
  {
    id: 'ch-stat',  name: 'Stat Box',    nameNe: 'तथ्याङ्क बक्स',
    category: 'chart',   style: 'corporate', visualType: 'statistic',
    previewBg: '#1E3A5F', previewAccent: '#93C5FD',
    textEn: 'Key Metric',      textNe: 'मुख्य सूचक',
    subtitleEn: 'Updated weekly', subtitleNe: 'साप्ताहिक अपडेट',
    defaultDuration: 4,
  },
  // ── Stats ────────────────────────────────────────────────────────────────────
  {
    id: 'st-big',   name: 'Big Number',  nameNe: 'ठूलो सङ्ख्या',
    category: 'stat',    style: 'bold',
    previewBg: '#7C3AED', previewAccent: '#C4B5FD',
    textEn: '1,00,000+',       textNe: '१ लाख+',
    defaultDuration: 4,
  },
  {
    id: 'st-pct',   name: 'Percentage',  nameNe: 'प्रतिशत',
    category: 'stat',    style: 'bold',
    previewBg: '#C41E3A', previewAccent: '#FCA5A5',
    textEn: '90% Success',     textNe: '९०% सफलता',
    defaultDuration: 4,
  },
  {
    id: 'st-cmp',   name: 'Comparison',  nameNe: 'तुलना',
    category: 'stat',    style: 'corporate',
    previewBg: '#1F2937', previewAccent: '#D1D5DB',
    textEn: 'Before vs After', textNe: 'पहिले vs पछि',
    defaultDuration: 5,
  },
  // ── Quotes ───────────────────────────────────────────────────────────────────
  {
    id: 'qt-pull',  name: 'Pull Quote',  nameNe: 'उद्धरण',
    category: 'quote',   style: 'bold',
    previewBg: '#1D4ED8', previewAccent: '#FFFFFF',
    textEn: '"Key insight here"', textNe: '"मुख्य सन्देश यहाँ"',
    defaultDuration: 6,
  },
  {
    id: 'qt-tweet', name: 'Tweet Style', nameNe: 'ट्वीट शैली',
    category: 'quote',   style: 'minimal',
    previewBg: '#1F2937', previewAccent: '#3B82F6',
    textEn: 'Share this insight!', textNe: 'यो share गर्नुस्!',
    defaultDuration: 5,
  },
  {
    id: 'qt-test',  name: 'Testimonial', nameNe: 'प्रतिक्रिया',
    category: 'quote',   style: 'minimal',
    previewBg: '#374151', previewAccent: '#F3F4F6',
    textEn: '"Excellent product"', textNe: '"उत्कृष्ट उत्पादन"',
    defaultDuration: 6,
  },
  // ── Lists ────────────────────────────────────────────────────────────────────
  {
    id: 'li-bullet',name: 'Bullet List', nameNe: 'बिन्दु सूची',
    category: 'list',    style: 'bold',
    previewBg: '#065F46', previewAccent: '#ECFDF5',
    textEn: '• Point 1\n• Point 2',   textNe: '• बिन्दु १\n• बिन्दु २',
    defaultDuration: 7,
  },
  {
    id: 'li-num',   name: 'Numbered',   nameNe: 'क्रमाङ्कित',
    category: 'list',    style: 'corporate',
    previewBg: '#1E3A5F', previewAccent: '#93C5FD',
    textEn: '1. Step one\n2. Step two', textNe: '१. पहिलो\n२. दोस्रो',
    defaultDuration: 7,
  },
  {
    id: 'li-time',  name: 'Timeline',   nameNe: 'समयरेखा',
    category: 'list',    style: 'fun',
    previewBg: '#7C3AED', previewAccent: '#DDD6FE',
    textEn: '→ Phase 1 → Phase 2',     textNe: '→ चरण १ → चरण २',
    defaultDuration: 6,
  },
  // ── Lower Thirds ─────────────────────────────────────────────────────────────
  {
    id: 'lt-name',  name: 'Name Card',  nameNe: 'नाम कार्ड',
    category: 'lower-third', style: 'bold',
    previewBg: '#C41E3A', previewAccent: '#FFFFFF',
    textEn: 'Speaker Name',   textNe: 'बक्ता नाम',
    defaultDuration: 4,
  },
  {
    id: 'lt-loc',   name: 'Location',   nameNe: 'स्थान',
    category: 'lower-third', style: 'minimal',
    previewBg: '#1F2937', previewAccent: '#9CA3AF',
    textEn: 'Kathmandu, Nepal', textNe: 'काठमाडौँ, नेपाल',
    defaultDuration: 3,
  },
  {
    id: 'lt-topic', name: 'Topic Label', nameNe: 'विषय लेबल',
    category: 'lower-third', style: 'corporate',
    previewBg: '#1E3A5F', previewAccent: '#BFDBFE',
    textEn: 'Topic: Introduction', textNe: 'विषय: परिचय',
    defaultDuration: 4,
  },
  // ── Titles ────────────────────────────────────────────────────────────────────
  {
    id: 'ti-main',  name: 'Main Title',  nameNe: 'मुख्य शीर्षक',
    category: 'title',   style: 'bold',
    previewBg: '#111827', previewAccent: '#F9FAFB',
    textEn: 'Episode Title',   textNe: 'भागको शीर्षक',
    defaultDuration: 5,
  },
  {
    id: 'ti-chap',  name: 'Chapter',    nameNe: 'अध्याय',
    category: 'title',   style: 'corporate',
    previewBg: '#1E3A5F', previewAccent: '#93C5FD',
    textEn: 'Chapter 1',       textNe: 'अध्याय १',
    defaultDuration: 4,
  },
  {
    id: 'ti-intro', name: 'Intro Card', nameNe: 'परिचय कार्ड',
    category: 'title',   style: 'fun',
    previewBg: '#7C3AED', previewAccent: '#F5D0FE',
    textEn: 'Welcome!',        textNe: 'स्वागत छ!',
    defaultDuration: 4,
  },
]

export const TEMPLATE_CATEGORIES: { id: TemplateCategory | 'all'; label: string }[] = [
  { id: 'all',          label: 'All'          },
  { id: 'chart',        label: 'Charts'       },
  { id: 'stat',         label: 'Stats'        },
  { id: 'quote',        label: 'Quotes'       },
  { id: 'list',         label: 'Lists'        },
  { id: 'lower-third',  label: 'Lower Thirds' },
  { id: 'title',        label: 'Titles'       },
]

// ── Store ─────────────────────────────────────────────────────────────────────

export interface VisualLibraryState {
  activeTab:         VisualTab
  activeCategory:    TemplateCategory | 'all'
  contentLanguage:   ContentLanguage
  searchQuery:       string
  brandKit:          BrandKit
  brandApplied:      boolean
  placedOverlays:    PlacedOverlay[]
  /** ID of the overlay currently being customised (panel open) */
  editingOverlayId:  string | null

  setActiveTab:       (tab: VisualTab) => void
  setActiveCategory:  (cat: TemplateCategory | 'all') => void
  setContentLanguage: (lang: ContentLanguage) => void
  setSearchQuery:     (q: string) => void
  setBrandKit:        (updates: Partial<BrandKit>) => void
  applyBrandToAll:    () => void

  insertTemplate: (templateId: string, startTime: number) => void
  insertElement:  (elementId: string, startTime: number) => void
  removeOverlay:     (overlayId: string) => void
  updateOverlay:     (overlayId: string, changes: Partial<PlacedOverlay>) => void
  startEditOverlay:  (overlayId: string) => void
  stopEditOverlay:   () => void
  resetOverlays:     () => void

  filteredTemplates: () => VisualTemplate[]
}

let _nextOverlayId = 200

export const useVisualLibraryStore = create<VisualLibraryState>()(
  persist(
    (set, get) => ({
      activeTab:        'templates',
      activeCategory:   'all',
      contentLanguage:  'en',
      searchQuery:      '',
      brandKit:         { ...DEFAULT_BRAND_KIT },
      brandApplied:     false,
      placedOverlays:   [],
      editingOverlayId: null,

      setActiveTab:       (tab)  => set({ activeTab: tab }),
      setActiveCategory:  (cat)  => set({ activeCategory: cat }),
      setContentLanguage: (lang) => set({ contentLanguage: lang }),
      setSearchQuery:     (q)    => set({ searchQuery: q }),

      setBrandKit: (updates) =>
        set((s) => {
          const brandKit = { ...s.brandKit, ...updates }
          setPreviewBrandTheme({
            primary: brandKit.primaryColor || '#C41E3A',
            accent: brandKit.accentColor || '#F59E0B',
            secondary: brandKit.secondaryColor || '#111113',
          })
          return { brandKit }
        }),

      applyBrandToAll: () => {
        const s = get()
        syncMotionClipsToBrandKit(s.brandKit)
        set({
          placedOverlays: s.placedOverlays.map((o) => ({
            ...o,
            color: s.brandKit.primaryColor,
          })),
          brandApplied: true,
        })
      },

      insertTemplate: (templateId, startTime) => {
        insertVisualTemplateAt(templateId, startTime)
      },

      insertElement: (elementId, startTime) => {
        insertVisualElementAt(elementId, startTime)
      },

      removeOverlay: (id) => {
        removeVisualFromTimeline(id)
      },

      updateOverlay: (id, changes) => {
        updateVisualOnTimeline(id, changes)
      },

      startEditOverlay:  (id) => set({ editingOverlayId: id }),
      stopEditOverlay:   ()   => set({ editingOverlayId: null }),

      resetOverlays: () =>
        set({ placedOverlays: [], editingOverlayId: null, brandApplied: false }),

      filteredTemplates: () => {
        const { activeCategory, searchQuery, contentLanguage } = get()
        let results = VISUAL_TEMPLATES

        if (activeCategory !== 'all') {
          results = results.filter((t) => t.category === activeCategory)
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          results = results.filter((t) =>
            t.name.toLowerCase().includes(q) ||
            t.nameNe.includes(q) ||
            t.textEn.toLowerCase().includes(q) ||
            t.textNe.includes(q)
          )
        }

        return results
      },
    }),
    {
      name: 'viraedit-visual-library',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : (null as never)
      ),
      partialize: (s) => ({
        brandKit:       s.brandKit,
        contentLanguage: s.contentLanguage,
        brandApplied:   s.brandApplied,
      }),
    }
  )
)
