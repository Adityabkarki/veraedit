/**
 * Unified effects catalog — toolbox tools + legacy presets, deduplicated.
 */

import {
  TRANSITIONS,
  COLOR_FILTERS,
  TEXT_TEMPLATES,
  SPEED_PRESETS,
} from '@/stores/effectsStore'
import type { EditToolboxTool } from '@/lib/styleTransfer'
import { TOOLBOX_TRANSITION_MAP } from '@/lib/styleToolboxSync'
import { applyEffectToTimeline, applyTransitionToTimeline } from '@/lib/applyEffects'
import { insertStyleToolAt } from '@/lib/styleToolboxSync'
import { CHART_PROCESS_CATALOG, insertChartCatalogItem } from '@/lib/chartsCatalog'
import { useEffectsStore } from '@/stores/effectsStore'
import { useTimelineStore } from '@/stores/timelineStore'

export interface CatalogItem {
  id: string
  name: string
  category: string
  description?: string
  available: boolean
  source: 'toolbox' | 'transition' | 'filter' | 'text' | 'speed' | 'chart'
}

export const UNIFIED_CATEGORY_LABELS: Record<string, string> = {
  transitions: 'Transitions',
  vfx: 'VFX',
  camera: 'Camera & zoom',
  color: 'Color & filters',
  broll: 'B-roll',
  audio: 'SFX & audio',
  captions: 'Captions',
  overlays: 'Text & overlays',
  charts: 'Charts & processes',
  images: 'Image overlays',
  pacing: 'Speed & pacing',
  shot: 'Shot type',
  layout: 'Layout & multicam',
}

/** Toolbox tools that belong under Text & overlays (not VFX). */
const OVERLAY_TOOL_IDS = new Set([
  'motion_data_card',
  'motion_arrow_flow',
  'motion_conflict_box',
  'overlay_upper_third_label',
  'title_hook_banner',
  'hook_text_overlay',
  'cta_overlay',
  'text_overlay',
  'lower_third',
  'logo_overlay',
  'emoji_reaction',
  'progress_bar',
  '3d_text',
  'shot_motion_graphic',
])

/** Collapse duplicate chips; motion graphics → Text & overlays. */
export function normalizeCatalogCategory(category: string, toolId?: string): string {
  if (toolId && OVERLAY_TOOL_IDS.has(toolId)) return 'overlays'
  switch (category) {
    case 'filters':
      return 'color'
    case 'text':
    case 'motion':
    case 'overlays':
      return 'overlays'
    case 'speed':
      return 'pacing'
    default:
      return category
  }
}

export const UNIFIED_CATEGORY_ORDER = [
  'transitions',
  'vfx',
  'camera',
  'color',
  'images',
  'broll',
  'audio',
  'captions',
  'overlays',
  'charts',
  'pacing',
  'shot',
  'layout',
]

const CATEGORY_SEARCH_ALIASES: Record<string, string[]> = {
  color: ['filter', 'grade', 'lut', 'color'],
  overlays: ['text', 'template', 'title', 'cta', 'overlay', 'data', 'card', 'slide', 'fade'],
  charts: ['chart', 'graph', 'diagram', 'process', 'flow', 'funnel', 'gantt', 'timeline', 'stats'],
  images: ['image', 'photo', 'sticker', 'png', 'jpg'],
  vfx: ['vignette', 'shake', 'blur', 'flash', 'vfx'],
  pacing: ['speed', 'ramp', 'cut', 'jump', 'pacing'],
  layout: ['split', 'pip', 'multicam', 'layout'],
}

const TOOLBOX_TRANSITION_IDS = new Set(Object.keys(TOOLBOX_TRANSITION_MAP))
const LEGACY_TRANSITION_IDS = new Set(Object.values(TOOLBOX_TRANSITION_MAP))

function toolboxToItem(t: EditToolboxTool): CatalogItem {
  return {
    id: t.id,
    name: t.name,
    category: normalizeCatalogCategory(t.category, t.id),
    description: t.description,
    available: t.available || t.discovered,
    source: 'toolbox',
  }
}

export function catalogItemMatchesSearch(item: CatalogItem, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.name.toLowerCase().includes(q)) return true
  if ((item.description ?? '').toLowerCase().includes(q)) return true
  if (item.category.toLowerCase().includes(q)) return true
  const label = UNIFIED_CATEGORY_LABELS[item.category] ?? ''
  if (label.toLowerCase().includes(q)) return true
  const aliases = CATEGORY_SEARCH_ALIASES[item.category] ?? []
  return aliases.some((a) => a.includes(q) || q.includes(a))
}

export function buildUnifiedCatalog(tools: EditToolboxTool[]): CatalogItem[] {
  const items: CatalogItem[] = tools
    .filter((t) => t.available || t.discovered)
    .map(toolboxToItem)

  const seen = new Set(items.map((i) => i.id))

  for (const t of TRANSITIONS) {
    if (LEGACY_TRANSITION_IDS.has(t.id) && [...TOOLBOX_TRANSITION_IDS].some((tid) => TOOLBOX_TRANSITION_MAP[tid] === t.id)) {
      continue
    }
    const id = `legacy-transition-${t.id}`
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      name: t.name,
      category: 'transitions',
      description: t.description,
      available: true,
      source: 'transition',
    })
  }

  for (const f of COLOR_FILTERS) {
    if (f.id === 'none') continue
    const id = `legacy-filter-${f.id}`
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      name: f.name,
      category: 'color',
      description: f.description,
      available: true,
      source: 'filter',
    })
  }

  for (const t of TEXT_TEMPLATES) {
    const id = `legacy-text-${t.id}`
    if (seen.has(id)) continue
    seen.add(id)
    items.push({
      id,
      name: t.name,
      category: 'overlays',
      description: `${t.category} · ${t.style}`,
      available: true,
      source: 'text',
    })
  }

  for (const s of SPEED_PRESETS) {
    const id = `legacy-speed-${s.id}`
    if (seen.has(id) || s.id === 'ramp') continue
    seen.add(id)
    items.push({
      id,
      name: s.name,
      category: 'pacing',
      description: s.description,
      available: true,
      source: 'speed',
    })
  }

  for (const ch of CHART_PROCESS_CATALOG) {
    if (seen.has(ch.id)) continue
    seen.add(ch.id)
    items.push({
      id: ch.id,
      name: ch.name,
      category: 'charts',
      description: ch.description,
      available: true,
      source: 'chart',
    })
  }

  return items
}

export function applyCatalogItem(item: CatalogItem): void {
  const t = useTimelineStore.getState().playheadTime
  const touchRecent = (id: string, name: string) => {
    useEffectsStore.setState({
      lastApplied: name,
      recentlyUsed: [id, ...useEffectsStore.getState().recentlyUsed.filter((x) => x !== id)].slice(0, 12),
    })
  }

  if (item.source === 'toolbox') {
    insertStyleToolAt(item.id, item.name, t)
    touchRecent(item.id, item.name)
    return
  }

  if (item.source === 'transition') {
    const transitionId = item.id.replace('legacy-transition-', '')
    const result = applyTransitionToTimeline(transitionId, t)
    useTimelineStore.setState({ lastEditAction: result.message })
    if (result.ok) touchRecent(item.id, item.name)
    return
  }

  if (item.source === 'filter') {
    const filterId = item.id.replace('legacy-filter-', '')
    const result = applyEffectToTimeline(filterId, 'filter')
    useTimelineStore.setState({ lastEditAction: result.message })
    if (result.ok) touchRecent(item.id, item.name)
    return
  }

  if (item.source === 'text') {
    const templateId = item.id.replace('legacy-text-', '')
    const result = applyEffectToTimeline(templateId, 'text')
    useTimelineStore.setState({ lastEditAction: result.message })
    if (result.ok) touchRecent(item.id, item.name)
    return
  }

  if (item.source === 'speed') {
    const speedId = item.id.replace('legacy-speed-', '')
    const result = applyEffectToTimeline(speedId, 'speed')
    useTimelineStore.setState({ lastEditAction: result.message })
    if (result.ok) touchRecent(item.id, item.name)
    return
  }

  if (item.source === 'chart') {
    const asBroll = useEffectsStore.getState().insertChartsAsBroll
    insertChartCatalogItem(item.id, item.name, t, asBroll)
    touchRecent(item.id, item.name)
  }
}
