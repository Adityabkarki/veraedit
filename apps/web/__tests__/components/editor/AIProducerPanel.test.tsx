/**
 * Tests for AIProducerPanel.tsx and ProducerSection.tsx
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AIProducerPanel } from '@/components/editor/AIProducerPanel'
import {
  useProducerStore,
  initialProducerState,
  MOCK_CHAPTERS,
  MOCK_QUOTES,
} from '@/stores/producerStore'
import { useUIStore, initialUIState }         from '@/stores/uiStore'
import { usePlayerStore, initialPlayerState } from '@/stores/playerStore'
import { useTimelineStore, INITIAL_TRACKS, INITIAL_CLIPS, PPS_DEFAULT } from '@/stores/timelineStore'

beforeEach(() => {
  useProducerStore.setState({
    ...initialProducerState,
    status: { ...initialProducerState.status },
  })
  useUIStore.setState({ ...initialUIState })
  usePlayerStore.setState({ ...initialPlayerState })
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  localStorage.clear()
})

// ── Structure ─────────────────────────────────────────────────────────────────

describe('AIProducerPanel — structure', () => {
  it('renders the panel', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('ai-producer-panel')).toBeInTheDocument()
  })
  it('renders all 5 sections', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('producer-section-showNotes')).toBeInTheDocument()
    expect(screen.getByTestId('producer-section-chapters')).toBeInTheDocument()
    expect(screen.getByTestId('producer-section-quotes')).toBeInTheDocument()
    expect(screen.getByTestId('producer-section-social')).toBeInTheDocument()
    expect(screen.getByTestId('producer-section-newsletter')).toBeInTheDocument()
  })
  it('renders language toggle', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('producer-language-toggle')).toBeInTheDocument()
  })
  it('EN is selected by default', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('producer-lang-en')).toHaveAttribute('aria-pressed', 'true')
  })
})

// ── Generate buttons (idle state) ─────────────────────────────────────────────

describe('AIProducerPanel — idle state', () => {
  it('each section shows a Generate button when idle', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('generate-showNotes')).toBeInTheDocument()
    expect(screen.getByTestId('generate-chapters')).toBeInTheDocument()
    expect(screen.getByTestId('generate-quotes')).toBeInTheDocument()
    expect(screen.getByTestId('generate-social')).toBeInTheDocument()
    expect(screen.getByTestId('generate-newsletter')).toBeInTheDocument()
  })
  it('clicking Generate flips status to generating', () => {
    render(<AIProducerPanel />)
    fireEvent.click(screen.getByTestId('generate-showNotes'))
    expect(useProducerStore.getState().status.showNotes).toBe('generating')
  })
})

// ── Generating state ──────────────────────────────────────────────────────────

describe('AIProducerPanel — generating state', () => {
  it('shows a spinner while generating', () => {
    useProducerStore.setState((s) => ({ status: { ...s.status, showNotes: 'generating' } }))
    render(<AIProducerPanel />)
    expect(screen.getByTestId('generating-showNotes')).toBeInTheDocument()
  })
})

// ── Done state — Show Notes ───────────────────────────────────────────────────

describe('AIProducerPanel — Show Notes result', () => {
  beforeEach(() => {
    useProducerStore.getState().generateNow('showNotes')
  })
  it('shows the result container', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('result-showNotes')).toBeInTheDocument()
  })
  it('renders the English summary by default', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('result-showNotes')).toHaveTextContent('AI-native video editing')
  })
  it('switching to Nepali shows Devanagari summary', () => {
    render(<AIProducerPanel />)
    fireEvent.click(screen.getByTestId('producer-lang-ne'))
    expect(screen.getByTestId('result-showNotes').textContent).toMatch(/editing|बदल्छ/)
  })
  it('shows a Regenerate button when done', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('regenerate-showNotes')).toBeInTheDocument()
  })
})

// ── Done state — Chapters ─────────────────────────────────────────────────────

describe('AIProducerPanel — Chapters result', () => {
  beforeEach(() => {
    useProducerStore.getState().generateNow('chapters')
  })
  it('renders all chapters', () => {
    render(<AIProducerPanel />)
    MOCK_CHAPTERS.forEach((c) => {
      expect(screen.getByTestId(`chapter-${c.id}`)).toBeInTheDocument()
    })
  })
  it('clicking a chapter seeks the player', () => {
    render(<AIProducerPanel />)
    fireEvent.click(screen.getByTestId(`chapter-${MOCK_CHAPTERS[1].id}`))
    expect(usePlayerStore.getState().currentTime).toBe(MOCK_CHAPTERS[1].startTime)
  })
  it('clicking a chapter updates timeline playhead', () => {
    render(<AIProducerPanel />)
    fireEvent.click(screen.getByTestId(`chapter-${MOCK_CHAPTERS[2].id}`))
    expect(useTimelineStore.getState().playheadTime).toBe(MOCK_CHAPTERS[2].startTime)
  })
})

// ── Done state — Key Quotes ───────────────────────────────────────────────────

describe('AIProducerPanel — Key Quotes result', () => {
  beforeEach(() => {
    useProducerStore.getState().generateNow('quotes')
  })
  it('renders all quotes', () => {
    render(<AIProducerPanel />)
    MOCK_QUOTES.forEach((q) => {
      expect(screen.getByTestId(`quote-${q.id}`)).toBeInTheDocument()
    })
  })
  it('clicking a quote seek button jumps the player', () => {
    render(<AIProducerPanel />)
    fireEvent.click(screen.getByTestId(`quote-seek-${MOCK_QUOTES[0].id}`))
    expect(usePlayerStore.getState().currentTime).toBe(MOCK_QUOTES[0].startTime)
  })
  it('each quote has a copy button', () => {
    render(<AIProducerPanel />)
    MOCK_QUOTES.forEach((q) => {
      expect(screen.getByTestId(`quote-copy-${q.id}`)).toBeInTheDocument()
    })
  })
})

// ── Done state — Social Posts ─────────────────────────────────────────────────

describe('AIProducerPanel — Social Posts result', () => {
  beforeEach(() => {
    useProducerStore.getState().generateNow('social')
  })
  it('renders platform tabs', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('social-tab-twitter')).toBeInTheDocument()
    expect(screen.getByTestId('social-tab-linkedin')).toBeInTheDocument()
    expect(screen.getByTestId('social-tab-facebook')).toBeInTheDocument()
    expect(screen.getByTestId('social-tab-instagram')).toBeInTheDocument()
  })
  it('shows the twitter post by default', () => {
    render(<AIProducerPanel />)
    expect(screen.getByTestId('social-post-twitter')).toBeInTheDocument()
  })
  it('clicking LinkedIn tab shows LinkedIn post', () => {
    render(<AIProducerPanel />)
    fireEvent.click(screen.getByTestId('social-tab-linkedin'))
    expect(screen.getByTestId('social-post-linkedin')).toBeInTheDocument()
  })
})

// ── Done state — Newsletter ───────────────────────────────────────────────────

describe('AIProducerPanel — Newsletter result', () => {
  it('renders the newsletter blurb after generation', () => {
    useProducerStore.getState().generateNow('newsletter')
    render(<AIProducerPanel />)
    expect(screen.getByTestId('result-newsletter')).toBeInTheDocument()
    expect(screen.getByTestId('copy-newsletter')).toBeInTheDocument()
  })
})

// ── Mode switch ───────────────────────────────────────────────────────────────

describe('AIProducerPanel — mode switch', () => {
  it('Back to AI button switches right panel mode', () => {
    useUIStore.setState({ rightPanelMode: 'producer' })
    render(<AIProducerPanel />)
    fireEvent.click(screen.getByTestId('producer-back-to-ai'))
    expect(useUIStore.getState().rightPanelMode).toBe('ai')
  })
})
