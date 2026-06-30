/**
 * Transcript Store — Zustand
 *
 * Manages the interactive transcript used by TranscriptEditor (EP-4.7).
 *
 * Data model:
 *   TranscriptWord — a single spoken word, filler, or silence block
 *   TranscriptSegment — a contiguous block of speech by one speaker
 *
 * Key state:
 *   words[]          — all words (flat list for O(1) lookup by id)
 *   segments[]       — words grouped by speaker for rendering
 *   selectedWordIds  — IDs highlighted by mouse-selection (for delete)
 *   currentWordId    — ID of word at current playback time (highlighted)
 *   searchQuery      — Ctrl+F search string
 *   searchMatchIds   — word IDs that match the search query
 *   searchIndex      — currently focused search match index
 *   showDeleteModal  — pending delete confirmation
 *
 * Filler words recognised:
 *   Nepali: हैन र, भनेको, हो र, नि
 *   English: uh, um, basically, you know, like, right
 */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type WordType   = 'word' | 'filler' | 'silence'
export type SpeakerId  = 'A' | 'B'

export interface TranscriptWord {
  id:               string
  text:             string
  startTime:        number   // seconds
  endTime:          number   // seconds
  type:             WordType
  speakerId:        SpeakerId
  deleted:          boolean
  /** Only present when type === 'silence' */
  silenceDuration?: number
}

export interface TranscriptSegment {
  id:        string
  speakerId: SpeakerId
  startTime: number
  endTime:   number
  words:     TranscriptWord[]
}

// ── Filler word lists ─────────────────────────────────────────────────────────

export const NEPALI_FILLERS  = ['हैन र', 'भनेको', 'हो र', 'नि']
export const ENGLISH_FILLERS = ['uh', 'um', 'basically', 'you know', 'like', 'right']
export const ALL_FILLERS     = [...NEPALI_FILLERS, ...ENGLISH_FILLERS]

/** Minimum silence duration (seconds) to show as a grey block */
export const SILENCE_THRESHOLD = 0.4

// ── Speaker colours ───────────────────────────────────────────────────────────

export const SPEAKER_COLORS: Record<SpeakerId, string> = {
  A: '#3B82F6',   // blue
  B: '#F97316',   // orange
}

// ── Placeholder transcript data ───────────────────────────────────────────────
// ~30 words · 2 speakers · fillers highlighted · silence blocks
// Timestamps intentionally longer than the 19s video placeholder so the
// transcript can demo scrolling and all word types.

function makeWord(
  id: string,
  text: string,
  startTime: number,
  endTime: number,
  speakerId: SpeakerId,
  type: WordType = 'word',
  silenceDuration?: number
): TranscriptWord {
  return { id, text, startTime, endTime, speakerId, type, deleted: false, silenceDuration }
}

export const INITIAL_WORDS: TranscriptWord[] = [
  // ── Segment 1: Speaker A ──
  makeWord('w01', 'नमस्ते',        0.1,  0.5,  'A'),
  makeWord('w02', 'साथीहरू!',      0.5,  1.0,  'A'),
  makeWord('s01', '',              1.0,  1.8,  'A', 'silence', 0.8),
  makeWord('w03', 'आज',            1.8,  2.1,  'A'),
  makeWord('w04', 'हामी',           2.1,  2.5,  'A'),
  makeWord('w05', 'video',         2.5,  2.9,  'A'),
  makeWord('w06', 'editing',       2.9,  3.5,  'A'),
  makeWord('w07', 'बारे',           3.5,  3.9,  'A'),
  makeWord('w08', 'कुरा',           3.9,  4.3,  'A'),
  makeWord('w09', 'गर्नेछौँ।',      4.3,  5.0,  'A'),
  makeWord('f01', 'हैन र',          5.0,  5.5,  'A', 'filler'),
  makeWord('s02', '',              5.5,  6.8,  'A', 'silence', 1.3),

  // ── Segment 2: Speaker A continued ──
  makeWord('w10', 'यो',            6.8,  7.1,  'A'),
  makeWord('w11', 'tool',          7.1,  7.6,  'A'),
  makeWord('w12', 'ले',            7.6,  7.8,  'A'),
  makeWord('w13', 'automatically', 7.8,  8.8,  'A'),
  makeWord('f02', 'uh',            8.8,  9.1,  'A', 'filler'),
  makeWord('w14', 'silences',      9.1,  9.9,  'A'),
  makeWord('w15', 'detect',        9.9,  10.6, 'A'),
  makeWord('w16', 'गर्छ',          10.6, 11.2, 'A'),
  makeWord('w17', 'र',             11.2, 11.5, 'A'),
  makeWord('w18', 'captions',      11.5, 12.2, 'A'),
  makeWord('w19', 'generate',      12.2, 13.0, 'A'),
  makeWord('w20', 'गर्छ।',         13.0, 13.7, 'A'),

  // ── Segment 3: Speaker B ──
  makeWord('f03', 'भनेको',         14.0, 14.5, 'B', 'filler'),
  makeWord('w21', 'यो',            14.5, 14.8, 'B'),
  makeWord('w22', 'कसरी',          14.8, 15.3, 'B'),
  makeWord('w23', 'काम',           15.3, 15.8, 'B'),
  makeWord('w24', 'गर्छ?',         15.8, 16.4, 'B'),
  makeWord('s03', '',              16.4, 17.2, 'B', 'silence', 0.8),

  // ── Segment 4: Speaker A answers ──
  makeWord('f04', 'um',            17.2, 17.5, 'A', 'filler'),
  makeWord('w25', 'Whisper',       17.5, 18.1, 'A'),
  makeWord('w26', 'AI',            18.1, 18.5, 'A'),
  makeWord('w27', 'ले',            18.5, 18.7, 'A'),
  makeWord('w28', 'Nepali',        18.7, 19.2, 'A'),
  makeWord('w29', 'transcription', 19.2, 20.2, 'A'),
  makeWord('w30', 'गर्छ',          20.2, 20.8, 'A'),
  makeWord('w31', 'र',             20.8, 21.1, 'A'),
  makeWord('w32', 'timeline',      21.1, 21.9, 'A'),
  makeWord('w33', 'automatically', 21.9, 22.9, 'A'),
  makeWord('w34', 'update',        22.9, 23.5, 'A'),
  makeWord('w35', 'हुन्छ।',         23.5, 24.2, 'A'),
  makeWord('s04', '',              24.2, 25.0, 'A', 'silence', 0.8),
  makeWord('w36', 'कुनै',          25.0, 25.4, 'A'),
  makeWord('w37', 'प्रश्न',         25.4, 26.0, 'A'),
  makeWord('w38', 'छ?',            26.0, 26.5, 'A'),
]

// Group into segments by speaker runs
function buildSegments(words: TranscriptWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = []
  let current: TranscriptSegment | null = null

  for (const word of words) {
    if (!current || current.speakerId !== word.speakerId) {
      if (current) segments.push(current)
      current = {
        id:        `seg-${word.id}`,
        speakerId: word.speakerId,
        startTime: word.startTime,
        endTime:   word.endTime,
        words:     [word],
      }
    } else {
      current.words.push(word)
      current.endTime = word.endTime
    }
  }
  if (current) segments.push(current)
  return segments
}

export const INITIAL_SEGMENTS = buildSegments(INITIAL_WORDS)

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isFiller(text: string): boolean {
  return ALL_FILLERS.includes(text.toLowerCase().trim())
}

export function getFillerWords(words: TranscriptWord[]): TranscriptWord[] {
  return words.filter((w) => w.type === 'filler' && !w.deleted)
}

export function getSilenceWords(words: TranscriptWord[], minDuration: number): TranscriptWord[] {
  return words.filter(
    (w) => w.type === 'silence' && !w.deleted && (w.silenceDuration ?? 0) >= minDuration
  )
}

export function getTotalSavedTime(wordIds: string[], words: TranscriptWord[]): number {
  return words
    .filter((w) => wordIds.includes(w.id))
    .reduce((sum, w) => sum + (w.endTime - w.startTime), 0)
}

// ── Backend → store mapping ─────────────────────────────────────────────────

/** Shape returned by GET /projects/{id}/assets/{id}/transcript. */
export interface ApiTranscriptWord {
  word: string
  start: number
  end: number
  type?: 'word' | 'filler' | 'silence'
  speaker?: string
  confidence?: number
  silence_duration?: number
}

export interface ApiTranscript {
  status?:       string
  full_text?:    string
  language?:     string
  words?:        ApiTranscriptWord[]
  speakers?:     { id: string; label: string; color?: string }[]
  filler_words?: unknown[]
  quality_metrics?: {
    avg_confidence?: number
    quality_grade?: string
    needs_review?: boolean
    low_confidence_count?: number
    language_warning?: string
  }
  model_used?:   string
}

function mapSpeakerId(raw: string | undefined): SpeakerId {
  const id = (raw || 'A').toUpperCase()
  return id === 'B' ? 'B' : 'A'
}

/** True when words carry real Whisper timestamps (not evenly-spaced fallback). */
export function transcriptHasWordTimestamps(api: ApiTranscript): boolean {
  const words = api.words ?? []
  if (words.length === 0) return false
  return words.some((w) => w.end > w.start && (w.type === 'silence' || w.start >= 0))
}

/**
 * Convert a backend transcript into the editor's TranscriptWord[].
 *
 * Prefers word-level timestamps when present. When the model returns no
 * word timestamps (e.g. ElevenLabs Scribe), falls back to splitting
 * full_text into words with no timing — the transcript text still shows,
 * but click-to-seek is unavailable until a word-timestamp model is used.
 */
export function apiTranscriptToWords(
  api: ApiTranscript,
  durationSeconds?: number | null,
): TranscriptWord[] {
  const apiWords = api.words ?? []

  if (apiWords.length > 0 && transcriptHasWordTimestamps(api)) {
    return apiWords.map((w, i) => {
      const text = w.word.trim()
      const wordType = w.type ?? (isFiller(text) ? 'filler' : 'word')
      return {
        id:        `w-${i}`,
        text:      wordType === 'silence' ? '' : text,
        startTime: w.start,
        endTime:   w.end,
        type:      wordType as WordType,
        speakerId: mapSpeakerId(w.speaker),
        deleted:   false,
        silenceDuration: w.silence_duration ?? (wordType === 'silence' ? w.end - w.start : undefined),
      }
    })
  }

  // No word timestamps — return empty so UI shows processing state, not fake timing
  if (apiWords.length > 0) {
    return apiWords.map((w, i) => ({
      id:        `w-${i}`,
      text:      w.word.trim(),
      startTime: 0,
      endTime:   0,
      type:      'word' as WordType,
      speakerId: mapSpeakerId(w.speaker),
      deleted:   false,
    }))
  }

  const tokens = (api.full_text ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  // Last resort: text only, no seek (duration unknown)
  return tokens.map((text, i) => ({
    id:        `w-${i}`,
    text,
    startTime: 0,
    endTime:   0,
    type:      isFiller(text) ? 'filler' as WordType : 'word' as WordType,
    speakerId: 'A' as SpeakerId,
    deleted:   false,
  }))
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface TranscriptState {
  words:            TranscriptWord[]
  segments:         TranscriptSegment[]
  /** Word IDs highlighted by mouse text-selection */
  selectedWordIds:  string[]
  /** Word ID at current playback time */
  currentWordId:    string | null
  searchQuery:      string
  searchMatchIds:   string[]
  searchIndex:      number
  /** When set, show delete confirmation modal */
  pendingDeleteIds: string[] | null

  /** True once real transcript data has been loaded from the backend. */
  loaded:           boolean
  qualityMetrics:   ApiTranscript['quality_metrics'] | null

  // ── Actions ─────────────────────────────────────────────────────────────
  /** Populate the store from the backend GET /transcript response. */
  loadFromApi:         (apiTranscript: ApiTranscript, durationSeconds?: number | null) => void
  loadDemoData:        () => void
  setCurrentWordId:    (id: string | null) => void
  setSelectedWordIds:  (ids: string[]) => void
  clearSelection:      () => void
  deleteWords:         (ids: string[]) => void
  restoreWords:        (ids: string[]) => void
  deleteAllFillers:    () => void
  removeLongSilences:  (minDuration: number) => void
  setPendingDelete:    (ids: string[] | null) => void
  setSearchQuery:      (q: string) => void
  nextSearchMatch:     () => void
  prevSearchMatch:     () => void
  resetTranscript:     () => void
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  words:            [],
  segments:         [],
  selectedWordIds:  [],
  currentWordId:    null,
  searchQuery:      '',
  searchMatchIds:   [],
  searchIndex:      0,
  pendingDeleteIds: null,
  loaded:           false,
  qualityMetrics:   null,

  loadFromApi: (api, durationSeconds) =>
    set(() => {
      const words = apiTranscriptToWords(api, durationSeconds)
      return {
        words,
        segments:         buildSegments(words),
        qualityMetrics:   api.quality_metrics ?? null,
        selectedWordIds:  [],
        currentWordId:    null,
        searchQuery:      '',
        searchMatchIds:   [],
        searchIndex:      0,
        pendingDeleteIds: null,
        loaded:           true,
      }
    }),

  loadDemoData: () =>
    set({
      words:            INITIAL_WORDS.map((w) => ({ ...w, deleted: false })),
      segments:         INITIAL_SEGMENTS,
      selectedWordIds:  [],
      currentWordId:    null,
      searchQuery:      '',
      searchMatchIds:   [],
      searchIndex:      0,
      pendingDeleteIds: null,
      loaded:           false,
    }),

  setCurrentWordId: (id) => set({ currentWordId: id }),

  setSelectedWordIds: (ids) => set({ selectedWordIds: ids }),

  clearSelection: () => set({ selectedWordIds: [] }),

  deleteWords: (ids) =>
    set((s) => {
      const updated = s.words.map((w) =>
        ids.includes(w.id) ? { ...w, deleted: true } : w
      )
      return {
        words:            updated,
        segments:         buildSegments(updated),
        selectedWordIds:  [],
        pendingDeleteIds: null,
      }
    }),

  restoreWords: (ids) =>
    set((s) => {
      const updated = s.words.map((w) =>
        ids.includes(w.id) ? { ...w, deleted: false } : w
      )
      return { words: updated, segments: buildSegments(updated) }
    }),

  deleteAllFillers: () =>
    set((s) => {
      const fillerIds = s.words
        .filter((w) => w.type === 'filler' && !w.deleted)
        .map((w) => w.id)
      const updated = s.words.map((w) =>
        fillerIds.includes(w.id) ? { ...w, deleted: true } : w
      )
      return { words: updated, segments: buildSegments(updated) }
    }),

  removeLongSilences: (minDuration) =>
    set((s) => {
      const ids = s.words
        .filter((w) => w.type === 'silence' && !w.deleted && (w.silenceDuration ?? 0) >= minDuration)
        .map((w) => w.id)
      const updated = s.words.map((w) =>
        ids.includes(w.id) ? { ...w, deleted: true } : w
      )
      return { words: updated, segments: buildSegments(updated) }
    }),

  setPendingDelete: (ids) => set({ pendingDeleteIds: ids }),

  setSearchQuery: (q) =>
    set((s) => {
      if (!q.trim()) return { searchQuery: '', searchMatchIds: [], searchIndex: 0 }
      const lower    = q.toLowerCase()
      const matchIds = s.words
        .filter((w) => !w.deleted && w.type !== 'silence' && w.text.toLowerCase().includes(lower))
        .map((w) => w.id)
      return { searchQuery: q, searchMatchIds: matchIds, searchIndex: 0 }
    }),

  nextSearchMatch: () =>
    set((s) => ({
      searchIndex: s.searchMatchIds.length === 0
        ? 0
        : (s.searchIndex + 1) % s.searchMatchIds.length,
    })),

  prevSearchMatch: () =>
    set((s) => ({
      searchIndex: s.searchMatchIds.length === 0
        ? 0
        : (s.searchIndex - 1 + s.searchMatchIds.length) % s.searchMatchIds.length,
    })),

  resetTranscript: () =>
    set((s) => {
      const words = s.words.map((w) => ({ ...w, deleted: false }))
      return {
        words,
        segments:         buildSegments(words),
        selectedWordIds:  [],
        currentWordId:    null,
        searchQuery:      '',
        searchMatchIds:   [],
        searchIndex:      0,
        pendingDeleteIds: null,
      }
    }),
}))
