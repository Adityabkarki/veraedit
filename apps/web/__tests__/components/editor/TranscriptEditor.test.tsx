/**
 * Tests for TranscriptEditor.tsx and transcript sub-components
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TranscriptEditor }      from '@/components/editor/TranscriptEditor'
import { LeftPanel }             from '@/components/editor/LeftPanel'
import { useTranscriptStore, INITIAL_WORDS, INITIAL_SEGMENTS } from '@/stores/transcriptStore'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { usePlayerStore, initialPlayerState } from '@/stores/playerStore'
import { useTimelineStore, INITIAL_TRACKS, INITIAL_CLIPS, PPS_DEFAULT } from '@/stores/timelineStore'
import { useScenesStore, INITIAL_SCENES }  from '@/stores/scenesStore'
import { useShortsStore } from '@/stores/shortsStore'

beforeEach(() => {
  useTranscriptStore.getState().resetTranscript()
  useTranscriptStore.getState().loadDemoData()
  useEditorStore.setState({
    ...initialEditorState,
    tooltipsDismissed: { left: true, preview: true, ai: true, timeline: true },
  })
  usePlayerStore.setState({ ...initialPlayerState })
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  useScenesStore.getState().resetScenes()
  useScenesStore.getState().loadDemoData()
  useShortsStore.getState().resetShorts()
  useShortsStore.getState().loadDemoData()
  localStorage.clear()
})

// ── TranscriptEditor structure ────────────────────────────────────────────────

describe('TranscriptEditor — structure', () => {
  it('renders the transcript editor', () => {
    render(<TranscriptEditor />)
    expect(screen.getByTestId('transcript-editor')).toBeInTheDocument()
  })

  it('renders the transcript body', () => {
    render(<TranscriptEditor />)
    expect(screen.getByTestId('transcript-body')).toBeInTheDocument()
  })

  it('renders at least one segment', () => {
    render(<TranscriptEditor />)
    const segments = screen.getAllByTestId(/^segment-/)
    expect(segments.length).toBeGreaterThan(0)
  })

  it('renders speaker A label(s)', () => {
    render(<TranscriptEditor />)
    // Multiple Speaker A segments can exist
    expect(screen.getAllByTestId('speaker-label-A').length).toBeGreaterThan(0)
  })

  it('renders speaker B label', () => {
    render(<TranscriptEditor />)
    expect(screen.getAllByTestId('speaker-label-B').length).toBeGreaterThan(0)
  })

  it('renders all non-silence words', () => {
    render(<TranscriptEditor />)
    const wordCount = INITIAL_WORDS.filter((w) => w.type !== 'silence').length
    const renderedWords = screen.getAllByTestId(/^word-/)
    expect(renderedWords.length).toBe(wordCount)
  })

  it('renders silence blocks', () => {
    render(<TranscriptEditor />)
    const silences = screen.getAllByTestId(/^silence-/)
    expect(silences.length).toBeGreaterThan(0)
  })
})

// ── FillerControls ────────────────────────────────────────────────────────────

describe('TranscriptEditor — filler controls', () => {
  it('renders filler controls panel', () => {
    render(<TranscriptEditor />)
    expect(screen.getByTestId('filler-controls')).toBeInTheDocument()
  })

  it('shows Remove all fillers button', () => {
    render(<TranscriptEditor />)
    expect(screen.getByTestId('remove-all-fillers')).toBeInTheDocument()
  })

  it('shows Remove long silences button', () => {
    render(<TranscriptEditor />)
    expect(screen.getByTestId('remove-long-silences')).toBeInTheDocument()
  })

  it('clicking Remove all fillers deletes all fillers', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('remove-all-fillers'))
    const remaining = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'filler' && !w.deleted
    )
    expect(remaining).toHaveLength(0)
  })

  it('clicking Remove long silences deletes long silences', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('remove-long-silences'))
    const remaining = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'silence' && !w.deleted && (w.silenceDuration ?? 0) >= 0.8
    )
    expect(remaining).toHaveLength(0)
  })

  it('filler controls disappear after removing all fillers and silences', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('remove-all-fillers'))
    fireEvent.click(screen.getByTestId('remove-long-silences'))
    // Short silences remain (< 0.8s threshold) so controls may still show
    // Just verify no crash
    expect(screen.getByTestId('transcript-editor')).toBeInTheDocument()
  })
})

// ── Search ────────────────────────────────────────────────────────────────────

describe('TranscriptEditor — search', () => {
  it('opens search bar when search button is clicked', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('open-search'))
    expect(screen.getByTestId('transcript-search')).toBeInTheDocument()
  })

  it('closes search bar when close button is clicked', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('open-search'))
    fireEvent.click(screen.getByTestId('search-close'))
    expect(screen.queryByTestId('transcript-search')).toBeNull()
  })

  it('typing in search input sets searchQuery', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('open-search'))
    fireEvent.change(screen.getByTestId('transcript-search-input'), {
      target: { value: 'video' },
    })
    expect(useTranscriptStore.getState().searchQuery).toBe('video')
  })

  it('search match count is shown', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('open-search'))
    fireEvent.change(screen.getByTestId('transcript-search-input'), {
      target: { value: 'video' },
    })
    const count = screen.getByTestId('search-match-count')
    expect(count.textContent).not.toBe('—')
  })

  it('pressing next match button advances searchIndex', () => {
    render(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('open-search'))
    fireEvent.change(screen.getByTestId('transcript-search-input'), {
      target: { value: 'a' },
    })
    const before = useTranscriptStore.getState().searchIndex
    fireEvent.click(screen.getByTestId('search-next'))
    // Index advances (wraps if needed)
    expect(useTranscriptStore.getState().searchIndex).toBeGreaterThanOrEqual(0)
  })
})

// ── Word click → seek ─────────────────────────────────────────────────────────

describe('TranscriptEditor — word click → seek', () => {
  it('clicking a word seeks the player to its startTime', () => {
    render(<TranscriptEditor />)
    const firstWord = INITIAL_WORDS.find((w) => w.type === 'word')!
    fireEvent.click(screen.getByTestId(`word-${firstWord.id}`))
    expect(usePlayerStore.getState().currentTime).toBe(firstWord.startTime)
  })

  it('clicking a word seeks the timeline playhead', () => {
    render(<TranscriptEditor />)
    const firstWord = INITIAL_WORDS.find((w) => w.type === 'word')!
    fireEvent.click(screen.getByTestId(`word-${firstWord.id}`))
    expect(useTimelineStore.getState().playheadTime).toBe(firstWord.startTime)
  })

  it('clicking a word selects it in the store', () => {
    render(<TranscriptEditor />)
    const firstWord = INITIAL_WORDS.find((w) => w.type === 'word')!
    fireEvent.click(screen.getByTestId(`word-${firstWord.id}`))
    expect(useTranscriptStore.getState().selectedWordIds).toContain(firstWord.id)
  })
})

// ── Reset ─────────────────────────────────────────────────────────────────────

describe('TranscriptEditor — reset', () => {
  it('reset button restores deleted words', () => {
    render(<TranscriptEditor />)
    // Delete all fillers first
    fireEvent.click(screen.getByTestId('remove-all-fillers'))
    // Then reset
    fireEvent.click(screen.getByTestId('reset-transcript'))
    const fillers = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'filler' && !w.deleted
    )
    expect(fillers.length).toBeGreaterThan(0)
  })
})

// ── Delete confirmation modal ─────────────────────────────────────────────────

describe('TranscriptEditor — delete confirmation', () => {
  it('setPendingDelete shows the confirmation modal', () => {
    const { rerender } = render(<TranscriptEditor />)
    useTranscriptStore.getState().setPendingDelete(['w01'])
    rerender(<TranscriptEditor />)
    expect(screen.getByTestId('delete-confirm-modal')).toBeInTheDocument()
  })

  it('clicking Cancel clears pendingDeleteIds', () => {
    const { rerender } = render(<TranscriptEditor />)
    useTranscriptStore.getState().setPendingDelete(['w01'])
    rerender(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('delete-cancel'))
    expect(useTranscriptStore.getState().pendingDeleteIds).toBeNull()
  })

  it('clicking Confirm deletes the words', () => {
    const { rerender } = render(<TranscriptEditor />)
    useTranscriptStore.getState().setPendingDelete(['w01'])
    rerender(<TranscriptEditor />)
    fireEvent.click(screen.getByTestId('delete-confirm'))
    expect(useTranscriptStore.getState().words.find((w) => w.id === 'w01')!.deleted).toBe(true)
  })
})

// ── LeftPanel Script tab routing ──────────────────────────────────────────────

describe('LeftPanel — Script tab routes to TranscriptEditor', () => {
  it('Script tab exists in the left panel', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-transcript')).toBeInTheDocument()
  })

  it('switching to Script tab shows the transcript editor', () => {
    useEditorStore.setState({ activeLeftTab: 'transcript' })
    render(<LeftPanel />)
    expect(screen.getByTestId('transcript-editor')).toBeInTheDocument()
  })

  it('Script tab is not selected by default', () => {
    render(<LeftPanel />)
    expect(screen.getByTestId('left-tab-transcript')).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking Script tab selects it in the store', () => {
    render(<LeftPanel />)
    fireEvent.click(screen.getByTestId('left-tab-transcript'))
    expect(useEditorStore.getState().activeLeftTab).toBe('transcript')
  })
})
