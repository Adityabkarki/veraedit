/**
 * Tests for VisualLibraryPanel.tsx and sub-components
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VisualLibraryPanel }  from '@/components/editor/VisualLibraryPanel'
import { LeftPanel }           from '@/components/editor/LeftPanel'
import {
  useVisualLibraryStore,
  VISUAL_TEMPLATES,
  DEFAULT_BRAND_KIT,
} from '@/stores/visualLibraryStore'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { useTimelineStore, INITIAL_TRACKS, INITIAL_CLIPS, PPS_DEFAULT } from '@/stores/timelineStore'
import { useScenesStore }  from '@/stores/scenesStore'
import { useShortsStore }  from '@/stores/shortsStore'
import { useUIStore, initialUIState } from '@/stores/uiStore'
import { usePlayerStore, initialPlayerState } from '@/stores/playerStore'
import { useTranscriptStore } from '@/stores/transcriptStore'

beforeEach(() => {
  useVisualLibraryStore.setState({
    activeTab: 'templates', activeCategory: 'all', contentLanguage: 'en',
    searchQuery: '', brandKit: { ...DEFAULT_BRAND_KIT }, brandApplied: false,
    placedOverlays: [], editingOverlayId: null,
  })
  useEditorStore.setState({
    ...initialEditorState,
    tooltipsDismissed: { left: true, preview: true, ai: true, timeline: true },
  })
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  useTimelineStore.setState({ playheadTime: 5 })
  useScenesStore.getState().resetScenes()
  useShortsStore.getState().resetShorts()
  useUIStore.setState({ ...initialUIState })
  usePlayerStore.setState({ ...initialPlayerState })
  useTranscriptStore.getState().resetTranscript()
  localStorage.clear()
})

// ── Structure ─────────────────────────────────────────────────────────────────

describe('VisualLibraryPanel — structure', () => {
  it('renders the panel', () => {
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('visual-library-panel')).toBeInTheDocument()
  })
  it('renders brand/visual tabs (style transfer is in left Style tab)', () => {
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('visual-tab-templates')).toBeInTheDocument()
    expect(screen.getByTestId('visual-tab-elements')).toBeInTheDocument()
    expect(screen.getByTestId('visual-tab-brand')).toBeInTheDocument()
    expect(screen.getByTestId('brand-open-style-tab')).toBeInTheDocument()
  })
  it('Templates tab is selected by default', () => {
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('visual-tab-templates')).toHaveAttribute('aria-selected', 'true')
  })
  it('renders TemplatesTab content by default', () => {
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('templates-tab')).toBeInTheDocument()
  })
})

// ── Tab switching ─────────────────────────────────────────────────────────────

describe('VisualLibraryPanel — tab switching', () => {
  it('clicking Elements tab shows elements content', () => {
    render(<VisualLibraryPanel />)
    fireEvent.click(screen.getByTestId('visual-tab-elements'))
    expect(screen.getByTestId('elements-tab')).toBeInTheDocument()
  })
  it('clicking Brand tab shows brand kit content', () => {
    render(<VisualLibraryPanel />)
    fireEvent.click(screen.getByTestId('visual-tab-brand'))
    expect(screen.getByTestId('brand-kit-tab')).toBeInTheDocument()
  })
  it('switching tabs updates store', () => {
    render(<VisualLibraryPanel />)
    fireEvent.click(screen.getByTestId('visual-tab-elements'))
    expect(useVisualLibraryStore.getState().activeTab).toBe('elements')
  })
  it('link opens style transfer in right panel', () => {
    render(<VisualLibraryPanel projectId="proj-1" />)
    fireEvent.click(screen.getByTestId('brand-open-style-tab'))
    expect(useUIStore.getState().rightPanelMode).toBe('style')
  })
})

// ── TemplatesTab ──────────────────────────────────────────────────────────────

describe('VisualLibraryPanel — TemplatesTab', () => {
  it('renders all 18 template cards', () => {
    render(<VisualLibraryPanel />)
    VISUAL_TEMPLATES.forEach((t) => {
      expect(screen.getByTestId(`template-card-${t.id}`)).toBeInTheDocument()
    })
  })
  it('renders category filter buttons', () => {
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('cat-filter-all')).toBeInTheDocument()
    expect(screen.getByTestId('cat-filter-chart')).toBeInTheDocument()
    expect(screen.getByTestId('cat-filter-stat')).toBeInTheDocument()
  })
  it('category filter reduces template count', () => {
    render(<VisualLibraryPanel />)
    fireEvent.click(screen.getByTestId('cat-filter-chart'))
    // Only chart templates should be shown
    const chartTemplates = VISUAL_TEMPLATES.filter((t) => t.category === 'chart')
    chartTemplates.forEach((t) => {
      expect(screen.getByTestId(`template-card-${t.id}`)).toBeInTheDocument()
    })
    // Non-chart templates should not be shown
    const nonChart = VISUAL_TEMPLATES.filter((t) => t.category !== 'chart')[0]
    expect(screen.queryByTestId(`template-card-${nonChart.id}`)).toBeNull()
  })
  it('search input filters templates', () => {
    render(<VisualLibraryPanel />)
    fireEvent.change(screen.getByTestId('template-search'), { target: { value: 'bar chart' } })
    expect(screen.getByTestId('template-card-ch-bar')).toBeInTheDocument()
    expect(screen.queryByTestId('template-card-qt-pull')).toBeNull()
  })
  it('language toggle switches EN/NE', () => {
    render(<VisualLibraryPanel />)
    fireEvent.click(screen.getByTestId('lang-ne'))
    expect(useVisualLibraryStore.getState().contentLanguage).toBe('ne')
    expect(screen.getByTestId('lang-ne')).toHaveAttribute('aria-pressed', 'true')
  })
  it('Nepali indicator appears when language=ne', () => {
    useVisualLibraryStore.setState({ contentLanguage: 'ne' })
    render(<VisualLibraryPanel />)
    expect(screen.getAllByTestId(/^nepali-indicator-/).length).toBeGreaterThan(0)
  })
})

// ── Template insert ───────────────────────────────────────────────────────────

describe('VisualLibraryPanel — template insert', () => {
  it('clicking Insert adds an overlay at playhead time', () => {
    render(<VisualLibraryPanel />)
    const firstTemplate = VISUAL_TEMPLATES[0]
    fireEvent.click(screen.getByTestId(`insert-template-${firstTemplate.id}`))
    expect(useVisualLibraryStore.getState().placedOverlays).toHaveLength(1)
    expect(useVisualLibraryStore.getState().placedOverlays[0].startTime).toBe(5) // playheadTime = 5
  })
  it('placed overlays list appears after inserting', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('placed-overlays-list')).toBeInTheDocument()
  })
  it('removing an overlay from the placed list works', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    render(<VisualLibraryPanel />)
    const overlayId = useVisualLibraryStore.getState().placedOverlays[0].id
    fireEvent.click(screen.getByTestId(`remove-overlay-${overlayId}`))
    expect(useVisualLibraryStore.getState().placedOverlays).toHaveLength(0)
  })
})

// ── BrandKitTab ───────────────────────────────────────────────────────────────

describe('VisualLibraryPanel — BrandKitTab', () => {
  beforeEach(() => {
    useVisualLibraryStore.setState({ activeTab: 'brand' })
  })

  it('renders brand color inputs', () => {
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('brand-primary-color')).toBeInTheDocument()
    expect(screen.getByTestId('brand-secondary-color')).toBeInTheDocument()
    expect(screen.getByTestId('brand-accent-color')).toBeInTheDocument()
  })
  it('renders brand preview', () => {
    render(<VisualLibraryPanel />)
    expect(screen.getByTestId('brand-preview')).toBeInTheDocument()
  })
  it('Apply brand button triggers applyBrandToAll', () => {
    render(<VisualLibraryPanel />)
    fireEvent.click(screen.getByTestId('apply-brand'))
    expect(useVisualLibraryStore.getState().brandApplied).toBe(true)
  })
  it('font buttons toggle fontStyle', () => {
    render(<VisualLibraryPanel />)
    fireEvent.click(screen.getByTestId('font-nepali'))
    expect(useVisualLibraryStore.getState().brandKit.fontStyle).toBe('nepali')
  })
  it('logo text input updates brandKit.logoText', () => {
    render(<VisualLibraryPanel />)
    fireEvent.change(screen.getByTestId('brand-logo-text'), { target: { value: 'MyBrand' } })
    expect(useVisualLibraryStore.getState().brandKit.logoText).toBe('MyBrand')
  })
})

// ── LeftPanel Brand tab → VisualLibraryPanel ──────────────────────────────────

describe('LeftPanel — Brand tab routes to VisualLibraryPanel', () => {
  it('switching to Brand tab shows the visual library', () => {
    useEditorStore.setState({ activeLeftTab: 'brand' })
    render(<LeftPanel />)
    expect(screen.getByTestId('visual-library-panel')).toBeInTheDocument()
  })
  it('Brand tab has correct data-testid', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-brand')).toBeInTheDocument()
  })
})
