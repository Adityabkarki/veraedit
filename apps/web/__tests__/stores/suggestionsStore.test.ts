/**
 * Tests for stores/suggestionsStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSuggestionsStore,
  PLACEHOLDER_SUGGESTIONS,
  HIGH_CONFIDENCE_THRESHOLD,
} from '@/stores/suggestionsStore'

beforeEach(() => {
  useSuggestionsStore.getState().resetSuggestions()
  useSuggestionsStore.getState().loadDemoData()
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('suggestionsStore — initial state', () => {
  it('starts empty before demo data is loaded', () => {
    useSuggestionsStore.getState().resetSuggestions()
    expect(useSuggestionsStore.getState().suggestions).toHaveLength(0)
  })

  it('loads PLACEHOLDER_SUGGESTIONS via loadDemoData', () => {
    expect(useSuggestionsStore.getState().suggestions).toHaveLength(
      PLACEHOLDER_SUGGESTIONS.length
    )
  })

  it('all suggestions start as pending', () => {
    const all = useSuggestionsStore.getState().suggestions
    expect(all.every((s) => s.status === 'pending')).toBe(true)
  })

  it('activeFilter starts as "all"', () => {
    expect(useSuggestionsStore.getState().activeFilter).toBe('all')
  })

  it('promptText starts empty', () => {
    expect(useSuggestionsStore.getState().promptText).toBe('')
  })

  it('isLoading starts false', () => {
    expect(useSuggestionsStore.getState().isLoading).toBe(false)
  })

  it('batchModalOpen starts false', () => {
    expect(useSuggestionsStore.getState().batchModalOpen).toBe(false)
  })
})

// ── filteredSuggestions ────────────────────────────────────────────────────────

describe('suggestionsStore — filteredSuggestions', () => {
  it('"all" returns all suggestions', () => {
    const filtered = useSuggestionsStore.getState().filteredSuggestions('all')
    expect(filtered).toHaveLength(PLACEHOLDER_SUGGESTIONS.length)
  })

  it('"cuts" returns only cut and trim types', () => {
    const filtered = useSuggestionsStore.getState().filteredSuggestions('cuts')
    expect(filtered.every((s) => s.type === 'cut' || s.type === 'trim')).toBe(true)
    expect(filtered.length).toBeGreaterThan(0)
  })

  it('"captions" returns only caption type', () => {
    const filtered = useSuggestionsStore.getState().filteredSuggestions('captions')
    expect(filtered.every((s) => s.type === 'caption')).toBe(true)
    expect(filtered.length).toBeGreaterThan(0)
  })

  it('"shorts" returns only short type', () => {
    const filtered = useSuggestionsStore.getState().filteredSuggestions('shorts')
    expect(filtered.every((s) => s.type === 'short')).toBe(true)
    expect(filtered.length).toBeGreaterThan(0)
  })

  it('uses activeFilter when no argument given', () => {
    useSuggestionsStore.getState().setFilter('shorts')
    const filtered = useSuggestionsStore.getState().filteredSuggestions()
    expect(filtered.every((s) => s.type === 'short')).toBe(true)
  })
})

// ── pendingCount ──────────────────────────────────────────────────────────────

describe('suggestionsStore — pendingCount', () => {
  it('starts at full count', () => {
    expect(useSuggestionsStore.getState().pendingCount()).toBe(
      PLACEHOLDER_SUGGESTIONS.length
    )
  })

  it('decreases after accepting a suggestion', () => {
    const id = PLACEHOLDER_SUGGESTIONS[0].id
    useSuggestionsStore.getState().acceptSuggestion(id)
    expect(useSuggestionsStore.getState().pendingCount()).toBe(
      PLACEHOLDER_SUGGESTIONS.length - 1
    )
  })

  it('decreases after rejecting a suggestion', () => {
    const id = PLACEHOLDER_SUGGESTIONS[0].id
    useSuggestionsStore.getState().rejectSuggestion(id)
    expect(useSuggestionsStore.getState().pendingCount()).toBe(
      PLACEHOLDER_SUGGESTIONS.length - 1
    )
  })
})

// ── highConfidencePending ─────────────────────────────────────────────────────

describe('suggestionsStore — highConfidencePending', () => {
  it('returns only pending suggestions ≥ threshold', () => {
    const high = useSuggestionsStore.getState().highConfidencePending()
    expect(high.every((s) => s.confidence >= HIGH_CONFIDENCE_THRESHOLD)).toBe(true)
    expect(high.every((s) => s.status === 'pending')).toBe(true)
  })

  it('excludes accepted high-confidence suggestions', () => {
    // Accept the first high-confidence suggestion
    const highConf = useSuggestionsStore.getState().highConfidencePending()
    const id = highConf[0].id
    useSuggestionsStore.getState().acceptSuggestion(id)
    const stillHigh = useSuggestionsStore.getState().highConfidencePending()
    expect(stillHigh.find((s) => s.id === id)).toBeUndefined()
  })
})

// ── acceptSuggestion ──────────────────────────────────────────────────────────

describe('suggestionsStore — acceptSuggestion', () => {
  it('changes status to accepted', () => {
    const id = 's1'
    useSuggestionsStore.getState().acceptSuggestion(id)
    const s = useSuggestionsStore.getState().suggestions.find((x) => x.id === id)!
    expect(s.status).toBe('accepted')
  })

  it('does not affect other suggestions', () => {
    useSuggestionsStore.getState().acceptSuggestion('s1')
    const s2 = useSuggestionsStore.getState().suggestions.find((x) => x.id === 's2')!
    expect(s2.status).toBe('pending')
  })
})

// ── rejectSuggestion ──────────────────────────────────────────────────────────

describe('suggestionsStore — rejectSuggestion', () => {
  it('changes status to rejected', () => {
    useSuggestionsStore.getState().rejectSuggestion('s2')
    const s = useSuggestionsStore.getState().suggestions.find((x) => x.id === 's2')!
    expect(s.status).toBe('rejected')
  })

  it('does not affect other suggestions', () => {
    useSuggestionsStore.getState().rejectSuggestion('s2')
    const s1 = useSuggestionsStore.getState().suggestions.find((x) => x.id === 's1')!
    expect(s1.status).toBe('pending')
  })
})

// ── undoSuggestion ────────────────────────────────────────────────────────────

describe('suggestionsStore — undoSuggestion', () => {
  it('reverts accepted suggestion to pending', () => {
    useSuggestionsStore.getState().acceptSuggestion('s1')
    useSuggestionsStore.getState().undoSuggestion('s1')
    const s = useSuggestionsStore.getState().suggestions.find((x) => x.id === 's1')!
    expect(s.status).toBe('pending')
  })

  it('reverts rejected suggestion to pending', () => {
    useSuggestionsStore.getState().rejectSuggestion('s3')
    useSuggestionsStore.getState().undoSuggestion('s3')
    const s = useSuggestionsStore.getState().suggestions.find((x) => x.id === 's3')!
    expect(s.status).toBe('pending')
  })
})

// ── batchAcceptHigh ───────────────────────────────────────────────────────────

describe('suggestionsStore — batchAcceptHigh', () => {
  it('accepts all pending suggestions above the threshold', () => {
    useSuggestionsStore.getState().batchAcceptHigh()
    const accepted = useSuggestionsStore.getState().suggestions.filter(
      (s) => s.status === 'accepted'
    )
    expect(accepted.every((s) => s.confidence >= HIGH_CONFIDENCE_THRESHOLD)).toBe(true)
  })

  it('does not touch low-confidence suggestions', () => {
    useSuggestionsStore.getState().batchAcceptHigh()
    const lowConf = useSuggestionsStore.getState().suggestions.filter(
      (s) => s.confidence < HIGH_CONFIDENCE_THRESHOLD
    )
    expect(lowConf.every((s) => s.status === 'pending')).toBe(true)
  })

  it('closes the modal after batch accept', () => {
    useSuggestionsStore.getState().openBatchModal()
    useSuggestionsStore.getState().batchAcceptHigh()
    expect(useSuggestionsStore.getState().batchModalOpen).toBe(false)
  })

  it('does not re-accept already-accepted suggestions', () => {
    // Accept one manually first
    useSuggestionsStore.getState().acceptSuggestion('s1')
    const acceptedBefore = useSuggestionsStore.getState().suggestions.filter((s) => s.status === 'accepted').length
    useSuggestionsStore.getState().batchAcceptHigh()
    const acceptedAfter = useSuggestionsStore.getState().suggestions.filter((s) => s.status === 'accepted').length
    expect(acceptedAfter).toBeGreaterThanOrEqual(acceptedBefore)
  })
})

// ── openBatchModal / closeBatchModal ──────────────────────────────────────────

describe('suggestionsStore — batch modal', () => {
  it('openBatchModal sets batchModalOpen to true', () => {
    useSuggestionsStore.getState().openBatchModal()
    expect(useSuggestionsStore.getState().batchModalOpen).toBe(true)
  })

  it('closeBatchModal sets batchModalOpen to false', () => {
    useSuggestionsStore.getState().openBatchModal()
    useSuggestionsStore.getState().closeBatchModal()
    expect(useSuggestionsStore.getState().batchModalOpen).toBe(false)
  })
})

// ── setFilter ─────────────────────────────────────────────────────────────────

describe('suggestionsStore — setFilter', () => {
  it('sets the active filter', () => {
    useSuggestionsStore.getState().setFilter('shorts')
    expect(useSuggestionsStore.getState().activeFilter).toBe('shorts')
  })

  it('can reset to "all"', () => {
    useSuggestionsStore.getState().setFilter('cuts')
    useSuggestionsStore.getState().setFilter('all')
    expect(useSuggestionsStore.getState().activeFilter).toBe('all')
  })
})

// ── promptText ────────────────────────────────────────────────────────────────

describe('suggestionsStore — prompt', () => {
  it('setPromptText updates the text', () => {
    useSuggestionsStore.getState().setPromptText('Remove silences')
    expect(useSuggestionsStore.getState().promptText).toBe('Remove silences')
  })

  it('submitPrompt clears the prompt text', () => {
    useSuggestionsStore.getState().setPromptText('Test prompt')
    useSuggestionsStore.getState().submitPrompt()
    expect(useSuggestionsStore.getState().promptText).toBe('')
  })

  it('submitPrompt sets isLoading to true', () => {
    useSuggestionsStore.getState().setPromptText('Test')
    useSuggestionsStore.getState().submitPrompt()
    expect(useSuggestionsStore.getState().isLoading).toBe(true)
  })
})

// ── resetSuggestions ──────────────────────────────────────────────────────────

describe('suggestionsStore — resetSuggestions', () => {
  it('clears suggestions to empty', () => {
    useSuggestionsStore.getState().acceptSuggestion('s1')
    useSuggestionsStore.getState().resetSuggestions()
    expect(useSuggestionsStore.getState().suggestions).toHaveLength(0)
  })

  it('resets activeFilter to "all"', () => {
    useSuggestionsStore.getState().setFilter('cuts')
    useSuggestionsStore.getState().resetSuggestions()
    expect(useSuggestionsStore.getState().activeFilter).toBe('all')
  })

  it('resets promptText to empty', () => {
    useSuggestionsStore.getState().setPromptText('test')
    useSuggestionsStore.getState().resetSuggestions()
    expect(useSuggestionsStore.getState().promptText).toBe('')
  })

  it('closes the batch modal', () => {
    useSuggestionsStore.getState().openBatchModal()
    useSuggestionsStore.getState().resetSuggestions()
    expect(useSuggestionsStore.getState().batchModalOpen).toBe(false)
  })
})
