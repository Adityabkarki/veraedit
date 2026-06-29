/**
 * Tests for components/editor/Timeline.tsx and sub-components
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Timeline } from '@/components/editor/Timeline'
import { timelineTracksContentHeightPx } from '@/lib/timelineLayout'
import { tracksWithContent } from '@/lib/timelineLayers'
import {
  useTimelineStore,
  useEditorStore,
  INITIAL_TRACKS,
  INITIAL_CLIPS,
  PPS_DEFAULT,
} from '@/stores/timelineStore'
import { useEditorStore as useEditor, initialEditorState } from '@/stores/editorStore'
import { initialUIState, useUIStore } from '@/stores/uiStore'

beforeEach(() => {
  localStorage.clear()
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  useTimelineStore.setState({ snapEnabled: true, pixelsPerSecond: PPS_DEFAULT })
  useEditor.setState({ ...initialEditorState, tooltipsDismissed: { timeline: true } })
  useUIStore.setState({ ...initialUIState })
})

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('Timeline — structure', () => {
  it('renders the timeline container', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
  })

  it('renders the toolbar', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-toolbar')).toBeInTheDocument()
  })

  it('renders the time ruler', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-ruler')).toBeInTheDocument()
  })

  it('renders tracks that have clips (hides empty lanes)', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-track-video')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-track-audio')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-track-captions')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-track-music')).toBeInTheDocument()
    expect(screen.queryByTestId('timeline-track-camera')).not.toBeInTheDocument()
    expect(screen.queryByTestId('timeline-track-broll')).not.toBeInTheDocument()
  })

  it('renders all 4 track headers', () => {
    render(<Timeline />)
    expect(screen.getByTestId('track-header-video')).toBeInTheDocument()
    expect(screen.getByTestId('track-header-audio')).toBeInTheDocument()
    expect(screen.getByTestId('track-header-captions')).toBeInTheDocument()
    expect(screen.getByTestId('track-header-music')).toBeInTheDocument()
  })

  it('renders all 8 initial clips', () => {
    render(<Timeline />)
    INITIAL_CLIPS.forEach((clip) => {
      expect(screen.getByTestId(`clip-${clip.id}`)).toBeInTheDocument()
    })
  })

  it('renders the playhead', () => {
    render(<Timeline />)
    expect(screen.getByTestId('playhead')).toBeInTheDocument()
  })

  it('renders the clip content area', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-clip-area')).toBeInTheDocument()
  })
})

// ── Toolbar ───────────────────────────────────────────────────────────────────

describe('Timeline — toolbar', () => {
  it('renders zoom-in button', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-zoom-in')).toBeInTheDocument()
  })

  it('renders zoom-out button', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-zoom-out')).toBeInTheDocument()
  })

  it('renders zoom slider', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-zoom-slider')).toBeInTheDocument()
  })

  it('zoom slider value matches pixelsPerSecond', () => {
    render(<Timeline />)
    const slider = screen.getByTestId('timeline-zoom-slider') as HTMLInputElement
    expect(Number(slider.value)).toBe(PPS_DEFAULT)
  })

  it('clicking zoom-in calls zoomIn', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('timeline-zoom-in'))
    expect(useTimelineStore.getState().pixelsPerSecond).toBe(PPS_DEFAULT * 1.5)
  })

  it('clicking zoom-out calls zoomOut', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('timeline-zoom-out'))
    expect(useTimelineStore.getState().pixelsPerSecond).toBeCloseTo(PPS_DEFAULT / 1.5)
  })

  it('renders fit-to-width button', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-zoom-fit')).toBeInTheDocument()
  })

  it('fit button adjusts pixelsPerSecond to fit duration', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('timeline-zoom-fit'))
    const pps = useTimelineStore.getState().pixelsPerSecond
    expect(pps).toBeGreaterThanOrEqual(4)
    expect(pps).toBeLessThanOrEqual(400)
  })

  it('renders vertical tracks scroll container', () => {
    render(<Timeline />)
    expect(screen.getByTestId('timeline-tracks-scroll')).toBeInTheDocument()
  })

  it('sizes track headers and clip lanes to the same content height', () => {
    render(<Timeline />)
    const { tracks, clips } = useTimelineStore.getState()
    const visibleCount = tracksWithContent(tracks, clips).length
    const expectedHeight = timelineTracksContentHeightPx(visibleCount)

    expect(screen.getByTestId('timeline-tracks-content')).toHaveStyle({
      height: `${expectedHeight}px`,
    })
    expect(screen.getByTestId('timeline-horizontal-scroll')).toHaveStyle({
      height: `${expectedHeight}px`,
    })
    expect(screen.getByTestId('timeline-track-headers')).toHaveStyle({
      height: `${expectedHeight}px`,
    })
  })

  it('snap button is aria-pressed=true by default', () => {
    render(<Timeline />)
    const snap = screen.getByTestId('timeline-tool-snap')
    expect(snap).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking snap button toggles snap off', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('timeline-tool-snap'))
    expect(useTimelineStore.getState().snapEnabled).toBe(false)
    expect(screen.getByTestId('timeline-tool-snap')).toHaveAttribute('aria-pressed', 'false')
  })
})

// ── Track headers ─────────────────────────────────────────────────────────────

describe('Timeline — track header controls', () => {
  it('mute button toggles muted state', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('track-mute-video'))
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'video')!.muted).toBe(true)
  })

  it('mute button aria-pressed reflects muted state', () => {
    render(<Timeline />)
    const muteBtn = screen.getByTestId('track-mute-video')
    expect(muteBtn).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(muteBtn)
    expect(muteBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('lock button toggles locked state', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('track-lock-audio'))
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'audio')!.locked).toBe(true)
  })

  it('visibility button toggles visible state', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('track-visibility-captions'))
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'captions')!.visible).toBe(false)
  })
})

// ── Clips ─────────────────────────────────────────────────────────────────────

describe('Timeline — clip rendering', () => {
  it('clicking a clip selects it', () => {
    render(<Timeline />)
    fireEvent.click(screen.getByTestId('clip-v1'))
    expect(useTimelineStore.getState().selectedClipIds).toContain('v1')
  })

  it('selected clip has aria-selected=true', () => {
    useTimelineStore.getState().selectClip('v1')
    render(<Timeline />)
    expect(screen.getByTestId('clip-v1')).toHaveAttribute('aria-selected', 'true')
  })

  it('non-selected clip has aria-selected=false', () => {
    render(<Timeline />)
    expect(screen.getByTestId('clip-v1')).toHaveAttribute('aria-selected', 'false')
  })

  it('clips have trim handles', () => {
    render(<Timeline />)
    expect(screen.getByTestId('clip-v1-trim-left')).toBeInTheDocument()
    expect(screen.getByTestId('clip-v1-trim-right')).toBeInTheDocument()
  })

  it('right-clicking a clip shows context menu', () => {
    render(<Timeline />)
    fireEvent.contextMenu(screen.getByTestId('clip-v1'))
    expect(screen.getByTestId('clip-v1-context-menu')).toBeInTheDocument()
  })

  it('context menu has Split, Duplicate, Delete items', () => {
    render(<Timeline />)
    fireEvent.contextMenu(screen.getByTestId('clip-v1'))
    expect(screen.getByText(/Split at playhead/i)).toBeInTheDocument()
    expect(screen.getByText(/Duplicate/i)).toBeInTheDocument()
    expect(screen.getByText(/Delete/i)).toBeInTheDocument()
  })

  it('clicking Delete in context menu removes the clip', () => {
    render(<Timeline />)
    fireEvent.contextMenu(screen.getByTestId('clip-v1'))
    fireEvent.click(screen.getByText(/Delete/i))
    expect(useTimelineStore.getState().clips.find((c) => c.id === 'v1')).toBeUndefined()
  })

  it('clicking Duplicate in context menu adds a clip', () => {
    render(<Timeline />)
    const before = useTimelineStore.getState().clips.length
    fireEvent.contextMenu(screen.getByTestId('clip-v1'))
    fireEvent.click(screen.getByText(/Duplicate/i))
    expect(useTimelineStore.getState().clips.length).toBe(before + 1)
  })
})

// ── Ruler / playhead ──────────────────────────────────────────────────────────

describe('Timeline — ruler', () => {
  it('renders ruler playhead indicator', () => {
    render(<Timeline />)
    expect(screen.getByTestId('ruler-playhead')).toBeInTheDocument()
  })
})

// ── Undo toast ────────────────────────────────────────────────────────────────

describe('Timeline — undo toast', () => {
  it('shows undo toast after a clip is deleted', () => {
    render(<Timeline />)
    fireEvent.contextMenu(screen.getByTestId('clip-v1'))
    fireEvent.click(screen.getByText(/Delete/i))
    expect(screen.getByTestId('undo-toast')).toBeInTheDocument()
  })

  it('toast shows the action name', () => {
    render(<Timeline />)
    fireEvent.contextMenu(screen.getByTestId('clip-v1'))
    fireEvent.click(screen.getByText(/Delete/i))
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Deleted 1 clip')
  })

  it('toast is not shown when no edit has been made', () => {
    render(<Timeline />)
    expect(screen.queryByTestId('undo-toast')).toBeNull()
  })
})
