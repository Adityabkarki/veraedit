/**
 * Suggestions Store — Zustand
 *
 * Manages AI suggestion state for the right panel:
 *   – list of suggestions with confidence, reasoning, diff
 *   – per-suggestion accept / reject / undo
 *   – filter (all / cuts / captions / shorts)
 *   – batch-accept for high-confidence suggestions (≥ 80%)
 *   – AI prompt input text + quick-action chips
 *   – loading / error state for future API integration
 *
 * Placeholder suggestions are pre-loaded; in EP-4.6 they will be
 * replaced with suggestions fetched from the FastAPI backend.
 */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SuggestionType   = 'cut' | 'caption' | 'short' | 'trim' | 'audio' | 'visual'
export type SuggestionFilter = 'all' | 'cuts' | 'captions' | 'shorts' | 'visual' | 'audio'
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected'

export interface DiffEntry {
  /** Visual intent for coloring */
  kind:        'remove' | 'add' | 'keep'
  description: string
  timeRange?:  { start: number; end: number }
}

export interface Suggestion {
  id:         string
  type:       SuggestionType
  title:      string
  /** Shown in the "Why did AI suggest this?" section */
  reasoning:  string
  /** One-line impact summary shown on the card face */
  impact:     string
  /** 0–100 */
  confidence: number
  timeRange?: { start: number; end: number }
  diff:       DiffEntry[]
  status:     SuggestionStatus
  /** Backend action payload — used when accepting */
  action?:    Record<string, unknown> | null
  /** Raw backend suggestion type */
  apiType?:   string
}

// ── Placeholder data ──────────────────────────────────────────────────────────

export const PLACEHOLDER_SUGGESTIONS: Suggestion[] = [
  {
    id: 's1',
    type: 'cut',
    title: 'Remove 12 silent gaps',
    reasoning:
      'There are 12 segments of silence longer than 0.8 seconds throughout the video. Removing them tightens the pacing and keeps viewers engaged without losing any content.',
    impact: 'Removes 2 min 18 s — runtime drops from 19:42 to 17:24.',
    confidence: 94,
    timeRange: { start: 0, end: 340 },
    diff: [
      { kind: 'remove', description: '0:12 – 0:15 · 3.1 s silence',  timeRange: { start: 12, end: 15.1 } },
      { kind: 'remove', description: '1:23 – 1:26 · 2.8 s silence',  timeRange: { start: 83, end: 85.8 } },
      { kind: 'remove', description: '2:44 – 2:47 · 3.0 s silence',  timeRange: { start: 164, end: 167 } },
      { kind: 'keep',   description: '+ 9 more gaps (details after applying)' },
    ],
    status: 'pending',
  },
  {
    id: 's2',
    type: 'short',
    title: 'Viral hook at 1:12',
    reasoning:
      'The speaker delivers a direct, surprising claim at 1:12. This opener type performs 3.2× better on TikTok and Reels compared to slow intros.',
    impact: 'Creates a 33-second clip for 9:16. Estimated virality score: 88.',
    confidence: 88,
    timeRange: { start: 72, end: 105 },
    diff: [
      { kind: 'add',  description: 'New short clip: 1:12 – 1:45 (33 s)' },
      { kind: 'keep', description: 'Original long-form video unchanged' },
    ],
    status: 'pending',
  },
  {
    id: 's3',
    type: 'caption',
    title: 'Auto-captions ready',
    reasoning:
      'A Nepali transcript was generated from the audio. Adding styled captions increases watch time by up to 40% — most viewers watch without sound.',
    impact: 'Adds a captions track with 47 segments. You can edit before exporting.',
    confidence: 80,
    diff: [
      { kind: 'add',  description: 'Captions track — 47 segments generated' },
      { kind: 'keep', description: 'All other tracks unchanged' },
    ],
    status: 'pending',
  },
  {
    id: 's4',
    type: 'cut',
    title: 'Trim 8 filler phrases',
    reasoning:
      'Detected 8 occurrences of filler phrases. Removing them makes the speaker sound more confident and polished.',
    impact: 'Removes ~8.4 s total. Creates 8 micro-cuts that are barely noticeable.',
    confidence: 76,
    diff: [
      { kind: 'remove', description: '"umm" at 0:42 · 0.6 s',       timeRange: { start: 42, end: 42.6 } },
      { kind: 'remove', description: '"uh" at 1:07 · 0.5 s',         timeRange: { start: 67, end: 67.5 } },
      { kind: 'remove', description: '"basically" at 2:31 · 1.1 s',  timeRange: { start: 151, end: 152.1 } },
      { kind: 'keep',   description: '+ 5 more fillers' },
    ],
    status: 'pending',
  },
  {
    id: 's5',
    type: 'short',
    title: 'Strong closing at 17:30',
    reasoning:
      'The video ends with a clear call-to-action and energetic delivery. Closing clips with a CTA get 2.1× more shares when extracted as shorts.',
    impact: 'Creates a 45-second clip for YouTube Shorts.',
    confidence: 71,
    timeRange: { start: 1050, end: 1095 },
    diff: [
      { kind: 'add',  description: 'New short clip: 17:30 – 18:15 (45 s)' },
      { kind: 'keep', description: 'Original video unchanged' },
    ],
    status: 'pending',
  },
  {
    id: 's6',
    type: 'trim',
    title: 'Shorten intro by 45 s',
    reasoning:
      'The first 45 seconds are a slow intro before the main topic. Viewer drop-off data shows most people leave during this window.',
    impact: 'Trims the first 45 s. Video begins at the first substantive statement.',
    confidence: 65,
    diff: [
      { kind: 'remove', description: '0:00 – 0:45 (45 s slow intro)',  timeRange: { start: 0, end: 45 } },
      { kind: 'keep',   description: 'Everything from 0:45 onward unchanged' },
    ],
    status: 'pending',
  },
]

/** Confidence threshold for "high-confidence" batch accept */
export const HIGH_CONFIDENCE_THRESHOLD = 80

// ── Filter helper ─────────────────────────────────────────────────────────────

function matchesFilter(s: Suggestion, filter: SuggestionFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'cuts') return s.type === 'cut' || s.type === 'trim'
  if (filter === 'captions') return s.type === 'caption'
  if (filter === 'shorts') return s.type === 'short'
  if (filter === 'visual') return s.type === 'visual'
  if (filter === 'audio') return s.type === 'audio'
  return true
}

// ── Backend → store mapping ─────────────────────────────────────────────────

/** A suggestion as returned by GET /projects/{id}/assets/{id}/suggestions. */
export interface ApiSuggestion {
  id:          string
  type:        string
  title:       string
  description: string
  start_time?: number | null
  end_time?:   number | null
  confidence:  number
  status:      string
  action?:     Record<string, unknown> | null
}

function mapSuggestionType(t: string): SuggestionType {
  switch ((t || '').toLowerCase()) {
    case 'caption':
    case 'add_captions':
      return 'caption'
    case 'short_clip':
    case 'extract_shorts':
      return 'short'
    case 'visual_opportunity':
    case 'statistic':
    case 'large_number':
    case 'list_item':
    case 'comparison':
    case 'cta':
    case 'key_term':
    case 'hook_rewrite':
      return 'visual'
    case 'remove_filler':
    case 'remove_fillers':
    case 'trim_silence':
    case 'add_chapter':
    case 'add_overlay':
    case 'cut':
    case 'transition':
      return 'cut'
    case 'audio_fix':
      return 'audio'
    case 'trim':
      return 'trim'
    default:
      return 'cut'
  }
}

function mapSuggestionStatus(s: string): SuggestionStatus {
  switch ((s || '').toLowerCase()) {
    case 'accepted':
    case 'applied':
    case 'modified':  return 'accepted'
    case 'rejected':  return 'rejected'
    default:          return 'pending'
  }
}

export function mapApiSuggestion(s: ApiSuggestion): Suggestion {
  const hasRange = s.start_time != null && s.end_time != null
  const conf = s.confidence <= 1 ? Math.round(s.confidence * 100) : Math.round(s.confidence)
  const action = s.action ?? {}
  const why = String(action.why_explanation ?? '')
  const reasoning = why || s.description || ''
  return {
    id:         s.id,
    type:       mapSuggestionType(s.type),
    title:      s.title || 'Suggestion',
    reasoning,
    impact:     s.description || '',
    confidence: conf,
    timeRange:  hasRange ? { start: s.start_time as number, end: s.end_time as number } : undefined,
    diff:       buildDiff(s),
    status:     mapSuggestionStatus(s.status),
    action:     s.action ?? null,
    apiType:    s.type,
  }
}

function buildDiff(s: ApiSuggestion): DiffEntry[] {
  const action = s.action ?? {}
  const vt = String(action.visual_type || action.type || s.type || '').toLowerCase()
  if (vt.includes('stat') || vt.includes('large') || vt === 'visual_opportunity') {
    return [
      { kind: 'add', description: `Add ${vt.replace(/_/g, ' ')} overlay on video` },
      { kind: 'keep', description: String(action.display_value || s.description || '') },
    ]
  }
  if (s.start_time != null && s.end_time != null) {
    return [{ kind: 'remove', description: s.description || s.title, timeRange: { start: s.start_time, end: s.end_time } }]
  }
  return [{ kind: 'keep', description: s.description || s.title || '' }]
}

// ── Store interface ───────────────────────────────────────────────────────────

export interface SuggestionsState {
  suggestions:        Suggestion[]
  activeFilter:       SuggestionFilter
  promptText:         string
  isLoading:          boolean
  error:              string | null
  /** Whether the batch-accept confirmation modal is open */
  batchModalOpen:     boolean

  /** Replace suggestions with real ones from the backend (empty array clears). */
  loadFromApi:        (apiSuggestions: ApiSuggestion[]) => void
  /** Load exported demo fixtures — tests and local previews only. */
  loadDemoData:       () => void

  // ── Derived helpers (computed as functions for simplicity) ─────────────────
  filteredSuggestions: (filter?: SuggestionFilter) => Suggestion[]
  pendingCount:        (filter?: SuggestionFilter) => number
  highConfidencePending: () => Suggestion[]

  // ── Actions ────────────────────────────────────────────────────────────────
  setFilter:           (f: SuggestionFilter) => void
  acceptSuggestion:    (id: string) => void
  rejectSuggestion:    (id: string) => void
  undoSuggestion:      (id: string) => void
  batchAcceptHigh:     () => void
  openBatchModal:      () => void
  closeBatchModal:     () => void
  setPromptText:       (text: string) => void
  submitPrompt:        () => void
  setLoading:          (v: boolean) => void
  setError:            (msg: string | null) => void
  resetSuggestions:    () => void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSuggestionsStore = create<SuggestionsState>((set, get) => ({
  suggestions:    [],
  activeFilter:   'all',
  promptText:     '',
  isLoading:      false,
  error:          null,
  batchModalOpen: false,

  loadFromApi: (apiSuggestions) =>
    set({
      suggestions: apiSuggestions.map(mapApiSuggestion),
      activeFilter: 'all',
      error: null,
    }),

  loadDemoData: () =>
    set({
      suggestions:    PLACEHOLDER_SUGGESTIONS.map((s) => ({ ...s })),
      activeFilter:   'all',
      promptText:     '',
      isLoading:      false,
      error:          null,
      batchModalOpen: false,
    }),

  // ── Derived ───────────────────────────────────────────────────────────────

  filteredSuggestions: (filter) => {
    const f = filter ?? get().activeFilter
    return get().suggestions.filter((s) => matchesFilter(s, f))
  },

  pendingCount: (filter) => {
    const f = filter ?? get().activeFilter
    return get()
      .suggestions.filter((s) => s.status === 'pending' && matchesFilter(s, f))
      .length
  },

  highConfidencePending: () =>
    get().suggestions.filter(
      (s) => s.status === 'pending' && s.confidence >= HIGH_CONFIDENCE_THRESHOLD
    ),

  // ── Actions ───────────────────────────────────────────────────────────────

  setFilter: (f) => set({ activeFilter: f }),

  acceptSuggestion: (id) =>
    set((s) => ({
      suggestions: s.suggestions.map((sg) =>
        sg.id === id ? { ...sg, status: 'accepted' } : sg
      ),
    })),

  rejectSuggestion: (id) =>
    set((s) => ({
      suggestions: s.suggestions.map((sg) =>
        sg.id === id ? { ...sg, status: 'rejected' } : sg
      ),
    })),

  undoSuggestion: (id) =>
    set((s) => ({
      suggestions: s.suggestions.map((sg) =>
        sg.id === id ? { ...sg, status: 'pending' } : sg
      ),
    })),

  batchAcceptHigh: () =>
    set((s) => ({
      suggestions: s.suggestions.map((sg) =>
        sg.status === 'pending' && sg.confidence >= HIGH_CONFIDENCE_THRESHOLD
          ? { ...sg, status: 'accepted' }
          : sg
      ),
      batchModalOpen: false,
    })),

  openBatchModal:  () => set({ batchModalOpen: true }),
  closeBatchModal: () => set({ batchModalOpen: false }),

  setPromptText: (text) => set({ promptText: text }),

  submitPrompt: () => {
    // Placeholder — wired to API in EP-4.6
    set({ promptText: '', isLoading: true, error: null })
    setTimeout(() => set({ isLoading: false }), 1500)
  },

  setLoading: (v) => set({ isLoading: v }),
  setError:   (msg) => set({ error: msg }),

  resetSuggestions: () =>
    set({
      suggestions:    [],
      activeFilter:   'all',
      promptText:     '',
      isLoading:      false,
      error:          null,
      batchModalOpen: false,
    }),
}))
