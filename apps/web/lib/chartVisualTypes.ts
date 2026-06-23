/**
 * Chart & process overlay visual types — shared across catalog, preview, and timeline.
 */

export const CHART_VISUAL_TYPES = new Set([
  'bar_chart',
  'horizontal_bar',
  'stacked_bar',
  'line_chart',
  'area_chart',
  'donut_chart',
  'pie_chart',
  'gauge_chart',
  'progress_bar',
  'statistic',
  'large_number',
  'comparison',
])

export const PROCESS_VISUAL_TYPES = new Set([
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
  'arrow_flow',
  'list_item',
])

export const CHART_AND_PROCESS_VISUAL_TYPES = new Set([
  ...CHART_VISUAL_TYPES,
  ...PROCESS_VISUAL_TYPES,
])

export function isChartOrProcessVisualType(visualType?: string): boolean {
  return CHART_AND_PROCESS_VISUAL_TYPES.has((visualType ?? '').toLowerCase())
}

export function isChartOrProcessClip(clip: { effects?: { visualType?: string } }): boolean {
  return isChartOrProcessVisualType(clip.effects?.visualType)
}
