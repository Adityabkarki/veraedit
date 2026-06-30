/**
 * Tests for ShortsTab.tsx, ScenesPanel.tsx, and LeftPanel tab routing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShortsTab }   from '@/components/editor/ShortsTab'
import { ScenesPanel } from '@/components/editor/ScenesPanel'
import { LeftPanel }   from '@/components/editor/LeftPanel'
import { useShortsStore, INITIAL_SHORTS }  from '@/stores/shortsStore'
import { useScenesStore, INITIAL_SCENES }  from '@/stores/scenesStore'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { usePlayerStore, initialPlayerState } from '@/stores/playerStore'
import { useAssetStore } from '@/stores/assetStore'
import { useTimelineStore, INITIAL_TRACKS, INITIAL_CLIPS, PPS_DEFAULT } from '@/stores/timelineStore'

beforeEach(() => {
  useShortsStore.getState().resetShorts()
  useScenesStore.getState().resetScenes()
  useShortsStore.getState().loadDemoData()
  useScenesStore.getState().loadDemoData()
  useEditorStore.setState({ ...initialEditorState, tooltipsDismissed: { left: true } })
  usePlayerStore.setState({ ...initialPlayerState })
  useAssetStore.getState().clearAsset()
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  localStorage.clear()
})

// ── ShortsTab ─────────────────────────────────────────────────────────────────

describe('ShortsTab — structure', () => {
  it('renders the shorts tab container', () => {
    render(<ShortsTab />)
    expect(screen.getByTestId('shorts-tab')).toBeInTheDocument()
  })

  it('renders all platform filter tabs', () => {
    render(<ShortsTab />)
    expect(screen.getByTestId('shorts-platform-all')).toBeInTheDocument()
    expect(screen.getByTestId('shorts-platform-youtube')).toBeInTheDocument()
    expect(screen.getByTestId('shorts-platform-facebook')).toBeInTheDocument()
    expect(screen.getByTestId('shorts-platform-tiktok')).toBeInTheDocument()
    expect(screen.getByTestId('shorts-platform-instagram')).toBeInTheDocument()
  })

  it('"All" tab is selected by default', () => {
    render(<ShortsTab />)
    expect(screen.getByTestId('shorts-platform-all')).toHaveAttribute('aria-selected', 'true')
  })

  it('renders all short cards', () => {
    render(<ShortsTab />)
    INITIAL_SHORTS.forEach((s) => {
      expect(screen.getByTestId(`short-card-${s.id}`)).toBeInTheDocument()
    })
  })

  it('renders virality rings', () => {
    render(<ShortsTab />)
    const rings = screen.getAllByTestId('virality-ring')
    expect(rings.length).toBe(INITIAL_SHORTS.length)
  })

  it('renders hook text for each short', () => {
    render(<ShortsTab />)
    INITIAL_SHORTS.forEach((s) => {
      expect(screen.getByTestId(`short-hook-${s.id}`)).toBeInTheDocument()
    })
  })
})

describe('ShortsTab — platform filter', () => {
  it('clicking YouTube filter sets platform', () => {
    render(<ShortsTab />)
    fireEvent.click(screen.getByTestId('shorts-platform-youtube'))
    expect(useShortsStore.getState().activePlatform).toBe('youtube')
  })

  it('clicking Facebook filter changes tab aria-selected', () => {
    render(<ShortsTab />)
    fireEvent.click(screen.getByTestId('shorts-platform-facebook'))
    expect(screen.getByTestId('shorts-platform-facebook')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('shorts-platform-all')).toHaveAttribute('aria-selected', 'false')
  })
})

describe('ShortsTab — play / export / platform scores', () => {
  it('renders Export button for every short', () => {
    render(<ShortsTab />)
    expect(screen.getByTestId(`short-export-${INITIAL_SHORTS[0].id}`)).toBeInTheDocument()
  })

  it('renders Play button for every short', () => {
    render(<ShortsTab />)
    expect(screen.getByTestId(`short-play-${INITIAL_SHORTS[0].id}`)).toBeInTheDocument()
  })

  it('renders per-platform score chips', () => {
    render(<ShortsTab />)
    const s = INITIAL_SHORTS[0]
    expect(screen.getByTestId(`short-score-${s.id}-youtube`)).toBeInTheDocument()
    expect(screen.getByTestId(`short-score-${s.id}-facebook`)).toBeInTheDocument()
  })

  it('clicking a short card triggers preview playback', () => {
    useAssetStore.getState().setAsset({
      id: 'asset-1',
      filename: 'test.mp4',
      durationSeconds: 120,
      status: 'ready',
      storageKey: 'projects/test/assets/asset-1',
      videoUrl: 'http://example.com/v.mp4',
    })
    render(<ShortsTab />)
    const firstShort = INITIAL_SHORTS[0]
    const card = screen.getByTestId(`short-card-${firstShort.id}`)
    fireEvent.click(card.querySelector('button')!)
    expect(usePlayerStore.getState().previewNonce).toBeGreaterThan(0)
    expect(usePlayerStore.getState().currentTime).toBe(firstShort.startTime)
  })
})

// ── ScenesPanel ───────────────────────────────────────────────────────────────

describe('ScenesPanel — structure', () => {
  it('renders the scenes panel', () => {
    render(<ScenesPanel />)
    expect(screen.getByTestId('scenes-panel')).toBeInTheDocument()
  })

  it('renders all scene items', () => {
    render(<ScenesPanel />)
    INITIAL_SCENES.forEach((s) => {
      expect(screen.getByTestId(`scene-item-${s.id}`)).toBeInTheDocument()
    })
  })

  it('shows the scene count', () => {
    render(<ScenesPanel />)
    expect(screen.getByText(new RegExp(`${INITIAL_SCENES.length} chapter`))).toBeInTheDocument()
  })
})

describe('ScenesPanel — intent icons + score bars', () => {
  it('renders an intent badge for each scene', () => {
    render(<ScenesPanel />)
    INITIAL_SCENES.forEach((s) => {
      expect(screen.getByTestId(`scene-intent-${s.id}`)).toBeInTheDocument()
    })
  })

  it('renders a score bar for each scene', () => {
    render(<ScenesPanel />)
    INITIAL_SCENES.forEach((s) => {
      expect(screen.getByTestId(`scene-score-bar-${s.id}`)).toBeInTheDocument()
    })
  })

  it('first scene has "hook" intent label', () => {
    render(<ScenesPanel />)
    expect(screen.getByTestId('scene-intent-sc1')).toHaveTextContent('Hook')
  })
})

describe('ScenesPanel — click to select + seek', () => {
  it('clicking a scene selects it in the store', () => {
    render(<ScenesPanel />)
    fireEvent.click(screen.getByTestId('scene-item-sc1'))
    expect(useScenesStore.getState().selectedSceneId).toBe('sc1')
  })

  it('clicking a scene seeks the player to startTime', () => {
    render(<ScenesPanel />)
    const scene = INITIAL_SCENES[0]
    fireEvent.click(screen.getByTestId('scene-item-sc1'))
    expect(usePlayerStore.getState().currentTime).toBe(scene.startTime)
  })

  it('clicking a scene updates the timeline playhead', () => {
    render(<ScenesPanel />)
    const scene = INITIAL_SCENES[0]
    fireEvent.click(screen.getByTestId('scene-item-sc1'))
    expect(useTimelineStore.getState().playheadTime).toBe(scene.startTime)
  })
})

// ── LeftPanel tab routing ─────────────────────────────────────────────────────

describe('LeftPanel — Brand tab routes to VisualLibraryPanel', () => {
  it('switching to Brand tab shows brand panel', () => {
    useEditorStore.setState({ activeLeftTab: 'brand' })
    render(<LeftPanel />)
    expect(screen.getByTestId('visual-library-panel')).toBeInTheDocument()
  })
})
