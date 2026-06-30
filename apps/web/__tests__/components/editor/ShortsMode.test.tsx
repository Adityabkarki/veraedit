/**
 * Tests for ShortsMode, ShortsCard, BulkActionBar, ModeSelector, shortsStore updates
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShortsMode }    from '@/components/editor/ShortsMode'
import { ModeSelector }  from '@/components/editor/ModeSelector'
import { BulkActionBar } from '@/components/editor/shorts/BulkActionBar'
import {
  useShortsStore,
  INITIAL_SHORTS,
  PLATFORM_ORDER,
} from '@/stores/shortsStore'
import {
  useEditorStore,
  initialEditorState,
} from '@/stores/editorStore'
import { usePlayerStore, initialPlayerState } from '@/stores/playerStore'
import { useTimelineStore, INITIAL_TRACKS, INITIAL_CLIPS, PPS_DEFAULT } from '@/stores/timelineStore'
import { useAssetStore } from '@/stores/assetStore'

beforeEach(() => {
  useShortsStore.getState().resetShorts()
  useShortsStore.getState().loadDemoData()
  useEditorStore.setState({ ...initialEditorState })
  usePlayerStore.setState({ ...initialPlayerState })
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  useAssetStore.getState().clearAsset()
  localStorage.clear()
})

// ── ModeSelector ──────────────────────────────────────────────────────────────

describe('ModeSelector', () => {
  it('renders all four mode buttons', () => {
    render(<ModeSelector />)
    expect(screen.getByTestId('mode-btn-editor')).toBeInTheDocument()
    expect(screen.getByTestId('mode-btn-shorts')).toBeInTheDocument()
    expect(screen.getByTestId('mode-btn-chapters')).toBeInTheDocument()
    expect(screen.getByTestId('mode-btn-promo')).toBeInTheDocument()
  })

  it('editor mode is selected by default', () => {
    render(<ModeSelector />)
    expect(screen.getByTestId('mode-btn-editor')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('mode-btn-shorts')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('mode-btn-chapters')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('mode-btn-promo')).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking Shorts mode sets editorMode to shorts', () => {
    render(<ModeSelector />)
    fireEvent.click(screen.getByTestId('mode-btn-shorts'))
    expect(useEditorStore.getState().editorMode).toBe('shorts')
  })

  it('clicking Chapters mode sets editorMode to chapters', () => {
    render(<ModeSelector />)
    fireEvent.click(screen.getByTestId('mode-btn-chapters'))
    expect(useEditorStore.getState().editorMode).toBe('chapters')
  })

  it('clicking Promo mode sets editorMode to promo', () => {
    render(<ModeSelector />)
    fireEvent.click(screen.getByTestId('mode-btn-promo'))
    expect(useEditorStore.getState().editorMode).toBe('promo')
  })

  it('clicking Editor mode sets editorMode to editor', () => {
    useEditorStore.setState({ editorMode: 'shorts' })
    render(<ModeSelector />)
    fireEvent.click(screen.getByTestId('mode-btn-editor'))
    expect(useEditorStore.getState().editorMode).toBe('editor')
  })

  it('active mode button has aria-selected=true', () => {
    useEditorStore.setState({ editorMode: 'chapters' })
    render(<ModeSelector />)
    expect(screen.getByTestId('mode-btn-chapters')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('mode-btn-editor')).toHaveAttribute('aria-selected', 'false')
  })
})

// ── ShortsMode structure ──────────────────────────────────────────────────────

describe('ShortsMode — structure', () => {
  it('renders the shorts mode container', () => {
    render(<ShortsMode />)
    expect(screen.getByTestId('shorts-mode')).toBeInTheDocument()
  })

  it('renders the shorts grid', () => {
    render(<ShortsMode />)
    expect(screen.getByTestId('shorts-grid')).toBeInTheDocument()
  })

  it('renders all shorts cards', () => {
    render(<ShortsMode />)
    INITIAL_SHORTS.forEach((s) => {
      expect(screen.getByTestId(`shorts-card-${s.id}`)).toBeInTheDocument()
    })
  })

  it('renders platform filter tabs', () => {
    render(<ShortsMode />)
    expect(screen.getByTestId('shorts-mode-platform-all')).toBeInTheDocument()
    PLATFORM_ORDER.forEach((p) => {
      expect(screen.getByTestId(`shorts-mode-platform-${p}`)).toBeInTheDocument()
    })
  })

  it('renders sort buttons', () => {
    render(<ShortsMode />)
    expect(screen.getByTestId('shorts-mode-sort-virality')).toBeInTheDocument()
    expect(screen.getByTestId('shorts-mode-sort-duration')).toBeInTheDocument()
    expect(screen.getByTestId('shorts-mode-sort-created')).toBeInTheDocument()
  })
})

// ── ShortsMode filtering ──────────────────────────────────────────────────────

describe('ShortsMode — filtering', () => {
  it('"All" tab is selected by default', () => {
    render(<ShortsMode />)
    expect(screen.getByTestId('shorts-mode-platform-all')).toHaveAttribute('aria-selected', 'true')
  })

  it('clicking a platform filter tab updates store', () => {
    render(<ShortsMode />)
    fireEvent.click(screen.getByTestId('shorts-mode-platform-youtube'))
    expect(useShortsStore.getState().activePlatform).toBe('youtube')
  })
})

// ── ShortsMode sorting ────────────────────────────────────────────────────────

describe('ShortsMode — sorting', () => {
  it('clicking duration sort changes sortBy', () => {
    render(<ShortsMode />)
    fireEvent.click(screen.getByTestId('shorts-mode-sort-duration'))
    expect(useShortsStore.getState().sortBy).toBe('duration')
  })

  it('virality sort is default', () => {
    render(<ShortsMode />)
    expect(useShortsStore.getState().sortBy).toBe('virality')
  })
})

// ── ShortsCard interactions ───────────────────────────────────────────────────

describe('ShortsMode — card interactions', () => {
  it('each card has a virality ring', () => {
    render(<ShortsMode />)
    INITIAL_SHORTS.forEach((s) => {
      expect(screen.getByTestId(`virality-ring-${s.id}`)).toBeInTheDocument()
    })
  })

  it('each card has a platform scores section', () => {
    render(<ShortsMode />)
    INITIAL_SHORTS.forEach((s) => {
      expect(screen.getByTestId(`platform-scores-${s.id}`)).toBeInTheDocument()
    })
  })

  it('each card shows the active hook', () => {
    render(<ShortsMode />)
    INITIAL_SHORTS.forEach((s) => {
      expect(screen.getByTestId(`active-hook-${s.id}`)).toBeInTheDocument()
    })
  })

  it('approve button approves the short', () => {
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`approve-short-${firstShort.id}`))
    expect(useShortsStore.getState().shorts.find((s) => s.id === firstShort.id)!.status).toBe('approved')
  })

  it('export button shows Exporting while queued', async () => {
    useAssetStore.getState().setAsset({
      id: 'asset-1',
      filename: 'test.mp4',
      durationSeconds: 120,
      status: 'ready',
      storageKey: 'projects/test/assets/asset-1',
      videoUrl: 'http://example.com/v.mp4',
    })
    render(<ShortsMode projectId="proj-1" />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`export-short-${firstShort.id}`))
    expect(screen.getByTestId(`export-short-${firstShort.id}`)).toHaveTextContent('Exporting')
  })

  it('clicking thumbnail starts in-card short preview', () => {
    HTMLMediaElement.prototype.play = () => Promise.resolve()
    HTMLMediaElement.prototype.pause = () => {}
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => 4,
    })

    useAssetStore.getState().setAsset({
      id: 'asset-1',
      filename: 'test.mp4',
      durationSeconds: 120,
      status: 'ready',
      storageKey: 'projects/test/assets/asset-1',
      videoUrl: 'http://example.com/v.mp4',
    })
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    expect(screen.getByTestId(`short-card-video-${firstShort.id}`)).toHaveAttribute(
      'src',
      'http://example.com/v.mp4',
    )
    fireEvent.click(screen.getByTestId(`short-thumbnail-${firstShort.id}`))
    expect(useShortsStore.getState().activePreviewId).toBe(firstShort.id)
  })

  it('short styling panel applies filter without timeline changes', () => {
    const clipsBefore = useTimelineStore.getState().clips.length
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`short-enhance-toggle-${firstShort.id}`))
    fireEvent.click(screen.getByTestId(`short-enhance-tab-effects-${firstShort.id}`))
    fireEvent.click(screen.getByTestId(`short-filter-warm-${firstShort.id}`))
    expect(useShortsStore.getState().shorts.find((s) => s.id === firstShort.id)!.styling.filterId).toBe('warm')
    expect(useTimelineStore.getState().clips.length).toBe(clipsBefore)
  })
})

// ── Bulk selection ────────────────────────────────────────────────────────────

describe('ShortsMode — bulk selection', () => {
  it('clicking a checkbox selects the short', () => {
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`select-short-${firstShort.id}`))
    expect(useShortsStore.getState().selectedShortIds).toContain(firstShort.id)
  })

  it('clicking select all selects all shorts', () => {
    render(<ShortsMode />)
    fireEvent.click(screen.getByTestId('shorts-mode-select-all'))
    expect(useShortsStore.getState().selectedShortIds).toHaveLength(INITIAL_SHORTS.length)
  })

  it('bulk action bar appears when shorts are selected', () => {
    useShortsStore.getState().toggleShortSelection(INITIAL_SHORTS[0].id)
    render(<ShortsMode />)
    expect(screen.getByTestId('bulk-action-bar')).toBeInTheDocument()
  })

  it('bulk action bar shows selected count', () => {
    useShortsStore.getState().toggleShortSelection(INITIAL_SHORTS[0].id)
    useShortsStore.getState().toggleShortSelection(INITIAL_SHORTS[1].id)
    render(<ShortsMode />)
    expect(screen.getByTestId('bulk-action-bar')).toHaveTextContent('2 selected')
  })

  it('bulk approve button approves all selected', () => {
    useShortsStore.getState().toggleShortSelection(INITIAL_SHORTS[0].id)
    useShortsStore.getState().toggleShortSelection(INITIAL_SHORTS[1].id)
    render(<ShortsMode />)
    fireEvent.click(screen.getByTestId('bulk-approve'))
    const { shorts } = useShortsStore.getState()
    expect(shorts.find((s) => s.id === INITIAL_SHORTS[0].id)!.status).toBe('approved')
    expect(shorts.find((s) => s.id === INITIAL_SHORTS[1].id)!.status).toBe('approved')
  })

  it('bulk clear button clears selection', () => {
    useShortsStore.getState().toggleShortSelection(INITIAL_SHORTS[0].id)
    render(<ShortsMode />)
    fireEvent.click(screen.getByTestId('bulk-clear'))
    expect(useShortsStore.getState().selectedShortIds).toHaveLength(0)
  })

  it('bulk action bar is hidden when no shorts are selected', () => {
    render(<ShortsMode />)
    expect(screen.queryByTestId('bulk-action-bar')).toBeNull()
  })
})

// ── Hook selector ─────────────────────────────────────────────────────────────

describe('ShortsMode — hook selector', () => {
  it('"Change hook" button shows hook selector', () => {
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`change-hook-${firstShort.id}`))
    expect(screen.getByTestId(`hook-selector-${firstShort.id}`)).toBeInTheDocument()
  })

  it('hook options are rendered', () => {
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`change-hook-${firstShort.id}`))
    for (let i = 0; i < firstShort.hooks.length; i++) {
      expect(screen.getByTestId(`hook-option-${firstShort.id}-${i}`)).toBeInTheDocument()
    }
  })

  it('clicking a hook option updates activeHook', () => {
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`change-hook-${firstShort.id}`))
    fireEvent.click(screen.getByTestId(`hook-option-${firstShort.id}-1`))
    expect(useShortsStore.getState().shorts.find((s) => s.id === firstShort.id)!.activeHook)
      .toBe(firstShort.hooks[1])
  })

  it('first hook is active by default', () => {
    render(<ShortsMode />)
    const firstShort = INITIAL_SHORTS[0]
    fireEvent.click(screen.getByTestId(`change-hook-${firstShort.id}`))
    expect(screen.getByTestId(`hook-option-${firstShort.id}-0`)).toHaveAttribute('aria-selected', 'true')
  })
})

// ── shortsStore additions ─────────────────────────────────────────────────────

describe('shortsStore — new actions', () => {
  it('setSortBy updates sortBy', () => {
    useShortsStore.getState().setSortBy('duration')
    expect(useShortsStore.getState().sortBy).toBe('duration')
  })

  it('sortedShorts by virality orders descending', () => {
    const sorted = useShortsStore.getState().sortedShorts()
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].viralityScore).toBeGreaterThanOrEqual(sorted[i + 1].viralityScore)
    }
  })

  it('sortedShorts by duration orders ascending', () => {
    useShortsStore.getState().setSortBy('duration')
    const sorted = useShortsStore.getState().sortedShorts()
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].duration).toBeLessThanOrEqual(sorted[i + 1].duration)
    }
  })

  it('toggleShortSelection adds and removes IDs', () => {
    useShortsStore.getState().toggleShortSelection('sh1')
    expect(useShortsStore.getState().selectedShortIds).toContain('sh1')
    useShortsStore.getState().toggleShortSelection('sh1')
    expect(useShortsStore.getState().selectedShortIds).not.toContain('sh1')
  })

  it('selectAllShorts selects all', () => {
    useShortsStore.getState().selectAllShorts()
    expect(useShortsStore.getState().selectedShortIds).toHaveLength(INITIAL_SHORTS.length)
  })

  it('clearShortSelection empties selection', () => {
    useShortsStore.getState().selectAllShorts()
    useShortsStore.getState().clearShortSelection()
    expect(useShortsStore.getState().selectedShortIds).toHaveLength(0)
  })

  it('approveSelected approves all selected', () => {
    useShortsStore.getState().toggleShortSelection('sh1')
    useShortsStore.getState().toggleShortSelection('sh2')
    useShortsStore.getState().approveSelected()
    expect(useShortsStore.getState().shorts.find((s) => s.id === 'sh1')!.status).toBe('approved')
    expect(useShortsStore.getState().shorts.find((s) => s.id === 'sh2')!.status).toBe('approved')
    expect(useShortsStore.getState().selectedShortIds).toHaveLength(0)
  })

  it('setCustomHook updates activeHook with custom text', () => {
    useShortsStore.getState().setCustomHook('sh1', 'My custom hook')
    expect(useShortsStore.getState().shorts.find((s) => s.id === 'sh1')!.activeHook)
      .toBe('My custom hook')
  })

  it('each short has viralityFactors', () => {
    useShortsStore.getState().shorts.forEach((s) => {
      expect(s.viralityFactors.length).toBeGreaterThan(0)
    })
  })

  it('each short has at least one positive and one negative factor', () => {
    useShortsStore.getState().shorts.forEach((s) => {
      expect(s.viralityFactors.some((f) => f.positive)).toBe(true)
      expect(s.viralityFactors.some((f) => !f.positive)).toBe(true)
    })
  })

  it('editorStore has editorMode = editor by default', () => {
    expect(useEditorStore.getState().editorMode).toBe('editor')
  })

  it('setEditorMode updates editorMode', () => {
    useEditorStore.getState().setEditorMode('shorts')
    expect(useEditorStore.getState().editorMode).toBe('shorts')
  })
})
