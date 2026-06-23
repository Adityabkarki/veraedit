/**
 * Text & overlay element clips on the timeline (not B-roll / not image layers).
 */

import type { Clip } from '@/stores/timelineStore'
import { isBrollClip, isImageClip } from '@/lib/mediaClips'
import { isFamilyTrack } from '@/lib/timelineLayers'
import { isChartOrProcessClip, isChartOrProcessVisualType } from '@/lib/chartVisualTypes'

const TEXT_OVERLAY_TYPES = new Set([
  'statistic',
  'large_number',
  'list_item',
  'comparison',
  'key_term',
  'cta',
  'add_cta',
  'title_banner',
  'hook_banner',
  'hook_rewrite',
  'data_card',
  'arrow_flow',
  'conflict_box',
  'upper_third_label',
  'bar_chart',
  'horizontal_bar',
  'stacked_bar',
  'line_chart',
  'area_chart',
  'donut_chart',
  'pie_chart',
  'gauge_chart',
  'progress_bar',
  'flowchart',
  'process_flow',
  'funnel_chart',
  'timeline_steps',
  'process_steps',
  'cycle_diagram',
  'org_chart',
  'checklist',
  'gantt_chart',
  'swim_lane',
  'decision_tree',
  'mind_map',
  'emoji_element',
  'animated_graphic',
  'image_slot',
  'image_sticker',
  'image_shape',
])

export function isEditableOverlayClip(clip: Clip | undefined): boolean {
  if (!clip) return false
  if (isBrollClip(clip) || isImageClip(clip)) return false
  if (isChartOrProcessClip(clip)) return true
  if (!isFamilyTrack(clip.trackId, 'overlay') && !isFamilyTrack(clip.trackId, 'broll')) return false
  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  return TEXT_OVERLAY_TYPES.has(vt) || Boolean(vt)
}

export function overlayElementLabel(clip: Clip): string {
  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  if (clip.effects?.chartAsBroll) return `${overlayTypeLabel(vt)} (B-Roll)`
  return overlayTypeLabel(vt) || clip.label || 'Overlay'
}

function overlayTypeLabel(vt: string): string {
  switch (vt) {
    case 'data_card':
      return 'Data card'
    case 'arrow_flow':
      return 'Arrow'
    case 'conflict_box':
      return 'Highlight box'
    case 'upper_third_label':
      return 'Context label'
    case 'cta':
    case 'add_cta':
      return 'Call to action'
    case 'key_term':
      return 'Lower third'
    case 'title_banner':
    case 'hook_banner':
      return 'Title banner'
    case 'hook_rewrite':
      return 'Hook text'
    case 'large_number':
      return 'Big number'
    case 'statistic':
      return 'Stat card'
    case 'list_item':
      return 'List item'
    case 'comparison':
      return 'Comparison'
    case 'bar_chart':
      return 'Bar chart'
    case 'horizontal_bar':
      return 'Horizontal bar'
    case 'stacked_bar':
      return 'Stacked bar'
    case 'line_chart':
      return 'Line chart'
    case 'area_chart':
      return 'Area chart'
    case 'donut_chart':
      return 'Donut chart'
    case 'pie_chart':
      return 'Pie chart'
    case 'gauge_chart':
      return 'Gauge'
    case 'progress_bar':
      return 'Progress bar'
    case 'flowchart':
      return 'Flowchart'
    case 'process_flow':
      return 'Process flow'
    case 'funnel_chart':
      return 'Funnel'
    case 'timeline_steps':
      return 'Timeline'
    case 'process_steps':
      return 'Steps'
    case 'cycle_diagram':
      return 'Cycle'
    case 'org_chart':
      return 'Org chart'
    case 'checklist':
      return 'Checklist'
    case 'gantt_chart':
      return 'Gantt'
    case 'swim_lane':
      return 'Swim lane'
    case 'decision_tree':
      return 'Decision tree'
    case 'mind_map':
      return 'Mind map'
    case 'emoji_element':
      return 'Emoji'
    default:
      return ''
  }
}

export function overlayShowsSubtitleField(visualType?: string): boolean {
  const vt = (visualType ?? '').toLowerCase()
  return [
    'data_card',
    'statistic',
    'large_number',
    'list_item',
    'comparison',
    'bar_chart',
    'horizontal_bar',
    'stacked_bar',
    'line_chart',
    'area_chart',
    'donut_chart',
    'pie_chart',
    'gauge_chart',
    'progress_bar',
    'key_term',
    'flowchart',
    'process_flow',
    'funnel_chart',
    'timeline_steps',
    'process_steps',
    'cycle_diagram',
    'org_chart',
    'checklist',
    'gantt_chart',
    'swim_lane',
    'decision_tree',
    'mind_map',
  ].includes(vt)
}

export function overlaySubtitleFieldLabel(visualType?: string): string {
  const vt = (visualType ?? '').toLowerCase()
  if (vt === 'comparison') return 'Column headers (left | right)'
  if (vt === 'list_item' || vt === 'checklist') return 'List items (comma or line breaks)'
  if (vt === 'mind_map') return 'Branch labels (comma separated)'
  if (vt === 'key_term') return 'Subtitle / role'
  if (isChartOrProcessVisualType(vt)) return 'Label / subtitle'
  return 'Label / subtitle'
}

export function overlayShowsSizeFields(visualType?: string): boolean {
  const vt = (visualType ?? '').toLowerCase()
  return ['arrow_flow', 'conflict_box', 'data_card'].includes(vt)
}
