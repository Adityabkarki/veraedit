/**
 * Tests for components/editor/AIPanel.tsx and AI sub-components
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AIPanel } from '@/components/editor/AIPanel'
import { useSuggestionsStore, PLACEHOLDER_SUGGESTIONS } from '@/stores/suggestionsStore'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { useUIStore, initialUIState } from '@/stores/uiStore'

beforeEach(() => {
  useSuggestionsStore.getState().resetSuggestions()
  useSuggestionsStore.getState().loadDemoData()
  useEditorStore.setState({ ...initialEditorState, tooltipsDismissed: { ai: true } })
  useUIStore.setState({ ...initialUIState })
})

// ── AIPanel structure ─────────────────────────────────────────────────────────

describe('AIPanel — structure', () => {
  it('renders the panel container', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('ai-panel')).toBeInTheDocument()
  })

  it('shows the "AI Suggestions" heading', () => {
    render(<AIPanel />)
    expect(screen.getByText('AI Suggestions')).toBeInTheDocument()
  })

  it('shows the pending count badge', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('pending-count')).toBeInTheDocument()
    expect(screen.getByTestId('pending-count')).toHaveTextContent('pending')
  })

  it('renders the suggestions list', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('ai-suggestions-list')).toBeInTheDocument()
  })

  it('renders all placeholder suggestions initially', () => {
    render(<AIPanel />)
    PLACEHOLDER_SUGGESTIONS.forEach((s) => {
      expect(screen.getByTestId(`suggestion-card-${s.id}`)).toBeInTheDocument()
    })
  })
})

// ── Filter tabs ───────────────────────────────────────────────────────────────

describe('AIPanel — filter tabs', () => {
  it('renders all 4 filter tabs', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('ai-filter-all')).toBeInTheDocument()
    expect(screen.getByTestId('ai-filter-cuts')).toBeInTheDocument()
    expect(screen.getByTestId('ai-filter-captions')).toBeInTheDocument()
    expect(screen.getByTestId('ai-filter-shorts')).toBeInTheDocument()
  })

  it('"All" tab is aria-selected by default', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('ai-filter-all')).toHaveAttribute('aria-selected', 'true')
  })

  it('clicking "Cuts" filters to cuts', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('ai-filter-cuts'))
    expect(useSuggestionsStore.getState().activeFilter).toBe('cuts')
    // Should only show cut/trim suggestions
    const visibleCards = screen.queryAllByTestId(/^suggestion-card-/)
    const visibleIds = visibleCards.map((el) => el.getAttribute('data-testid')!.replace('suggestion-card-', ''))
    const expectedIds = PLACEHOLDER_SUGGESTIONS
      .filter((s) => s.type === 'cut' || s.type === 'trim')
      .map((s) => s.id)
    expect(visibleIds.sort()).toEqual(expectedIds.sort())
  })

  it('clicking "Shorts" filters to shorts', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('ai-filter-shorts'))
    const cards = screen.queryAllByTestId(/^suggestion-card-/)
    const ids = cards.map((el) => el.getAttribute('data-testid')!.replace('suggestion-card-', ''))
    const expectedIds = PLACEHOLDER_SUGGESTIONS.filter((s) => s.type === 'short').map((s) => s.id)
    expect(ids.sort()).toEqual(expectedIds.sort())
  })

  it('clicking "Captions" filters to captions', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('ai-filter-captions'))
    const cards = screen.queryAllByTestId(/^suggestion-card-/)
    expect(cards.length).toBeGreaterThan(0)
    // All visible cards should be caption type
    const ids = cards.map((el) => el.getAttribute('data-testid')!.replace('suggestion-card-', ''))
    ids.forEach((id) => {
      const s = PLACEHOLDER_SUGGESTIONS.find((x) => x.id === id)!
      expect(s.type).toBe('caption')
    })
  })
})

// ── SuggestionCard interactions ───────────────────────────────────────────────

describe('AIPanel — suggestion card accept/reject', () => {
  it('clicking "Apply" changes suggestion to accepted', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('accept-suggestion-s1'))
    expect(useSuggestionsStore.getState().suggestions.find((s) => s.id === 's1')!.status).toBe('accepted')
  })

  it('accepted card shows "Applied" state', () => {
    useSuggestionsStore.getState().acceptSuggestion('s1')
    render(<AIPanel />)
    const card = screen.getByTestId('suggestion-card-s1')
    expect(card).toHaveTextContent('Applied')
  })

  it('accepted card shows "Undo" button', () => {
    useSuggestionsStore.getState().acceptSuggestion('s1')
    render(<AIPanel />)
    expect(screen.getByTestId('undo-suggestion-s1')).toBeInTheDocument()
  })

  it('clicking Undo on accepted card reverts to pending', () => {
    useSuggestionsStore.getState().acceptSuggestion('s1')
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('undo-suggestion-s1'))
    expect(useSuggestionsStore.getState().suggestions.find((s) => s.id === 's1')!.status).toBe('pending')
  })

  it('clicking reject changes status to rejected', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('reject-suggestion-s2'))
    expect(useSuggestionsStore.getState().suggestions.find((s) => s.id === 's2')!.status).toBe('rejected')
  })

  it('rejected card shows "Rejected" state', () => {
    useSuggestionsStore.getState().rejectSuggestion('s2')
    render(<AIPanel />)
    expect(screen.getByTestId('suggestion-card-s2')).toHaveTextContent('Rejected')
  })
})

// ── SuggestionCard expandable sections ───────────────────────────────────────

describe('AIPanel — expandable sections', () => {
  it('"Why?" section is hidden by default', () => {
    render(<AIPanel />)
    expect(screen.queryByTestId('why-section-s1')).toBeNull()
  })

  it('clicking "Why?" reveals the reasoning section', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('why-toggle-s1'))
    expect(screen.getByTestId('why-section-s1')).toBeInTheDocument()
  })

  it('"Why?" section shows the suggestion reasoning text', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('why-toggle-s1'))
    const s = PLACEHOLDER_SUGGESTIONS.find((x) => x.id === 's1')!
    expect(screen.getByTestId('why-section-s1')).toHaveTextContent(s.reasoning.slice(0, 20))
  })

  it('clicking "Why?" again collapses the section', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('why-toggle-s1'))
    fireEvent.click(screen.getByTestId('why-toggle-s1'))
    expect(screen.queryByTestId('why-section-s1')).toBeNull()
  })

  it('"What changes?" section is hidden by default', () => {
    render(<AIPanel />)
    expect(screen.queryByTestId('diff-section-s1')).toBeNull()
  })

  it('clicking "What changes?" reveals the diff section', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('diff-toggle-s1'))
    expect(screen.getByTestId('diff-section-s1')).toBeInTheDocument()
  })

  it('diff section contains DiffPreview', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('diff-toggle-s1'))
    expect(screen.getByTestId('diff-preview')).toBeInTheDocument()
  })

  it('"Why?" toggle has aria-expanded reflecting state', () => {
    render(<AIPanel />)
    const btn = screen.getByTestId('why-toggle-s1')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})

// ── Batch accept ──────────────────────────────────────────────────────────────

describe('AIPanel — batch accept', () => {
  it('shows batch accept button when there are high-confidence suggestions', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('batch-accept-button')).toBeInTheDocument()
  })

  it('batch button is hidden when no high-confidence suggestions are pending', () => {
    // Reject all high-confidence suggestions
    const high = useSuggestionsStore.getState().highConfidencePending()
    high.forEach((s) => useSuggestionsStore.getState().rejectSuggestion(s.id))
    render(<AIPanel />)
    expect(screen.queryByTestId('batch-accept-button')).toBeNull()
  })

  it('clicking batch-accept button opens the modal', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('batch-accept-button'))
    expect(useSuggestionsStore.getState().batchModalOpen).toBe(true)
  })

  it('batch modal renders when batchModalOpen is true', () => {
    useSuggestionsStore.getState().openBatchModal()
    render(<AIPanel />)
    expect(screen.getByTestId('batch-accept-modal')).toBeInTheDocument()
  })

  it('batch modal shows each high-confidence suggestion', () => {
    const high = useSuggestionsStore.getState().highConfidencePending()
    useSuggestionsStore.getState().openBatchModal()
    render(<AIPanel />)
    high.forEach((s) => {
      expect(screen.getByTestId(`batch-item-${s.id}`)).toBeInTheDocument()
    })
  })

  it('clicking "Cancel" in modal closes it', () => {
    useSuggestionsStore.getState().openBatchModal()
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('batch-cancel'))
    expect(useSuggestionsStore.getState().batchModalOpen).toBe(false)
  })

  it('clicking confirm in modal accepts all high-confidence suggestions', () => {
    useSuggestionsStore.getState().openBatchModal()
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('batch-confirm'))
    const accepted = useSuggestionsStore.getState().suggestions.filter((s) => s.status === 'accepted')
    expect(accepted.length).toBeGreaterThan(0)
    expect(accepted.every((s) => s.confidence >= 80)).toBe(true)
  })
})

// ── AI Prompt bar ─────────────────────────────────────────────────────────────

describe('AIPanel — prompt bar', () => {
  it('renders the prompt input', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('ai-prompt-input')).toBeInTheDocument()
  })

  it('renders the Apply button', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('ai-prompt-submit')).toBeInTheDocument()
  })

  it('Apply button is disabled when input is empty', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('ai-prompt-submit')).toBeDisabled()
  })

  it('Apply button is enabled when input has text', () => {
    render(<AIPanel />)
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'Remove silences' } })
    expect(screen.getByTestId('ai-prompt-submit')).not.toBeDisabled()
  })

  it('typing in prompt updates the store', () => {
    render(<AIPanel />)
    fireEvent.change(screen.getByTestId('ai-prompt-input'), { target: { value: 'Test prompt' } })
    expect(useSuggestionsStore.getState().promptText).toBe('Test prompt')
  })

  it('renders quick-action chips', () => {
    render(<AIPanel />)
    expect(screen.getByTestId('quick-action-remove-silences')).toBeInTheDocument()
    expect(screen.getByTestId('quick-action-add-captions')).toBeInTheDocument()
    expect(screen.getByTestId('quick-action-extract-shorts')).toBeInTheDocument()
    expect(screen.getByTestId('quick-action-trim-fillers')).toBeInTheDocument()
  })

  it('clicking a chip populates the prompt input', () => {
    render(<AIPanel />)
    fireEvent.click(screen.getByTestId('quick-action-add-captions'))
    expect(useSuggestionsStore.getState().promptText).toContain('caption')
  })
})

// ── ConfidenceBar ─────────────────────────────────────────────────────────────

describe('ConfidenceBar', () => {
  it('renders inside suggestion cards', () => {
    render(<AIPanel />)
    const bars = screen.getAllByTestId('confidence-bar')
    expect(bars.length).toBeGreaterThan(0)
  })

  it('shows confidence percentage label', () => {
    render(<AIPanel />)
    // s1 has confidence 94
    expect(screen.getByTestId('suggestion-card-s1')).toHaveTextContent('94%')
  })
})

// ── Summary footer ────────────────────────────────────────────────────────────

describe('AIPanel — summary footer', () => {
  it('shows "0 applied" initially', () => {
    render(<AIPanel />)
    expect(screen.getByText(/0 applied/i)).toBeInTheDocument()
  })

  it('shows "1 applied" after accepting one suggestion', () => {
    useSuggestionsStore.getState().acceptSuggestion('s1')
    render(<AIPanel />)
    expect(screen.getByText(/1 applied/i)).toBeInTheDocument()
  })

  it('shows rejected count', () => {
    useSuggestionsStore.getState().rejectSuggestion('s2')
    render(<AIPanel />)
    expect(screen.getByText(/1 rejected/i)).toBeInTheDocument()
  })
})
