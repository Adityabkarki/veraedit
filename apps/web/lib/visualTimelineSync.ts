/**
 * Keeps Brand / Templates panel overlays in sync with timeline Visuals track clips.
 */

import type { Clip, Track } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { commitTimelineClips, getFullTimelineClips } from '@/lib/editor/timelineClipUpdates'
import {
  allocateDedicatedTrack,
  isFamilyTrack,
  OVERLAY_FAMILY,
  offsetEffectsForLane,
} from '@/lib/timelineLayers'
import {
  VISUAL_TEMPLATES,
  type PlacedOverlay,
  type VisualTemplate,
  useVisualLibraryStore,
} from '@/stores/visualLibraryStore'

export function templateVisualType(template: VisualTemplate): string {
  if (template.visualType) return template.visualType
  switch (template.category) {
    case 'chart':
      return template.id.includes('line') ? 'line_chart'
        : template.id.includes('donut') || template.id.includes('pie') ? 'donut_chart'
        : 'bar_chart'
    case 'stat':
      return template.id.includes('cmp') ? 'comparison'
        : template.id.includes('pct') ? 'cta'
        : 'large_number'
    case 'list':
      return 'list_item'
    case 'lower-third':
      return 'key_term'
    case 'quote':
      return 'statistic'
    case 'title':
      return 'hook_rewrite'
    default:
      return 'statistic'
  }
}

export function ensureOverlayTrack(tracks: Track[]): Track[] {
  if (tracks.some((t) => t.id === 'overlay')) return tracks
  return [
    ...tracks,
    {
      id: 'overlay',
      label: 'Visuals',
      color: '#EC4899',
      muted: false,
      locked: false,
      visible: true,
    },
  ]
}

export function overlayToClip(overlay: PlacedOverlay, template?: VisualTemplate): Clip {
  const tpl = template ?? VISUAL_TEMPLATES.find((t) => t.id === overlay.templateId)
  const visualType = overlay.visualType ?? (tpl ? templateVisualType(tpl) : 'statistic')
  const label = tpl?.name ?? (overlay.overlayKind === 'element' ? overlay.text : 'Visual')
  return {
    id: overlay.id,
    trackId: 'overlay',
    startTime: overlay.startTime,
    duration: overlay.duration,
    label: `${label}: ${overlay.text.slice(0, 24)}`,
    type: 'overlay',
    effects: {
      visualType,
      templateId: overlay.templateId,
      displayValue: overlay.text,
      nepaliLabel: overlay.language === 'ne' ? overlay.text : tpl?.textNe ?? '',
      suggestedVisual: tpl?.category ?? 'animated_graphic',
      secondaryText: overlay.secondaryText ?? '',
      xPct: overlay.xPct ?? 50,
      yPct: overlay.yPct ?? 50,
      scale: overlay.scale ?? 1,
      emoji: overlay.emoji,
      overlayMode: overlay.overlayMode ?? 'corner',
      widthPct: overlay.widthPct,
      heightPct: overlay.heightPct,
      rotation: overlay.rotation,
    },
  }
}

export function clipToOverlay(clip: Clip, brandPrimary: string): PlacedOverlay | null {
  if (!isFamilyTrack(clip.trackId, 'overlay')) return null
  const templateId =
    clip.effects?.templateId ||
    mapVisualToTemplate(clip.effects?.visualType)
  return {
    id: clip.id,
    templateId,
    startTime: clip.startTime,
    duration: clip.duration,
    text: clip.effects?.displayValue || clip.label,
    secondaryText: clip.effects?.secondaryText ?? '',
    language: 'en',
    color: brandPrimary,
    xPct: clip.effects?.xPct ?? 50,
    yPct: clip.effects?.yPct ?? 50,
    scale: clip.effects?.scale ?? 1,
    visualType: clip.effects?.visualType,
    emoji: clip.effects?.emoji,
    overlayMode: clip.effects?.overlayMode ?? 'corner',
    widthPct: clip.effects?.widthPct,
    heightPct: clip.effects?.heightPct,
    rotation: clip.effects?.rotation,
    overlayKind: clip.effects?.visualType === 'emoji_element' ? 'element' : 'template',
  }
}

/** Element catalogue — maps element id → visual renderer config. */
const ELEMENT_VISUAL_MAP: Record<string, { visualType: string; emoji: string; label: string }> = {
  'el-rect':   { visualType: 'shape_rect',   emoji: '▬', label: 'Rectangle' },
  'el-circle': { visualType: 'shape_circle', emoji: '●', label: 'Circle' },
  'el-line':   { visualType: 'shape_line',   emoji: '─', label: 'Line' },
  'el-wave':   { visualType: 'shape_wave',   emoji: '〜', label: 'Wave' },
  'el-arr-r':  { visualType: 'arrow',        emoji: '→', label: 'Arrow →' },
  'el-arr-l':  { visualType: 'arrow',        emoji: '←', label: 'Arrow ←' },
  'el-arr-u':  { visualType: 'arrow',        emoji: '↑', label: 'Arrow ↑' },
  'el-arr-d':  { visualType: 'arrow',        emoji: '↓', label: 'Arrow ↓' },
  'el-fire':   { visualType: 'emoji_element', emoji: '🔥', label: 'Fire' },
  'el-star':   { visualType: 'emoji_element', emoji: '⭐', label: 'Star' },
  'el-check':  { visualType: 'emoji_element', emoji: '✅', label: 'Check' },
  'el-warn':   { visualType: 'emoji_element', emoji: '⚠️', label: 'Warning' },
}

/** Insert a brand element (emoji, shape, arrow) at playhead. */
export function insertVisualElementAt(elementId: string, startTime: number): string | null {
  const el = ELEMENT_VISUAL_MAP[elementId]
  if (!el) return null

  const { brandKit, brandApplied } = useVisualLibraryStore.getState()
  const id = `el-${Date.now().toString(36)}`
  const overlay: PlacedOverlay = {
    id,
    templateId: elementId,
    startTime,
    duration: 3,
    text: el.label,
    language: 'en',
    color: brandApplied ? brandKit.primaryColor : '#FFFFFF',
    xPct: 50,
    yPct: 50,
    scale: el.visualType === 'emoji_element' ? 1.5 : 1,
    overlayKind: 'element',
    visualType: el.visualType,
    emoji: el.emoji,
  }

  const clip = overlayToClip(overlay)
  const { tracks } = useTimelineStore.getState()
  const clips = getFullTimelineClips()
  const { tracks: nextTracks, trackId } = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
  clip.trackId = trackId
  if (clip.effects) {
    clip.effects = offsetEffectsForLane(clip.effects, trackId, OVERLAY_FAMILY.prefix) as typeof clip.effects
  }
  commitTimelineClips(
    (allClips) => [...allClips, clip],
    { tracks: nextTracks, lastEditAction: `Added ${el.label} element` },
  )
  useVisualLibraryStore.setState({
    placedOverlays: [...useVisualLibraryStore.getState().placedOverlays, overlay],
    editingOverlayId: id,
  })
  return id
}

function mapVisualToTemplate(visualType?: string): string {
  switch (visualType) {
    case 'bar_chart':
      return 'ch-bar'
    case 'line_chart':
      return 'ch-line'
    case 'donut_chart':
      return 'ch-donut'
    case 'large_number':
      return 'st-big'
    case 'list_item':
      return 'li-bullet'
    case 'comparison':
      return 'st-cmp'
    case 'key_term':
      return 'lt-topic'
    case 'hook_rewrite':
      return 'ti-main'
    case 'cta':
      return 'st-pct'
    default:
      return 'ch-stat'
  }
}

/** Insert template at playhead — adds timeline clip + library entry. */
export function insertVisualTemplateAt(templateId: string, startTime: number): string | null {
  const template = VISUAL_TEMPLATES.find((t) => t.id === templateId)
  if (!template) return null

  const { contentLanguage, brandKit, brandApplied } = useVisualLibraryStore.getState()
  const id = `ovl-${Date.now().toString(36)}`
  const overlay: PlacedOverlay = {
    id,
    templateId,
    startTime,
    duration: template.defaultDuration,
    text: contentLanguage === 'ne' ? template.textNe : template.textEn,
    secondaryText: contentLanguage === 'ne' ? (template.subtitleNe ?? '') : (template.subtitleEn ?? ''),
    language: contentLanguage,
    color: brandApplied ? brandKit.primaryColor : template.previewAccent,
  }

  const clip = overlayToClip(overlay, template)
  const { tracks } = useTimelineStore.getState()
  const clips = getFullTimelineClips()
  const { tracks: nextTracks, trackId } = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
  clip.trackId = trackId
  if (clip.effects) {
    clip.effects = offsetEffectsForLane(clip.effects, trackId, OVERLAY_FAMILY.prefix) as typeof clip.effects
  }
  commitTimelineClips(
    (allClips) => [...allClips, clip],
    { tracks: nextTracks, lastEditAction: `Added ${template.name} to timeline` },
  )
  useVisualLibraryStore.setState({
    placedOverlays: [...useVisualLibraryStore.getState().placedOverlays, overlay],
    editingOverlayId: id,
  })
  return id
}

export function removeVisualFromTimeline(overlayId: string) {
  commitTimelineClips(
    (clips) => clips.filter((c) => c.id !== overlayId),
    {
      selectedClipIds: useTimelineStore.getState().selectedClipIds.filter((x) => x !== overlayId),
      lastEditAction: 'Removed visual overlay',
    },
  )
  useVisualLibraryStore.setState((s) => ({
    placedOverlays: s.placedOverlays.filter((o) => o.id !== overlayId),
    editingOverlayId: s.editingOverlayId === overlayId ? null : s.editingOverlayId,
  }))
}

export function updateVisualOnTimeline(overlayId: string, changes: Partial<PlacedOverlay>) {
  const brand = useVisualLibraryStore.getState().brandKit
  useVisualLibraryStore.setState((s) => ({
    placedOverlays: s.placedOverlays.map((o) =>
      o.id === overlayId ? { ...o, ...changes } : o
    ),
  }))

  const updated = useVisualLibraryStore.getState().placedOverlays.find((o) => o.id === overlayId)
  if (!updated) return

  const template = VISUAL_TEMPLATES.find((t) => t.id === updated.templateId)
  const nextClip = overlayToClip(updated, template)
  commitTimelineClips(
    (clips) => clips.map((c) => (c.id === overlayId ? { ...nextClip, id: overlayId } : c)),
    { lastEditAction: 'Updated visual overlay' },
  )
}

/** After dragging/resizing an overlay clip on the timeline. */
export function syncOverlayClipFromTimeline(clipId: string) {
  const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId)
  if (!clip || !isFamilyTrack(clip.trackId, 'overlay')) return
  const brand = useVisualLibraryStore.getState().brandKit
  const overlay = clipToOverlay(clip, brand.primaryColor)
  if (!overlay) return
  useVisualLibraryStore.setState((s) => {
    const exists = s.placedOverlays.some((o) => o.id === clipId)
    return {
      placedOverlays: exists
        ? s.placedOverlays.map((o) => (o.id === clipId ? { ...o, ...overlay } : o))
        : [...s.placedOverlays, overlay],
    }
  })
}

export function syncAllOverlaysFromTimeline(clips: Clip[]) {
  const brand = useVisualLibraryStore.getState().brandKit
  const fromTimeline = clips
    .filter((c) => isFamilyTrack(c.trackId, 'overlay'))
    .map((c) => clipToOverlay(c, brand.primaryColor))
    .filter(Boolean) as PlacedOverlay[]

  useVisualLibraryStore.setState({ placedOverlays: fromTimeline })
}
