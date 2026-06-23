/**
 * Short-only styling — brand, templates, effects, style presets.
 * Stored per short in shortsStore; never written to the main timeline.
 */

import type { BrandKit } from '@/stores/visualLibraryStore'
import {
  VISUAL_TEMPLATES,
  DEFAULT_BRAND_KIT,
  type ContentLanguage,
  type VisualTemplate,
} from '@/stores/visualLibraryStore'
import { templateVisualType } from '@/lib/visualTimelineSync'
import {
  COLOR_FILTERS,
  SPEED_PRESETS,
  TEXT_TEMPLATES,
  type TextTemplate,
} from '@/stores/effectsStore'

export interface ShortOverlay {
  id:           string
  source:       'template' | 'text_effect'
  templateId:   string
  visualType:   string
  /** Seconds from the start of this short segment */
  offset:       number
  duration:     number
  text:         string
  secondaryText?: string
  language:     ContentLanguage
  color:        string
}

export interface ShortStyling {
  brandKit:         BrandKit | null
  brandApplied:     boolean
  filterId:         string | null
  speedId:          string | null
  stylePresetId:    string | null
  stylePresetName?: string
  styleStrength:    number
  overlays:         ShortOverlay[]
}

export const DEFAULT_SHORT_STYLING: ShortStyling = {
  brandKit:      null,
  brandApplied:  false,
  filterId:      null,
  speedId:       null,
  stylePresetId: null,
  styleStrength: 80,
  overlays:      [],
}

export interface ShortStylingExport {
  brand_kit?:       BrandKit | null
  brand_applied?:   boolean
  filter_id?:       string | null
  speed_id?:        string | null
  speed_multiplier?: number
  style_preset_id?: string | null
  style_strength?:  number
  overlays?:        Array<{
    template_id:    string
    visual_type:    string
    offset:         number
    duration:       number
    text:           string
    secondary_text?: string
    color:          string
  }>
}

function textTemplateVisualType(category: TextTemplate['category']): string {
  switch (category) {
    case 'lower-third': return 'key_term'
    case 'title':       return 'hook_rewrite'
    case 'quote':       return 'statistic'
    case 'stat':        return 'large_number'
    case 'cta':         return 'cta'
    default:            return 'statistic'
  }
}

export function resolveShortBrandKit(styling: ShortStyling): BrandKit {
  if (styling.brandApplied && styling.brandKit) return styling.brandKit
  return DEFAULT_BRAND_KIT
}

export function shortVideoCssFilter(filterId: string | null): string | undefined {
  if (!filterId || filterId === 'none') return undefined
  const f = COLOR_FILTERS.find((x) => x.id === filterId)
  if (!f || f.cssFilter === 'none') return undefined
  return f.cssFilter
}

export function shortPlaybackRate(speedId: string | null): number {
  if (!speedId || speedId === 'normal') return 1
  const preset = SPEED_PRESETS.find((p) => p.id === speedId)
  return preset?.multiplier ?? 1
}

export function buildShortOverlayFromTemplate(
  templateId: string,
  shortDuration: number,
  brandKit: BrandKit,
  brandApplied: boolean,
  language: ContentLanguage = 'en',
  offset = 0,
): ShortOverlay | null {
  const template = VISUAL_TEMPLATES.find((t) => t.id === templateId)
  if (!template) return null
  const text = language === 'ne' ? template.textNe : template.textEn
  const secondary = language === 'ne' ? template.subtitleNe : template.subtitleEn
  return {
    id: `sh-ov-${Date.now().toString(36)}`,
    source: 'template',
    templateId,
    visualType: templateVisualType(template),
    offset,
    duration: Math.min(template.defaultDuration, Math.max(1, shortDuration)),
    text,
    secondaryText: secondary ?? '',
    language,
    color: brandApplied ? brandKit.primaryColor : template.previewAccent,
  }
}

export function buildShortOverlayFromTextEffect(
  effectId: string,
  shortDuration: number,
  brandKit: BrandKit,
  brandApplied: boolean,
  language: ContentLanguage = 'en',
  offset = 0,
): ShortOverlay | null {
  const template = TEXT_TEMPLATES.find((t) => t.id === effectId)
  if (!template) return null
  const useNe = template.nepaliReady && language === 'ne'
  return {
    id: `sh-tx-${Date.now().toString(36)}`,
    source: 'text_effect',
    templateId: effectId,
    visualType: textTemplateVisualType(template.category),
    offset,
    duration: Math.min(4, Math.max(1, shortDuration)),
    text: template.previewText,
    secondaryText: '',
    language: useNe ? 'ne' : 'en',
    color: brandApplied ? brandKit.primaryColor : template.previewColor,
  }
}

/** Overlays visible at local time within the short (0 … duration). */
export function activeShortOverlays(
  overlays: ShortOverlay[],
  localTime: number,
): ShortOverlay[] {
  return overlays.filter(
    (o) => localTime >= o.offset && localTime < o.offset + o.duration,
  )
}

export function stylingToExport(styling: ShortStyling): ShortStylingExport {
  return {
    brand_kit: styling.brandApplied ? styling.brandKit : null,
    brand_applied: styling.brandApplied,
    filter_id: styling.filterId,
    speed_id: styling.speedId,
    speed_multiplier: shortPlaybackRate(styling.speedId),
    style_preset_id: styling.stylePresetId,
    style_strength: styling.styleStrength,
    overlays: styling.overlays.map((o) => ({
      template_id: o.templateId,
      visual_type: o.visualType,
      offset: o.offset,
      duration: o.duration,
      text: o.text,
      secondary_text: o.secondaryText,
      color: o.color,
    })),
  }
}

/** Compact template list for shorts UI (popular vertical-friendly types). */
export const SHORT_TEMPLATE_IDS = [
  'ti-main', 'lt-name', 'st-big', 'qt-pull', 'st-pct',
  'ch-stat', 'ti-intro', 'lt-topic', 'ti-chap',
] as const

export const SHORT_FILTER_IDS = ['warm', 'vibrant', 'dramatic', 'vintage', 'bw', 'cold'] as const

export const SHORT_SPEED_IDS = ['normal', 'fast-2x', 'fast-3x', 'slow-2x'] as const

export const SHORT_TEXT_EFFECT_IDS = ['lt-bold', 'tc-bold', 'qt-bold', 'ct-bold'] as const

export function shortTemplateById(id: string): VisualTemplate | undefined {
  return VISUAL_TEMPLATES.find((t) => t.id === id)
}
