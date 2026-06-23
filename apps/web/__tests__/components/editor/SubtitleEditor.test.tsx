/**
 * Tests for SubtitleEditorPanel.tsx and sub-components
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubtitleEditorPanel } from '@/components/editor/SubtitleEditorPanel'
import { useCaptionsStore, INITIAL_CAPTIONS } from '@/stores/captionsStore'
import { useUIStore, initialUIState }         from '@/stores/uiStore'
import { usePlayerStore, initialPlayerState } from '@/stores/playerStore'
import { useTimelineStore, INITIAL_TRACKS, INITIAL_CLIPS, PPS_DEFAULT } from '@/stores/timelineStore'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'

beforeEach(() => {
  useCaptionsStore.getState().resetCaptions()
  useCaptionsStore.getState().loadDemoData()
  useUIStore.setState({ ...initialUIState })
  usePlayerStore.setState({ ...initialPlayerState })
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  useEditorStore.setState({ ...initialEditorState })
  localStorage.clear()
})

// ── Structure ─────────────────────────────────────────────────────────────────

describe('SubtitleEditorPanel — structure', () => {
  it('renders the subtitle editor panel', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('subtitle-editor-panel')).toBeInTheDocument()
  })
  it('renders the caption list', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('caption-list')).toBeInTheDocument()
  })
  it('renders all 12 initial captions', () => {
    render(<SubtitleEditorPanel />)
    INITIAL_CAPTIONS.forEach((c) => {
      expect(screen.getByTestId(`caption-row-${c.id}`)).toBeInTheDocument()
    })
  })
  it('renders the style picker', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('style-picker')).toBeInTheDocument()
  })
  it('renders the export options', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('export-options')).toBeInTheDocument()
  })
  it('find/replace bar is hidden initially', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.queryByTestId('find-replace-bar')).toBeNull()
  })
})

// ── Caption rows ──────────────────────────────────────────────────────────────

describe('SubtitleEditorPanel — caption rows', () => {
  it('shows caption text (Devanagari)', () => {
    render(<SubtitleEditorPanel />)
    // First caption is 'नमस्ते साथीहरू!' in Nepali
    expect(screen.getByTestId('caption-text-cap-01')).toBeInTheDocument()
    expect(screen.getByTestId('caption-text-cap-01').textContent).toContain('नमस्ते')
  })
  it('shows timestamps', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('caption-start-cap-01')).toBeInTheDocument()
    expect(screen.getByTestId('caption-end-cap-01')).toBeInTheDocument()
  })
  it('clicking a row selects it', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('caption-row-cap-01'))
    expect(useCaptionsStore.getState().selectedId).toBe('cap-01')
  })
  it('clicking a row seeks the player', () => {
    render(<SubtitleEditorPanel />)
    const cap = INITIAL_CAPTIONS[0]
    fireEvent.click(screen.getByTestId('caption-row-cap-01'))
    expect(usePlayerStore.getState().currentTime).toBe(cap.startTime)
  })
  it('clicking text area starts editing', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('caption-text-cap-01'))
    expect(useCaptionsStore.getState().editingId).toBe('cap-01')
  })
  it('textarea appears when editing', () => {
    useCaptionsStore.getState().startEdit('cap-01')
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('caption-text-input-cap-01')).toBeInTheDocument()
  })
  it('updating textarea updates caption text', () => {
    useCaptionsStore.getState().startEdit('cap-01')
    render(<SubtitleEditorPanel />)
    fireEvent.change(screen.getByTestId('caption-text-input-cap-01'), {
      target: { value: 'New caption text' },
    })
    expect(useCaptionsStore.getState().captions.find((c) => c.id === 'cap-01')!.text)
      .toBe('New caption text')
  })
  it('add button adds a caption after', () => {
    render(<SubtitleEditorPanel />)
    const before = useCaptionsStore.getState().captions.length
    fireEvent.click(screen.getByTestId('caption-add-cap-01'))
    expect(useCaptionsStore.getState().captions.length).toBe(before + 1)
  })
  it('delete button removes the caption', () => {
    render(<SubtitleEditorPanel />)
    const before = useCaptionsStore.getState().captions.length
    fireEvent.click(screen.getByTestId('caption-delete-cap-01'))
    expect(useCaptionsStore.getState().captions.length).toBe(before - 1)
  })
})

// ── Style picker ──────────────────────────────────────────────────────────────

describe('SubtitleEditorPanel — style picker', () => {
  it('renders all 4 preset buttons', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('style-preset-nepali-bold')).toBeInTheDocument()
    expect(screen.getByTestId('style-preset-subtitle')).toBeInTheDocument()
    expect(screen.getByTestId('style-preset-tiktok')).toBeInTheDocument()
    expect(screen.getByTestId('style-preset-bilingual')).toBeInTheDocument()
  })
  it('clicking subtitle preset changes global style', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('style-preset-subtitle'))
    expect(useCaptionsStore.getState().globalStyle.preset).toBe('subtitle')
  })
  it('nepali-bold is active by default (aria-pressed=true)', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('style-preset-nepali-bold')).toHaveAttribute('aria-pressed', 'true')
  })
  it('size buttons are rendered', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('size-small')).toBeInTheDocument()
    expect(screen.getByTestId('size-medium')).toBeInTheDocument()
    expect(screen.getByTestId('size-large')).toBeInTheDocument()
    expect(screen.getByTestId('size-xl')).toBeInTheDocument()
  })
  it('clicking a size button updates fontSize', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('size-small'))
    expect(useCaptionsStore.getState().globalStyle.fontSize).toBe('small')
  })
  it('position buttons are rendered', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('position-top')).toBeInTheDocument()
    expect(screen.getByTestId('position-center')).toBeInTheDocument()
    expect(screen.getByTestId('position-bottom')).toBeInTheDocument()
  })
  it('bold toggle changes bold state', () => {
    render(<SubtitleEditorPanel />)
    const currentBold = useCaptionsStore.getState().globalStyle.bold
    fireEvent.click(screen.getByTestId('style-bold'))
    expect(useCaptionsStore.getState().globalStyle.bold).toBe(!currentBold)
  })
  it('Nepali font toggle changes useNepaliFont', () => {
    render(<SubtitleEditorPanel />)
    const current = useCaptionsStore.getState().globalStyle.useNepaliFont
    fireEvent.click(screen.getByTestId('style-nepali-font'))
    expect(useCaptionsStore.getState().globalStyle.useNepaliFont).toBe(!current)
  })
})

// ── Find / replace ────────────────────────────────────────────────────────────

describe('SubtitleEditorPanel — find/replace', () => {
  it('clicking search button shows find/replace bar', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('open-find-replace'))
    expect(screen.getByTestId('find-replace-bar')).toBeInTheDocument()
  })
  it('typing in find input updates search query', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('open-find-replace'))
    fireEvent.change(screen.getByTestId('find-input'), { target: { value: 'नमस्ते' } })
    expect(useCaptionsStore.getState().searchQuery).toBe('नमस्ते')
  })
  it('match count shows when there are matches', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('open-find-replace'))
    fireEvent.change(screen.getByTestId('find-input'), { target: { value: 'video' } })
    expect(screen.getByTestId('find-match-count')).toBeInTheDocument()
  })
  it('Replace all button triggers replaceAll', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('open-find-replace'))
    fireEvent.change(screen.getByTestId('find-input'), { target: { value: 'video' } })
    fireEvent.change(screen.getByTestId('replace-input'), { target: { value: 'VIDEO' } })
    fireEvent.click(screen.getByTestId('replace-all-button'))
    // After replace, no captions should have 'video' (only 'VIDEO')
    const { captions } = useCaptionsStore.getState()
    const hasLower = captions.some((c) => c.text.toLowerCase().includes('video') && !c.text.toLowerCase().includes('video'.toUpperCase().toLowerCase()))
    expect(useCaptionsStore.getState().searchMatchIds).toHaveLength(0)
  })
  it('case-sensitive toggle changes flag', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('open-find-replace'))
    fireEvent.click(screen.getByTestId('case-sensitive-toggle'))
    expect(useCaptionsStore.getState().caseSensitive).toBe(true)
  })
  it('close button hides the find/replace bar', () => {
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('open-find-replace'))
    fireEvent.click(screen.getByTestId('find-replace-close'))
    expect(screen.queryByTestId('find-replace-bar')).toBeNull()
  })
})

// ── Export options ────────────────────────────────────────────────────────────

describe('SubtitleEditorPanel — export options', () => {
  it('renders SRT export button', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('export-srt')).toBeInTheDocument()
  })
  it('renders VTT export button', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('export-vtt')).toBeInTheDocument()
  })
  it('Burn-in button is disabled (requires video)', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('export-burn')).toBeDisabled()
  })
  it('shows caption count in export footer', () => {
    render(<SubtitleEditorPanel />)
    expect(screen.getByTestId('export-options')).toHaveTextContent('12 captions')
  })
})

// ── Right panel mode switch ───────────────────────────────────────────────────

describe('SubtitleEditorPanel — mode switch', () => {
  it('"← AI" button switches right panel mode to ai', () => {
    useUIStore.setState({ rightPanelMode: 'captions' })
    render(<SubtitleEditorPanel />)
    fireEvent.click(screen.getByTestId('back-to-ai'))
    expect(useUIStore.getState().rightPanelMode).toBe('ai')
  })
})
