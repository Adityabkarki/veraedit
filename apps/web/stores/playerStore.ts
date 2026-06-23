/**
 * Player Store — Zustand
 *
 * Manages video playback state synced to the timeline:
 *   – isPlaying / play / pause / togglePlay
 *   – currentTime (mirrors timelineStore.playheadTime)
 *   – volume / muted
 *   – playbackRate (0.5 × to 2 ×)
 *   – activeCaptionText — the Devanagari caption currently on-screen
 *   – duration — total video length in seconds
 *
 * The VideoPlayer component calls `seek()` to set currentTime and
 * also calls `useTimelineStore().setPlayheadTime()` to keep the
 * timeline playhead in sync with actual playback.
 *
 * NOT persisted — resets on every page load.
 */

import { create } from 'zustand'

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const
export type PlaybackRate = typeof PLAYBACK_RATES[number]

export interface PlayerState {
  isPlaying:         boolean
  currentTime:       number      // seconds
  duration:          number      // seconds
  volume:            number      // 0–1
  muted:             boolean
  playbackRate:      PlaybackRate
  /** Devanagari text currently shown on the caption overlay; null = no caption */
  activeCaptionText: string | null
  /** When set, playback loops/stops at this time (short preview) */
  previewEnd:        number | null

  /** Monotonic counter — VideoPlayer seeks+plays when this changes */
  previewNonce:      number
  previewStart:      number

  play:                () => void
  pause:               () => void
  togglePlay:          () => void
  seek:                (time: number) => void
  /** Seek to short segment and start playback in the preview panel */
  previewShort:        (start: number, end: number) => void
  setPreviewRange:     (start: number, end: number | null) => void
  clearPreviewRange:   () => void
  setDuration:         (d: number) => void
  setCurrentTime:      (t: number) => void
  setVolume:           (v: number) => void
  toggleMute:          () => void
  setPlaybackRate:     (r: PlaybackRate) => void
  setActiveCaptionText:(text: string | null) => void
}

export const initialPlayerState = {
  isPlaying:         false,
  currentTime:       0,
  duration:          0,
  volume:            1,
  muted:             false,
  playbackRate:      1 as PlaybackRate,
  activeCaptionText: null as string | null,
  previewEnd:        null as number | null,
  previewNonce:      0,
  previewStart:      0,
}

export const usePlayerStore = create<PlayerState>((set) => ({
  ...initialPlayerState,

  play:        () => set({ isPlaying: true }),
  pause:       () => set({ isPlaying: false }),
  togglePlay:  () => set((s) => ({ isPlaying: !s.isPlaying })),
  seek:        (time) => set({ currentTime: Math.max(0, time) }),
  previewShort: (start, end) =>
    set((s) => ({
      previewNonce: s.previewNonce + 1,
      previewStart: Math.max(0, start),
      previewEnd: end,
      currentTime: Math.max(0, start),
      isPlaying: true,
    })),
  setPreviewRange: (start, end) =>
    set({ currentTime: Math.max(0, start), previewEnd: end, previewStart: start, isPlaying: true }),
  clearPreviewRange: () => set({ previewEnd: null }),
  setDuration: (d) => set({ duration: Math.max(0, d) }),
  setCurrentTime: (t) => set({ currentTime: Math.max(0, t) }),

  setVolume: (v) =>
    set({ volume: Math.max(0, Math.min(1, v)), muted: v === 0 }),

  toggleMute: () => set((s) => ({ muted: !s.muted })),

  setPlaybackRate: (r) => set({ playbackRate: r }),

  setActiveCaptionText: (text) => set({ activeCaptionText: text }),
}))
