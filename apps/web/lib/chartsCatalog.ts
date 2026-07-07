/**
 * Charts & processes catalog — effects drawer items (overlay or fullscreen B-roll).
 */

import type { Clip } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { commitTimelineClips, getFullTimelineClips } from '@/lib/editor/timelineClipUpdates'
import {
  allocateDedicatedTrack,
  allocateStackedTrack,
  BROLL_FAMILY,
  OVERLAY_FAMILY,
  offsetEffectsForLane,
} from '@/lib/timelineLayers'
import { defaultEntranceForVisualType } from '@/lib/overlayAnimations'

export type ChartProcessKind = 'chart' | 'process'

export interface ChartProcessCatalogItem {
  id: string
  name: string
  description: string
  visualType: string
  kind: ChartProcessKind
  displayValue: string
  secondaryText?: string
  duration: number
}

/** All charts & process diagrams available in Effects → Charts & processes. */
export const CHART_PROCESS_CATALOG: ChartProcessCatalogItem[] = [
  // Charts
  { id: 'chart_bar', name: 'Bar chart', description: 'Vertical bars for comparing values', visualType: 'bar_chart', kind: 'chart', displayValue: 'Monthly revenue', secondaryText: 'Jan – Jun', duration: 5 },
  { id: 'chart_horizontal_bar', name: 'Horizontal bar', description: 'Side-by-side category comparison', visualType: 'horizontal_bar', kind: 'chart', displayValue: 'Category A | Category B | Category C', secondaryText: 'Share of total', duration: 5 },
  { id: 'chart_stacked', name: 'Stacked bar', description: 'Stacked segments in one bar', visualType: 'stacked_bar', kind: 'chart', displayValue: 'Product mix', secondaryText: 'Q1 breakdown', duration: 5 },
  { id: 'chart_line', name: 'Line chart', description: 'Trend over time', visualType: 'line_chart', kind: 'chart', displayValue: 'Growth trend', secondaryText: '+42% YoY', duration: 5 },
  { id: 'chart_area', name: 'Area chart', description: 'Filled line trend', visualType: 'area_chart', kind: 'chart', displayValue: 'Active users', secondaryText: 'Last 6 months', duration: 5 },
  { id: 'chart_donut', name: 'Donut chart', description: 'Part-to-whole percentage', visualType: 'donut_chart', kind: 'chart', displayValue: '68%', secondaryText: 'Market share', duration: 5 },
  { id: 'chart_pie', name: 'Pie chart', description: 'Classic pie slices', visualType: 'pie_chart', kind: 'chart', displayValue: '45%', secondaryText: 'Segment A', duration: 5 },
  { id: 'chart_gauge', name: 'Gauge', description: 'Dial for KPI progress', visualType: 'gauge_chart', kind: 'chart', displayValue: '78%', secondaryText: 'Goal completion', duration: 4 },
  { id: 'chart_progress', name: 'Progress bar', description: 'Single metric progress', visualType: 'progress_bar', kind: 'chart', displayValue: '72%', secondaryText: 'Project status', duration: 4 },
  { id: 'chart_stat', name: 'Stat card', description: 'Big number with label', visualType: 'statistic', kind: 'chart', displayValue: '12,500', secondaryText: 'Total views', duration: 4 },
  { id: 'chart_big_number', name: 'Big number', description: 'Hero metric callout', visualType: 'large_number', kind: 'chart', displayValue: '3.2M', secondaryText: 'Downloads', duration: 4 },
  { id: 'chart_comparison', name: 'Comparison', description: 'Before vs after columns', visualType: 'comparison', kind: 'chart', displayValue: 'Before | After', secondaryText: 'Before|After', duration: 5 },
  // Processes
  { id: 'process_flowchart', name: 'Flowchart', description: 'Boxes linked by arrows', visualType: 'flowchart', kind: 'process', displayValue: 'Start → Process → End', secondaryText: '3 steps', duration: 6 },
  { id: 'process_flow', name: 'Process flow', description: 'Directional flow with arrow', visualType: 'process_flow', kind: 'process', displayValue: 'Input → Output', secondaryText: 'Main pipeline', duration: 5 },
  { id: 'process_funnel', name: 'Funnel', description: 'Conversion funnel stages', visualType: 'funnel_chart', kind: 'process', displayValue: 'Awareness → Sign-up → Paid', secondaryText: 'Conversion', duration: 5 },
  { id: 'process_timeline', name: 'Timeline', description: 'Horizontal step timeline', visualType: 'timeline_steps', kind: 'process', displayValue: 'Phase 1 | Phase 2 | Phase 3', secondaryText: 'Roadmap', duration: 6 },
  { id: 'process_steps', name: 'Numbered steps', description: 'Vertical step list', visualType: 'process_steps', kind: 'process', displayValue: '1. Plan, 2. Build, 3. Launch', secondaryText: 'How it works', duration: 5 },
  { id: 'process_cycle', name: 'Cycle diagram', description: 'Repeating circular process', visualType: 'cycle_diagram', kind: 'process', displayValue: 'Create → Share → Learn', secondaryText: 'Feedback loop', duration: 5 },
  { id: 'process_org', name: 'Org chart', description: 'Hierarchy tree', visualType: 'org_chart', kind: 'process', displayValue: 'Lead → Team A, Team B', secondaryText: 'Structure', duration: 6 },
  { id: 'process_checklist', name: 'Checklist', description: 'Tasks with checkmarks', visualType: 'checklist', kind: 'process', displayValue: 'Research, Draft, Review, Publish', secondaryText: '4 tasks', duration: 5 },
  { id: 'process_gantt', name: 'Gantt chart', description: 'Tasks on a time grid', visualType: 'gantt_chart', kind: 'process', displayValue: 'Design | Dev | QA', secondaryText: 'Sprint plan', duration: 6 },
  { id: 'process_swimlane', name: 'Swim lane', description: 'Roles across stages', visualType: 'swim_lane', kind: 'process', displayValue: 'Marketing | Sales | Support', secondaryText: 'Handoffs', duration: 6 },
  { id: 'process_decision', name: 'Decision tree', description: 'Branching yes/no paths', visualType: 'decision_tree', kind: 'process', displayValue: 'Question? → Yes / No', secondaryText: 'Logic', duration: 5 },
  { id: 'process_mindmap', name: 'Mind map', description: 'Central idea with branches', visualType: 'mind_map', kind: 'process', displayValue: 'Main topic', secondaryText: 'Idea A, Idea B, Idea C', duration: 5 },
  { id: 'process_arrow', name: 'Arrow flow', description: 'Animated direction arrow', visualType: 'arrow_flow', kind: 'process', displayValue: '', secondaryText: '', duration: 3 },
  { id: 'process_list', name: 'Bullet list', description: 'Key points as a list', visualType: 'list_item', kind: 'process', displayValue: 'Point one, Point two, Point three', secondaryText: 'Summary', duration: 4 },
]

const CATALOG_BY_ID = new Map(CHART_PROCESS_CATALOG.map((c) => [c.id, c]))

export function chartCatalogItem(id: string): ChartProcessCatalogItem | undefined {
  return CATALOG_BY_ID.get(id)
}

export function isChartToolId(toolId: string): boolean {
  return CATALOG_BY_ID.has(toolId) || toolId.startsWith('chart_') || toolId.startsWith('process_')
}

function overlayDefaults(item: ChartProcessCatalogItem): Clip['effects'] {
  return {
    visualType: item.visualType,
    displayValue: item.displayValue,
    secondaryText: item.secondaryText ?? '',
    styleToolId: item.id,
    overlayMode: 'corner',
    xPct: 50,
    yPct: 50,
    widthPct: item.kind === 'process' ? 75 : 70,
    heightPct: item.kind === 'process' ? 55 : 50,
    overlayEntrance: defaultEntranceForVisualType(item.visualType),
    overlayExit: 'fade_out',
  }
}

function brollFullscreenDefaults(item: ChartProcessCatalogItem): Clip['effects'] {
  return {
    visualType: item.visualType,
    displayValue: item.displayValue,
    secondaryText: item.secondaryText ?? '',
    styleToolId: item.id,
    overlayMode: 'fullscreen',
    xPct: 50,
    yPct: 50,
    widthPct: 100,
    heightPct: 100,
    chartAsBroll: true,
    overlayEntrance: 'fade_in',
    overlayExit: 'fade_out',
  }
}

/** Insert chart/process at playhead — corner overlay or fullscreen B-roll layer. */
export function insertChartCatalogItem(
  toolId: string,
  toolName: string,
  startTime: number,
  asBroll: boolean,
): string | null {
  const item = CATALOG_BY_ID.get(toolId)
  if (!item) return null

  const id = `ch-${Date.now().toString(36)}`
  const { tracks } = useTimelineStore.getState()
  const clips = getFullTimelineClips()

  if (asBroll) {
    const { tracks: nextTracks, trackId } = allocateStackedTrack(
      tracks,
      clips,
      startTime,
      item.duration,
      BROLL_FAMILY,
    )
    const clip: Clip = {
      id,
      trackId,
      startTime,
      duration: item.duration,
      label: toolName,
      type: 'overlay',
      effects: brollFullscreenDefaults(item),
    }
    commitTimelineClips(
      (allClips) => [...allClips, clip],
      {
        tracks: nextTracks,
        lastEditAction: `Added ${toolName} as full-screen B-Roll`,
        selectedClipIds: [id],
      },
    )
    return id
  }

  const { tracks: nextTracks, trackId } = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
  const clip: Clip = {
    id,
    trackId,
    startTime,
    duration: item.duration,
    label: toolName,
    type: 'overlay',
    effects: offsetEffectsForLane(
      overlayDefaults(item),
      trackId,
      OVERLAY_FAMILY.prefix,
    ) as Clip['effects'],
  }
  commitTimelineClips(
    (allClips) => [...allClips, clip],
    {
      tracks: nextTracks,
      lastEditAction: `Added ${toolName} overlay`,
      selectedClipIds: [id],
    },
  )
  return id
}
