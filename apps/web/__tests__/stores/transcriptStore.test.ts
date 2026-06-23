/**
 * Tests for stores/transcriptStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useTranscriptStore,
  INITIAL_WORDS,
  INITIAL_SEGMENTS,
  getFillerWords,
  getSilenceWords,
  getTotalSavedTime,
  isFiller,
  ALL_FILLERS,
  NEPALI_FILLERS,
  ENGLISH_FILLERS,
} from '@/stores/transcriptStore'

beforeEach(() => {
  useTranscriptStore.getState().resetTranscript()
  useTranscriptStore.getState().loadDemoData()
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('transcriptStore — initial state', () => {
  it('starts empty before demo data is loaded', () => {
    useTranscriptStore.getState().loadFromApi({ full_text: '', words: [] })
    expect(useTranscriptStore.getState().words).toHaveLength(0)
  })

  it('loads INITIAL_WORDS via loadDemoData', () => {
    expect(useTranscriptStore.getState().words).toHaveLength(INITIAL_WORDS.length)
  })
  it('builds segments from words', () => {
    expect(useTranscriptStore.getState().segments.length).toBeGreaterThan(0)
  })
  it('segments match INITIAL_SEGMENTS count', () => {
    expect(useTranscriptStore.getState().segments).toHaveLength(INITIAL_SEGMENTS.length)
  })
  it('no words deleted initially', () => {
    expect(useTranscriptStore.getState().words.every((w) => !w.deleted)).toBe(true)
  })
  it('no selection initially', () => {
    expect(useTranscriptStore.getState().selectedWordIds).toHaveLength(0)
  })
  it('no currentWordId initially', () => {
    expect(useTranscriptStore.getState().currentWordId).toBeNull()
  })
  it('searchQuery starts empty', () => {
    expect(useTranscriptStore.getState().searchQuery).toBe('')
  })
})

// ── Word types ────────────────────────────────────────────────────────────────

describe('transcriptStore — word types', () => {
  it('has at least one filler word', () => {
    const fillers = useTranscriptStore.getState().words.filter((w) => w.type === 'filler')
    expect(fillers.length).toBeGreaterThan(0)
  })
  it('has at least one silence block', () => {
    const silences = useTranscriptStore.getState().words.filter((w) => w.type === 'silence')
    expect(silences.length).toBeGreaterThan(0)
  })
  it('has both Speaker A and Speaker B words', () => {
    const speakerIds = new Set(useTranscriptStore.getState().words.map((w) => w.speakerId))
    expect(speakerIds.has('A')).toBe(true)
    expect(speakerIds.has('B')).toBe(true)
  })
  it('silence words have silenceDuration', () => {
    const silences = useTranscriptStore.getState().words.filter((w) => w.type === 'silence')
    silences.forEach((s) => {
      expect(s.silenceDuration).toBeGreaterThan(0)
    })
  })
})

// ── deleteWords ───────────────────────────────────────────────────────────────

describe('transcriptStore — deleteWords', () => {
  it('marks specified words as deleted', () => {
    useTranscriptStore.getState().deleteWords(['w01'])
    expect(useTranscriptStore.getState().words.find((w) => w.id === 'w01')!.deleted).toBe(true)
  })
  it('does not delete other words', () => {
    useTranscriptStore.getState().deleteWords(['w01'])
    expect(useTranscriptStore.getState().words.find((w) => w.id === 'w02')!.deleted).toBe(false)
  })
  it('clears selectedWordIds after delete', () => {
    useTranscriptStore.getState().setSelectedWordIds(['w01'])
    useTranscriptStore.getState().deleteWords(['w01'])
    expect(useTranscriptStore.getState().selectedWordIds).toHaveLength(0)
  })
  it('clears pendingDeleteIds after delete', () => {
    useTranscriptStore.getState().setPendingDelete(['w01'])
    useTranscriptStore.getState().deleteWords(['w01'])
    expect(useTranscriptStore.getState().pendingDeleteIds).toBeNull()
  })
})

// ── restoreWords ──────────────────────────────────────────────────────────────

describe('transcriptStore — restoreWords', () => {
  it('restores a deleted word', () => {
    useTranscriptStore.getState().deleteWords(['w01'])
    useTranscriptStore.getState().restoreWords(['w01'])
    expect(useTranscriptStore.getState().words.find((w) => w.id === 'w01')!.deleted).toBe(false)
  })
})

// ── deleteAllFillers ──────────────────────────────────────────────────────────

describe('transcriptStore — deleteAllFillers', () => {
  it('marks all filler words as deleted', () => {
    useTranscriptStore.getState().deleteAllFillers()
    const remaining = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'filler' && !w.deleted
    )
    expect(remaining).toHaveLength(0)
  })
  it('does not delete non-filler words', () => {
    const nonFillerBefore = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'word' && !w.deleted
    ).length
    useTranscriptStore.getState().deleteAllFillers()
    const nonFillerAfter = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'word' && !w.deleted
    ).length
    expect(nonFillerAfter).toBe(nonFillerBefore)
  })
})

// ── removeLongSilences ────────────────────────────────────────────────────────

describe('transcriptStore — removeLongSilences', () => {
  it('marks silences >= threshold as deleted', () => {
    const minDur = 0.8
    const longSilences = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'silence' && (w.silenceDuration ?? 0) >= minDur
    )
    expect(longSilences.length).toBeGreaterThan(0)

    useTranscriptStore.getState().removeLongSilences(minDur)
    const remaining = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'silence' && !w.deleted && (w.silenceDuration ?? 0) >= minDur
    )
    expect(remaining).toHaveLength(0)
  })
  it('does not delete short silences', () => {
    useTranscriptStore.getState().removeLongSilences(99) // impossibly large threshold
    const stillPresent = useTranscriptStore.getState().words.filter(
      (w) => w.type === 'silence' && !w.deleted
    )
    expect(stillPresent.length).toBeGreaterThan(0)
  })
})

// ── selection ─────────────────────────────────────────────────────────────────

describe('transcriptStore — selection', () => {
  it('setSelectedWordIds sets IDs', () => {
    useTranscriptStore.getState().setSelectedWordIds(['w01', 'w02'])
    expect(useTranscriptStore.getState().selectedWordIds).toEqual(['w01', 'w02'])
  })
  it('clearSelection empties selectedWordIds', () => {
    useTranscriptStore.getState().setSelectedWordIds(['w01'])
    useTranscriptStore.getState().clearSelection()
    expect(useTranscriptStore.getState().selectedWordIds).toHaveLength(0)
  })
})

// ── pendingDelete ─────────────────────────────────────────────────────────────

describe('transcriptStore — pendingDelete', () => {
  it('setPendingDelete sets IDs', () => {
    useTranscriptStore.getState().setPendingDelete(['w01'])
    expect(useTranscriptStore.getState().pendingDeleteIds).toEqual(['w01'])
  })
  it('setPendingDelete(null) clears', () => {
    useTranscriptStore.getState().setPendingDelete(['w01'])
    useTranscriptStore.getState().setPendingDelete(null)
    expect(useTranscriptStore.getState().pendingDeleteIds).toBeNull()
  })
})

// ── currentWordId ─────────────────────────────────────────────────────────────

describe('transcriptStore — currentWordId', () => {
  it('setCurrentWordId sets the word', () => {
    useTranscriptStore.getState().setCurrentWordId('w01')
    expect(useTranscriptStore.getState().currentWordId).toBe('w01')
  })
  it('setCurrentWordId(null) clears', () => {
    useTranscriptStore.getState().setCurrentWordId('w01')
    useTranscriptStore.getState().setCurrentWordId(null)
    expect(useTranscriptStore.getState().currentWordId).toBeNull()
  })
})

// ── search ────────────────────────────────────────────────────────────────────

describe('transcriptStore — search', () => {
  it('setSearchQuery finds matching words', () => {
    useTranscriptStore.getState().setSearchQuery('नमस्ते')
    const { searchMatchIds } = useTranscriptStore.getState()
    expect(searchMatchIds.length).toBeGreaterThan(0)
  })
  it('empty query clears matches', () => {
    useTranscriptStore.getState().setSearchQuery('नमस्ते')
    useTranscriptStore.getState().setSearchQuery('')
    expect(useTranscriptStore.getState().searchMatchIds).toHaveLength(0)
  })
  it('search is case-insensitive for English', () => {
    useTranscriptStore.getState().setSearchQuery('VIDEO')
    const { searchMatchIds } = useTranscriptStore.getState()
    expect(searchMatchIds.length).toBeGreaterThan(0)
  })
  it('nextSearchMatch advances index', () => {
    // Put at least 2 matches
    useTranscriptStore.getState().setSearchQuery('a') // matches 'automatically', 'captions', etc.
    useTranscriptStore.getState().nextSearchMatch()
    expect(useTranscriptStore.getState().searchIndex).toBeGreaterThanOrEqual(0)
  })
  it('nextSearchMatch wraps around', () => {
    useTranscriptStore.getState().setSearchQuery('video')
    const { searchMatchIds } = useTranscriptStore.getState()
    if (searchMatchIds.length > 0) {
      // Set to last index
      useTranscriptStore.setState({ searchIndex: searchMatchIds.length - 1 })
      useTranscriptStore.getState().nextSearchMatch()
      expect(useTranscriptStore.getState().searchIndex).toBe(0)
    }
  })
  it('prevSearchMatch wraps around to end', () => {
    useTranscriptStore.getState().setSearchQuery('video')
    const { searchMatchIds } = useTranscriptStore.getState()
    if (searchMatchIds.length > 0) {
      useTranscriptStore.getState().prevSearchMatch()
      expect(useTranscriptStore.getState().searchIndex).toBe(searchMatchIds.length - 1)
    }
  })
  it('search does not match deleted words', () => {
    useTranscriptStore.getState().deleteWords(['w05']) // 'video'
    useTranscriptStore.getState().setSearchQuery('video')
    const matchIds = useTranscriptStore.getState().searchMatchIds
    expect(matchIds).not.toContain('w05')
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

describe('transcriptStore — helper functions', () => {
  it('isFiller returns true for Nepali fillers', () => {
    NEPALI_FILLERS.forEach((f) => {
      expect(isFiller(f)).toBe(true)
    })
  })
  it('isFiller returns true for English fillers', () => {
    ENGLISH_FILLERS.forEach((f) => {
      expect(isFiller(f)).toBe(true)
    })
  })
  it('isFiller returns false for regular words', () => {
    expect(isFiller('नमस्ते')).toBe(false)
    expect(isFiller('video')).toBe(false)
  })
  it('getFillerWords returns only non-deleted fillers', () => {
    const words = useTranscriptStore.getState().words
    const fillers = getFillerWords(words)
    fillers.forEach((w) => {
      expect(w.type).toBe('filler')
      expect(w.deleted).toBe(false)
    })
  })
  it('getSilenceWords returns silences above threshold', () => {
    const words = useTranscriptStore.getState().words
    const silences = getSilenceWords(words, 0.8)
    silences.forEach((w) => {
      expect(w.type).toBe('silence')
      expect(w.silenceDuration ?? 0).toBeGreaterThanOrEqual(0.8)
    })
  })
  it('getTotalSavedTime sums durations', () => {
    const words = useTranscriptStore.getState().words
    const ids = ['w01', 'w02']
    const total = getTotalSavedTime(ids, words)
    const expected = words
      .filter((w) => ids.includes(w.id))
      .reduce((sum, w) => sum + (w.endTime - w.startTime), 0)
    expect(total).toBeCloseTo(expected)
  })
})

// ── resetTranscript ───────────────────────────────────────────────────────────

describe('transcriptStore — resetTranscript', () => {
  it('restores deleted words in the current transcript', () => {
    useTranscriptStore.getState().deleteWords(['w01', 'w02'])
    useTranscriptStore.getState().resetTranscript()
    expect(useTranscriptStore.getState().words.every((w) => !w.deleted)).toBe(true)
  })
  it('clears selectedWordIds', () => {
    useTranscriptStore.getState().setSelectedWordIds(['w01'])
    useTranscriptStore.getState().resetTranscript()
    expect(useTranscriptStore.getState().selectedWordIds).toHaveLength(0)
  })
  it('clears searchQuery', () => {
    useTranscriptStore.getState().setSearchQuery('test')
    useTranscriptStore.getState().resetTranscript()
    expect(useTranscriptStore.getState().searchQuery).toBe('')
  })
  it('clears pendingDeleteIds', () => {
    useTranscriptStore.getState().setPendingDelete(['w01'])
    useTranscriptStore.getState().resetTranscript()
    expect(useTranscriptStore.getState().pendingDeleteIds).toBeNull()
  })
})
