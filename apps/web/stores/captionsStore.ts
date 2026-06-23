/**
 * Captions Store — Zustand
 *
 * Manages the caption/subtitle list for the Subtitle Editor (EP-4.10).
 *
 * Data model:
 *   Caption — one subtitle entry (index, time range, text)
 *   CaptionStyle — visual style applied to all captions globally
 *
 * SRT/VTT export:
 *   Exported SRT files use UTF-8 BOM (﻿) for Windows compatibility.
 *   VTT files use the same format with period instead of comma as decimal separator.
 *
 * Nepali support:
 *   The 'nepali-bold' and 'bilingual' presets use font-nepali (Noto Sans
 *   Devanagari) — ONLY for caption rendering, never for UI chrome.
 */

import { create } from 'zustand'
import { syncCaptionsToTimeline, clearCaptionClipsFromTimeline } from '@/lib/captionTimelineSync'
import { useTimelineStore } from '@/stores/timelineStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CaptionPreset = 'nepali-bold' | 'subtitle' | 'tiktok' | 'bilingual'
export type FontSize       = 'small' | 'medium' | 'large' | 'xl'
export type Position       = 'bottom' | 'center' | 'top'

export interface CaptionStyle {
  preset:          CaptionPreset
  fontSize:        FontSize
  color:           string
  backgroundColor: string
  position:        Position
  bold:            boolean
  useNepaliFont:   boolean   // applies font-nepali class
}

export interface Caption {
  id:         string
  index:      number
  startTime:  number   // seconds
  endTime:    number   // seconds
  text:       string
}

// ── Style presets ─────────────────────────────────────────────────────────────

export const CAPTION_PRESETS: Record<CaptionPreset, CaptionStyle & { label: string; description: string }> = {
  'nepali-bold': {
    label:           'Nepali Bold',
    description:     'Large bold Devanagari captions — popular Nepali YouTube style',
    preset:          'nepali-bold',
    fontSize:        'xl',
    color:           '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.75)',
    position:        'bottom',
    bold:            true,
    useNepaliFont:   true,
  },
  'subtitle': {
    label:           'Subtitle',
    description:     'Standard clean subtitle — white text with dark shadow',
    preset:          'subtitle',
    fontSize:        'medium',
    color:           '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.5)',
    position:        'bottom',
    bold:            false,
    useNepaliFont:   false,
  },
  'tiktok': {
    label:           'TikTok',
    description:     'Bold centred captions — high contrast TikTok/Reels style',
    preset:          'tiktok',
    fontSize:        'large',
    color:           '#FFFF00',
    backgroundColor: 'rgba(0,0,0,0)',
    position:        'center',
    bold:            true,
    useNepaliFont:   false,
  },
  'bilingual': {
    label:           'Bilingual',
    description:     'Nepali + English side-by-side — for international reach',
    preset:          'bilingual',
    fontSize:        'medium',
    color:           '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.7)',
    position:        'bottom',
    bold:            false,
    useNepaliFont:   true,
  },
}

// ── Placeholder caption data (12 Nepali/English captions) ─────────────────────

export const INITIAL_CAPTIONS: Caption[] = [
  { id: 'cap-01', index:  1, startTime: 0.5,  endTime: 3.0,  text: 'नमस्ते साथीहरू!' },
  { id: 'cap-02', index:  2, startTime: 3.5,  endTime: 7.5,  text: 'आज हामी video editing बारे कुरा गर्नेछौँ।' },
  { id: 'cap-03', index:  3, startTime: 8.0,  endTime: 11.0, text: 'यो tool ले automatically silences detect गर्छ।' },
  { id: 'cap-04', index:  4, startTime: 11.5, endTime: 14.5, text: 'र captions generate गर्छ।' },
  { id: 'cap-05', index:  5, startTime: 15.0, endTime: 18.5, text: 'Whisper AI ले Nepali transcription गर्छ।' },
  { id: 'cap-06', index:  6, startTime: 19.0, endTime: 22.0, text: 'Timeline automatically update हुन्छ।' },
  { id: 'cap-07', index:  7, startTime: 22.5, endTime: 25.0, text: 'कुनै प्रश्न छ?' },
  { id: 'cap-08', index:  8, startTime: 25.5, endTime: 29.0, text: 'Comment section मा लेख्नुस्।' },
  { id: 'cap-09', index:  9, startTime: 30.0, endTime: 33.5, text: 'यो video मन पर्यो भने like गर्नुस्।' },
  { id: 'cap-10', index: 10, startTime: 34.0, endTime: 37.0, text: 'Subscribe गर्नुस् अझ धेरै videos को लागि।' },
  { id: 'cap-11', index: 11, startTime: 37.5, endTime: 40.0, text: 'धन्यवाद!' },
  { id: 'cap-12', index: 12, startTime: 40.5, endTime: 43.0, text: 'Thank you for watching!' },
]

// ── SRT / VTT formatters (exported for testing) ───────────────────────────────

export function toSRTTime(seconds: number): string {
  const h  = Math.floor(seconds / 3600)
  const m  = Math.floor((seconds % 3600) / 60)
  const s  = Math.floor(seconds % 60)
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000)
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0'),
  ].join(':') + ',' + String(ms).padStart(3, '0')
}

export function toVTTTime(seconds: number): string {
  return toSRTTime(seconds).replace(',', '.')
}

export function generateSRT(captions: Caption[]): string {
  return captions
    .map((c, i) =>
      `${i + 1}\n${toSRTTime(c.startTime)} --> ${toSRTTime(c.endTime)}\n${c.text}`
    )
    .join('\n\n')
}

export function generateVTT(captions: Caption[]): string {
  const body = captions
    .map((c) => `${toVTTTime(c.startTime)} --> ${toVTTTime(c.endTime)}\n${c.text}`)
    .join('\n\n')
  return `WEBVTT\n\n${body}`
}

/** Trigger a browser file download. No-op in SSR or test environments. */
export function downloadTextFile(
  content: string,
  filename: string,
  utf8bom = false
): void {
  if (typeof window === 'undefined') return
  const prefix  = utf8bom ? '﻿' : ''
  const blob    = new Blob([prefix + content], { type: 'text/plain;charset=utf-8' })
  const url     = URL.createObjectURL(blob)
  const anchor  = document.createElement('a')
  anchor.href     = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface CaptionsState {
  captions:       Caption[]
  globalStyle:    CaptionStyle
  editingId:      string | null
  selectedId:     string | null
  searchQuery:    string
  replaceText:    string
  caseSensitive:  boolean
  searchMatchIds: string[]

  // ── Caption editing ──────────────────────────────────────────────────────
  startEdit:         (id: string) => void
  stopEdit:          () => void
  updateText:        (id: string, text: string) => void
  updateStartTime:   (id: string, time: number) => void
  updateEndTime:     (id: string, time: number) => void
  selectCaption:     (id: string | null) => void
  addCaption:        (afterId: string) => void
  deleteCaption:     (id: string) => void
  resetCaptions:     () => void
  /** Build captions from a real backend transcript. */
  loadFromTranscript:(api: import('@/stores/transcriptStore').ApiTranscript) => void
  /** Load exported demo fixtures — tests only. */
  loadDemoData:      () => void

  // ── Style ────────────────────────────────────────────────────────────────
  applyPreset:       (preset: CaptionPreset) => void
  setStyleProp:      <K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) => void

  // ── Find / replace ───────────────────────────────────────────────────────
  setSearchQuery:    (q: string) => void
  setReplaceText:    (t: string) => void
  toggleCaseSensitive: () => void
  findAll:           () => void
  replaceAll:        () => void

  // ── Export ───────────────────────────────────────────────────────────────
  exportSRT:         () => void
  exportVTT:         () => void
}

let _nextCaptionId = 100

/** Group transcript words into short caption chunks (Nepali-friendly ~4 words). */
export function transcriptToCaptions(
  api: import('@/stores/transcriptStore').ApiTranscript,
): Caption[] {
  const words = api.words ?? []
  if (words.length > 0) {
    const caps: Caption[] = []
    const chunkSize = 4
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize)
      caps.push({
        id:        `cap-${i}`,
        index:     caps.length + 1,
        startTime: chunk[0].start,
        endTime:   chunk[chunk.length - 1].end,
        text:      chunk.map((w) => w.word).join(' '),
      })
    }
    return caps
  }
  const text = api.full_text?.trim()
  if (text) {
    return [{ id: 'cap-0', index: 1, startTime: 0, endTime: 30, text }]
  }
  return []
}

export const useCaptionsStore = create<CaptionsState>((set, get) => ({
  captions:       [],
  globalStyle:    { ...CAPTION_PRESETS['nepali-bold'] },
  editingId:      null,
  selectedId:     null,
  searchQuery:    '',
  replaceText:    '',
  caseSensitive:  false,
  searchMatchIds: [],

  startEdit: (id) => set({ editingId: id, selectedId: id }),
  stopEdit:  () => {
    set({ editingId: null })
    syncCaptionsToTimeline(get().captions, { actionLabel: 'Edited caption' })
  },

  updateText: (id, text) =>
    set((s) => ({
      captions: s.captions.map((c) => (c.id === id ? { ...c, text } : c)),
    })),

  updateStartTime: (id, time) => {
    set((s) => ({
      captions: s.captions.map((c) =>
        c.id === id ? { ...c, startTime: Math.max(0, time) } : c
      ),
    }))
    syncCaptionsToTimeline(get().captions, { actionLabel: 'Adjusted caption timing', pushHistory: true })
  },

  updateEndTime: (id, time) => {
    set((s) => ({
      captions: s.captions.map((c) => {
        if (c.id !== id) return c
        return { ...c, endTime: Math.max(c.startTime + 0.1, time) }
      }),
    }))
    syncCaptionsToTimeline(get().captions, { actionLabel: 'Adjusted caption timing', pushHistory: true })
  },

  selectCaption: (id) => set({ selectedId: id }),

  addCaption: (afterId) => {
    set((s) => {
      const idx  = s.captions.findIndex((c) => c.id === afterId)
      if (idx < 0) return {}
      const prev = s.captions[idx]
      const next: Caption = {
        id:        `cap-${++_nextCaptionId}`,
        index:     prev.index + 1,
        startTime: prev.endTime + 0.1,
        endTime:   prev.endTime + 2.0,
        text:      '',
      }
      const newCaps = [
        ...s.captions.slice(0, idx + 1),
        next,
        ...s.captions.slice(idx + 1).map((c) => ({ ...c, index: c.index + 1 })),
      ]
      return { captions: newCaps, editingId: next.id, selectedId: next.id }
    })
    syncCaptionsToTimeline(get().captions, { actionLabel: 'Added caption', pushHistory: true })
  },

  deleteCaption: (id) => {
    set((s) => {
      const filtered = s.captions
        .filter((c) => c.id !== id)
        .map((c, i) => ({ ...c, index: i + 1 }))
      return {
        captions:  filtered,
        selectedId: s.selectedId === id ? null : s.selectedId,
        editingId:  s.editingId  === id ? null : s.editingId,
      }
    })
    syncCaptionsToTimeline(get().captions, { actionLabel: 'Deleted caption', pushHistory: true })
    useTimelineStore.setState({
      selectedClipIds: useTimelineStore.getState().selectedClipIds.filter((x) => x !== id),
    })
  },

  resetCaptions: () => {
    set({
      captions:       [],
      globalStyle:    { ...CAPTION_PRESETS['nepali-bold'] },
      editingId:      null,
      selectedId:     null,
      searchQuery:    '',
      replaceText:    '',
      searchMatchIds: [],
    })
    clearCaptionClipsFromTimeline()
  },

  loadFromTranscript: (api) => {
    const captions = transcriptToCaptions(api)
    set({
      captions,
      globalStyle:    { ...CAPTION_PRESETS['nepali-bold'] },
      editingId:      null,
      selectedId:     null,
      searchQuery:    '',
      replaceText:    '',
      searchMatchIds: [],
    })
    syncCaptionsToTimeline(captions, { actionLabel: 'Loaded AI captions' })
  },

  loadDemoData: () => {
    const captions = INITIAL_CAPTIONS.map((c) => ({ ...c }))
    set({
      captions,
      globalStyle:    { ...CAPTION_PRESETS['nepali-bold'] },
      editingId:      null,
      selectedId:     null,
      searchQuery:    '',
      replaceText:    '',
      searchMatchIds: [],
    })
    syncCaptionsToTimeline(captions)
  },

  applyPreset: (preset) =>
    set({ globalStyle: { ...CAPTION_PRESETS[preset] } }),

  setStyleProp: (key, value) =>
    set((s) => ({ globalStyle: { ...s.globalStyle, [key]: value } })),

  setSearchQuery: (q) =>
    set((s) => {
      if (!q.trim()) return { searchQuery: q, searchMatchIds: [] }
      const cs    = s.caseSensitive
      const query = cs ? q : q.toLowerCase()
      const ids   = s.captions
        .filter((c) => {
          const text = cs ? c.text : c.text.toLowerCase()
          return text.includes(query)
        })
        .map((c) => c.id)
      return { searchQuery: q, searchMatchIds: ids }
    }),

  setReplaceText: (t) => set({ replaceText: t }),

  toggleCaseSensitive: () =>
    set((s) => ({ caseSensitive: !s.caseSensitive })),

  findAll: () =>
    set((s) => {
      const q     = s.searchQuery
      if (!q.trim()) return { searchMatchIds: [] }
      const cs    = s.caseSensitive
      const lower = cs ? q : q.toLowerCase()
      const ids   = s.captions
        .filter((c) => (cs ? c.text : c.text.toLowerCase()).includes(lower))
        .map((c) => c.id)
      return { searchMatchIds: ids }
    }),

  replaceAll: () => {
    set((s) => {
      const { searchQuery, replaceText, caseSensitive } = s
      if (!searchQuery.trim()) return {}
      const newCaptions = s.captions.map((c) => {
        const text = caseSensitive
          ? c.text.replaceAll(searchQuery, replaceText)
          : c.text.replace(
              new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
              replaceText
            )
        return { ...c, text }
      })
      return { captions: newCaptions, searchMatchIds: [] }
    })
    syncCaptionsToTimeline(get().captions, { actionLabel: 'Replaced caption text' })
  },

  exportSRT: () => {
    const srt = generateSRT(get().captions)
    downloadTextFile(srt, 'captions.srt', true)  // UTF-8 BOM for Windows
  },

  exportVTT: () => {
    const vtt = generateVTT(get().captions)
    downloadTextFile(vtt, 'captions.vtt', false)
  },
}))
