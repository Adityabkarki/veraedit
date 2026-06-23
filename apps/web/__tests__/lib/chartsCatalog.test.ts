import { describe, it, expect, beforeEach } from 'vitest'
import {
  CHART_PROCESS_CATALOG,
  insertChartCatalogItem,
  chartCatalogItem,
} from '@/lib/chartsCatalog'
import { useTimelineStore } from '@/stores/timelineStore'
import { isBrollClip } from '@/lib/mediaClips'
import { buildUnifiedCatalog } from '@/lib/effectsCatalog'

beforeEach(() => {
  useTimelineStore.getState().resetTimeline()
})

describe('chartsCatalog', () => {
  it('lists charts and processes in catalog', () => {
    expect(CHART_PROCESS_CATALOG.length).toBeGreaterThanOrEqual(20)
    expect(chartCatalogItem('chart_bar')?.visualType).toBe('bar_chart')
    expect(chartCatalogItem('process_funnel')?.kind).toBe('process')
  })

  it('inserts corner overlay on Elements lane by default', () => {
    insertChartCatalogItem('chart_line', 'Line chart', 1, false)
    const clip = useTimelineStore.getState().clips[0]
    expect(clip.trackId.startsWith('overlay')).toBe(true)
    expect(clip.effects?.overlayMode).toBe('corner')
    expect(isBrollClip(clip)).toBe(false)
  })

  it('inserts fullscreen chart on B-Roll lane when requested', () => {
    insertChartCatalogItem('process_flowchart', 'Flowchart', 2, true)
    const clip = useTimelineStore.getState().clips[0]
    expect(clip.trackId.startsWith('broll')).toBe(true)
    expect(clip.effects?.overlayMode).toBe('fullscreen')
    expect(clip.effects?.chartAsBroll).toBe(true)
    expect(isBrollClip(clip)).toBe(false)
  })

  it('appears in unified effects catalog under charts', () => {
    const items = buildUnifiedCatalog([])
    const charts = items.filter((i) => i.category === 'charts')
    expect(charts.some((c) => c.id === 'chart_donut')).toBe(true)
    expect(charts.some((c) => c.id === 'process_gantt')).toBe(true)
  })
})
