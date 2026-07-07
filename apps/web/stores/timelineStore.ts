/**
 * Timeline Store — Zustand
 *
 * Manages all interactive timeline state:
 *   – tracks (4 color-coded) with mute / lock / visible flags
 *   – clips (positioned by startTime + duration in seconds)
 *   – playhead position
 *   – zoom level (pixelsPerSecond)
 *   – snap system
 *   – undo / redo history (max 50 entries, in-memory only)
 *   – undo toast trigger
 *
 * Zoom + snap preference are persisted to localStorage.
 * Clips/tracks start empty and are populated by loadEditorProject() or loadDemoData().
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { usePlayerStore } from '@/stores/playerStore'
import { apiTimelineToStore, type ApiTimelineData } from '@/lib/timelineApi'
import { syncStyleTransferFromTimeline } from '@/lib/styleTransferSync'
import { removeCaptionsByClipIds } from '@/lib/captionTimelineSync'
import {
  allocateDedicatedTrack,
  isFamilyTrack,
  OVERLAY_FAMILY,
  IMAGES_FAMILY,
  offsetEffectsForLane,
} from '@/lib/timelineLayers'
import {
  shouldUseLongFormOptimizations,
  timelineDurationSeconds,
} from '@/lib/editor/longFormThresholds'
import {
  applyFullClipList,
  fullTimelineClips,
  mutateFullClipList,
} from '@/lib/editor/timelineClipState'
import {
  applyTimelinePatch,
  computeTimelinePatch,
  type HistoryEntry,
  type SnapshotHistoryEntry,
} from '@/lib/editor/timelineHistory'
import { framesFromTimeWindow, computeVisibleTimeWindow, filterClipsToWindow } from '@/lib/editor/timelineWindowing'
import { fetchDirectorTimelineWindow } from '@/lib/directorTimelineWindow'
import { useDirectorStore } from '@/stores/directorStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClipType = 'video' | 'audio' | 'caption' | 'music' | 'overlay' | 'effect'

export interface EffectKeyframe {
  /** Seconds from the start of the effect clip */
  offset: number
  /** Interpolated value (0–1 intensity, or speed multiplier) */
  value:  number
}

export interface ClipEffects {
  visualType?: string
  templateId?: string
  displayValue?: string
  secondaryText?: string
  suggestedVisual?: string
  nepaliLabel?: string
  /** Overlay position/size on preview (percent of frame) */
  xPct?: number
  yPct?: number
  widthPct?: number
  heightPct?: number
  rotation?: number
  scale?: number
  emoji?: string
  /** corner | fullscreen */
  overlayMode?: 'corner' | 'fullscreen'
  /** Color filter from Effects drawer */
  colorFilterId?: string
  colorFilterCss?: string
  /** Out transition to the next clip */
  transitionOut?: string
  transitionDuration?: number
  /** Speed curve hint (linear, ramp-up, etc.) */
  speedCurve?: string
  /** Caption segment index (captions track) */
  captionIndex?: number
  /** Keyframed effect on Effects track */
  effectType?: 'filter' | 'speed' | 'opacity' | 'transition' | 'transform' | 'digital_zoom' | 'caption'
  /** Zoom interpolation curve for camera lane clips */
  zoomEasing?: 'linear' | 'ease-out'
  effectPresetId?: string
  parentClipId?: string
  keyframes?: EffectKeyframe[]
  /** Set when effects came from style transfer apply */
  styleTransfer?: boolean
  /** Raw color_grade params for API round-trip */
  styleTransferColorGrade?: Record<string, unknown>
  /** SFX slot from style formula (dedicated SFX audio lane) */
  sfxType?: string
  /** Catalog slug → /sfx/{slug}.mp3 */
  sfxSlug?: string
  sfxVolume?: number
  /** B-roll / overlay media URL (paste link or uploaded file object URL) */
  mediaUrl?: string
  /** image | video — for B-roll preview rendering */
  mediaKind?: 'image' | 'video'
  mediaFileName?: string
  brollType?: string
  isPlaceholder?: boolean
  styleToolId?: string
  /** Music bed placeholder (music track) */
  musicBed?: boolean
  duckUnderVoice?: boolean
  musicStorageKey?: string
  /** B-roll gap resolution from style apply */
  gapResolutionNeeded?: boolean
  gapMatchStatus?: string
  gapMatchScore?: number
  gapDescription?: string
  /** Jump-cut segment marker (video track) */
  pacingSegment?: boolean
  /** Caption FX track — animation preset on real captions */
  captionAnimation?: string
  maxWordsPerLine?: number
  captionCase?: string
  captionPosition?: string
  /** Text/overlay entrance motion (fade in, slide in, …) */
  overlayEntrance?: string
  /** Text/overlay exit motion */
  overlayExit?: string
  /** Pro motion graphics — Remotion render types */
  motionEnter?: string
  motionExit?: string
  motionEnterDuration?: number
  motionExitDuration?: number
  motionSpring?: { damping?: number; stiffness?: number; mass?: number }
  motionAnimation?: {
    enter?: string
    exit?: string
    enterDuration?: number
    exitDuration?: number
    spring?: { damping?: number; stiffness?: number; mass?: number }
  }
  motionProps?: Record<string, unknown>
  brandColor?: string
  accentColor?: string
  /** Image layer — flip / lock / visibility */
  flipX?: boolean
  flipY?: boolean
  lockAspectRatio?: boolean
  imageLocked?: boolean
  imageVisible?: boolean
  /** Image appearance (0–100 or 0–200 where noted) */
  imageOpacity?: number
  brightness?: number
  contrast?: number
  saturation?: number
  sharpness?: number
  blurPx?: number
  cornerRadius?: number
  blendMode?: string
  filterPreset?: string
  filterIntensity?: number
  borderWidth?: number
  borderColor?: string
  shadowEnabled?: boolean
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowColor?: string
  shadowOpacity?: number
  entranceDuration?: number
  exitDuration?: number
  cropAspect?: string
  maskShape?: string
  storageKey?: string
  /** Project media / asset row id when clip uses uploaded supplementary media */
  mediaAssetId?: string
  layerOrder?: number
  /** True after client-side background removal (PNG with alpha). */
  backgroundRemoved?: boolean
  /** Chart/process inserted as fullscreen B-Roll layer */
  chartAsBroll?: boolean
}

export interface Clip {
  id: string
  trackId: string
  /** Start position on the timeline in seconds */
  startTime: number
  /** Length of the clip in seconds */
  duration: number
  label: string
  type: ClipType
  /** Source media in/out points (for FFmpeg render) */
  sourceStart?: number
  sourceEnd?: number
  /** Playback speed multiplier (1 = normal) */
  speed?: number
  effects?: ClipEffects
  /** Gap resolver metadata (B-roll slots from style apply) */
  gapResolutionNeeded?: boolean
  gapMetadata?: {
    slotId?: string
    matchStatus?: string
    matchScore?: number
    description?: string
    requirement?: Record<string, unknown>
  }
}

export interface Track {
  id: string
  label: string
  color: string
  muted: boolean
  locked: boolean
  visible: boolean
}

export interface TimelineMarker {
  id: string
  time: number
  label: string
  type: 'chapter' | 'cue'
}

interface PendingSnapshot {
  clips: Clip[]
  tracks: Track[]
}

// HistoryEntry imported from timelineHistory (diff | snapshot)

export const PPS_MIN     = 4     // pixels per second — most zoomed out
export const PPS_MAX     = 400   // pixels per second — most zoomed in
export const PPS_DEFAULT = 80    // pixels per second — 1×

import { TIMELINE_HEADER_WIDTH_PX as TIMELINE_HEADER_WIDTH } from '@/lib/timelineLayout'

/** Pixels reserved left of the scrollable clip area (track header column). */
export const TIMELINE_HEADER_WIDTH_PX = TIMELINE_HEADER_WIDTH
/** Extra padding past the last clip edge when computing fit-to-width. */
export const TIMELINE_CONTENT_PADDING_PX = 120

export const CLIP_MIN_DURATION = 0.1   // seconds
export const HISTORY_MAX       = 50    // undo entries

// ── Placeholder data ──────────────────────────────────────────────────────────

export const INITIAL_TRACKS: Track[] = [
  { id: 'video',    label: 'Video',    color: '#3B82F6', muted: false, locked: false, visible: true },
  { id: 'camera',   label: 'Camera',   color: '#2563EB', muted: false, locked: false, visible: true },
  { id: 'broll',    label: 'B-Roll',   color: '#374151', muted: false, locked: false, visible: true },
  { id: 'audio',    label: 'Audio',    color: '#8B5CF6', muted: false, locked: false, visible: true },
  { id: 'captions', label: 'Captions', color: '#F59E0B', muted: false, locked: false, visible: true },
  { id: 'caption-fx', label: 'Caption FX', color: '#D97706', muted: false, locked: false, visible: true },
  { id: 'overlay',  label: 'Elements', color: '#EC4899', muted: false, locked: false, visible: true },
  { id: 'effects',  label: 'Effects',  color: '#7C3AED', muted: false, locked: false, visible: true },
  { id: 'music',    label: 'Music',    color: '#10B981', muted: false, locked: false, visible: true },
]

export const INITIAL_CLIPS: Clip[] = [
  { id: 'v1', trackId: 'video',    startTime: 0,    duration: 6,    label: 'Clip 01',           type: 'video'   },
  { id: 'v2', trackId: 'video',    startTime: 7,    duration: 4,    label: 'Clip 02',           type: 'video'   },
  { id: 'v3', trackId: 'video',    startTime: 12,   duration: 7,    label: 'Clip 03',           type: 'video'   },
  { id: 'a1', trackId: 'audio',    startTime: 0,    duration: 19,   label: 'Audio track',       type: 'audio'   },
  { id: 'c1', trackId: 'captions', startTime: 0.5,  duration: 3,    label: 'नमस्ते…',           type: 'caption' },
  { id: 'c2', trackId: 'captions', startTime: 4,    duration: 3.5,  label: 'Caption 2',         type: 'caption' },
  { id: 'c3', trackId: 'captions', startTime: 8,    duration: 2.5,  label: 'Caption 3',         type: 'caption' },
  { id: 'm1', trackId: 'music',    startTime: 0,    duration: 19,   label: 'Background music',  type: 'music'   },
]

// ── Store interface ───────────────────────────────────────────────────────────

export interface TimelineState {
  tracks:            Track[]
  clips:             Clip[]
  markers:           TimelineMarker[]
  pixelsPerSecond:   number
  scrollX:           number
  playheadTime:      number
  selectedClipIds:   string[]
  snapEnabled:       boolean
  /** Time (seconds) where the orange snap indicator is shown; null = hidden */
  snapIndicatorTime: number | null
  /** Set after every edit to trigger the "Ctrl+Z to undo" toast */
  lastEditAction:    string | null
  /** Bumped on API reloads so preview can refresh without overwriting backend edits. */
  timelineVersion:   number
  /** Long-form optimizations active (viewport windowing + diff undo). */
  longFormMode:      boolean
  /** Full clip list when longFormMode — `clips` holds the visible window only. */
  allClips:          Clip[]
  directorTimelineId: string | null
  viewportWidthPx:   number
  /** Full project duration — stable when `clips` is viewport-windowed. */
  totalDurationSec:  number
  undoStack:         HistoryEntry[]
  redoStack:         HistoryEntry[]
  /** Snapshot saved at drag-start; committed on drag-end */
  _pendingSnapshot:  PendingSnapshot | null

  /** Build the timeline from a real asset: one video + one audio clip. */
  loadFromAsset:       (opts: { label: string; durationSeconds: number; assetId?: string }) => void
  /** Load exported demo fixtures — tests and local previews only. */
  loadDemoData:        () => void
  /** Clear clips and playback state (empty project). */
  resetTimeline:       () => void
  /** Load timeline from GET /projects/{id}/timeline response. */
  loadFromApi:         (data: import('@/lib/timelineApi').ApiTimelineData, options?: { preservePlayhead?: boolean }) => void

  // ── Playback ────────────────────────────────────────────────────────────
  setPlayheadTime:     (t: number) => void
  stepPlayhead:        (deltaSeconds: number) => void

  // ── Zoom / scroll ────────────────────────────────────────────────────────
  setPixelsPerSecond:  (pps: number) => void
  zoomIn:              () => void
  zoomOut:             () => void
  zoomToFit:           (viewportWidthPx: number, durationSec: number) => void
  setScrollX:          (x: number) => void
  /** Refresh visible clip window after scroll/zoom (long-form only). */
  refreshVisibleWindow: (viewportWidthPx: number) => void
  /** Debounced window fetch for director timelines (long-form only). */
  syncDirectorWindow: (viewportWidthPx: number, fps?: number) => Promise<void>
  setDirectorTimelineId: (id: string | null) => void

  // ── Selection ────────────────────────────────────────────────────────────
  selectClip:          (id: string | null, addToSelection?: boolean) => void
  clearSelection:      () => void

  // ── Snap ─────────────────────────────────────────────────────────────────
  toggleSnap:          () => void
  setSnapIndicatorTime:(t: number | null) => void

  // ── Drag lifecycle (begin saves snapshot; end commits to undo stack) ──────
  beginEdit:           () => void
  endEdit:             (actionLabel: string) => void

  // ── Clip mutations (called during drag — no history touch) ───────────────
  moveClip:            (clipId: string, newStartTime: number) => void
  trimClipStart:       (clipId: string, newStartTime: number, newDuration: number) => void
  trimClipEnd:         (clipId: string, newDuration: number) => void

  // ── Instant edits (push to history internally) ───────────────────────────
  splitClip:           (clipId: string, splitTime: number) => void
  deleteSelectedClips: () => void
  duplicateClip:       (clipId: string) => void

  // ── Track controls ───────────────────────────────────────────────────────
  toggleMute:       (trackId: string) => void
  toggleLock:       (trackId: string) => void
  toggleVisibility: (trackId: string) => void

  // ── Chapter markers ───────────────────────────────────────────────────────
  addMarker:        (marker: Omit<TimelineMarker, 'id'> & { id?: string }) => void
  clearMarkers:     () => void
  setMarkers:       (markers: TimelineMarker[]) => void

  /** Update overlay clip transform (preview drag / edit panel). */
  updateOverlayClip: (clipId: string, patch: Partial<ClipEffects>) => void

  /** Return the full clip list (not viewport-windowed). */
  getFullClips: () => Clip[]
  /**
   * Mutate the full clip list with long-form windowing applied.
   * Use this instead of setState({ clips }) from outside the store.
   */
  commitClipsUpdate: (
    mutator: (clips: Clip[]) => Clip[],
    options?: {
      tracks?: Track[]
      lastEditAction?: string
      selectedClipIds?: string[]
      recordUndo?: boolean
    },
  ) => void

  // ── Undo / redo ──────────────────────────────────────────────────────────
  undo:                () => void
  redo:                () => void
  clearLastEditAction: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampPPS(pps: number): number {
  return Math.max(PPS_MIN, Math.min(PPS_MAX, pps))
}

/** Zoom level that fits `durationSec` into `viewportWidthPx` of clip area. */
export function computeFitPixelsPerSecond(
  viewportWidthPx: number,
  durationSec: number,
  headerWidth = TIMELINE_HEADER_WIDTH_PX,
  paddingRight = TIMELINE_CONTENT_PADDING_PX,
): number {
  if (durationSec <= 0) return PPS_DEFAULT
  const usable = Math.max(40, viewportWidthPx - headerWidth - paddingRight)
  return clampPPS(usable / durationSec)
}

function clampTime(t: number): number {
  return Math.max(0, t)
}

function pushToHistory(
  stack: HistoryEntry[],
  entry: HistoryEntry,
): HistoryEntry[] {
  return [...stack.slice(-(HISTORY_MAX - 1)), entry]
}

function configureLongForm(clips: Clip[]): {
  longFormMode: boolean
  allClips: Clip[]
} {
  const duration = timelineDurationSeconds(clips)
  const longFormMode = shouldUseLongFormOptimizations(clips.length, duration)
  return { longFormMode, allClips: longFormMode ? clips : [] }
}

function snapshotEntry(clips: Clip[], tracks: Track[]): SnapshotHistoryEntry {
  return {
    kind: 'snapshot',
    clips: clips.map((c) => ({ ...c })),
    tracks: tracks.map((t) => ({ ...t })),
  }
}

function pushHistoryFromMutation(
  stack: HistoryEntry[],
  before: { clips: Clip[]; tracks: Track[] },
  after: { clips: Clip[]; tracks: Track[] },
  longFormMode: boolean,
): HistoryEntry[] {
  if (longFormMode) {
    const patch = computeTimelinePatch(before.clips, after.clips, before.tracks, after.tracks)
    return pushToHistory(stack, { kind: 'diff', patch })
  }
  return pushToHistory(stack, snapshotEntry(before.clips, before.tracks))
}

function fullClipSource(s: {
  longFormMode: boolean
  allClips: Clip[]
  clips: Clip[]
}): Clip[] {
  return fullTimelineClips(s)
}

function applyClipMutation(
  s: {
    longFormMode: boolean
    allClips: Clip[]
    clips: Clip[]
    scrollX: number
    viewportWidthPx: number
    pixelsPerSecond: number
  },
  mutator: (clips: Clip[]) => Clip[],
  tracks?: Track[],
): Partial<{
  clips: Clip[]
  allClips: Clip[]
  tracks: Track[]
}> {
  return mutateFullClipList(s, mutator, tracks)
}

function applyHistoryEntry(
  entry: HistoryEntry,
  current: { clips: Clip[]; tracks: Track[] },
  direction: 'undo' | 'redo',
): { clips: Clip[]; tracks: Track[] } {
  if (entry.kind === 'snapshot') {
    return {
      clips: entry.clips.map((c) => ({ ...c })),
      tracks: entry.tracks.map((t) => ({ ...t })),
    }
  }
  const patchDir = direction === 'undo' ? 'inverse' : 'forward'
  return applyTimelinePatch(current.clips, current.tracks, entry.patch, patchDir)
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTimelineStore = create<TimelineState>()(
  persist(
    (set, get) => ({
      tracks:            INITIAL_TRACKS.map((t) => ({ ...t })),
      clips:             [],
      markers:           [],
      pixelsPerSecond:   PPS_DEFAULT,
      scrollX:           0,
      playheadTime:      0,
      selectedClipIds:   [],
      snapEnabled:       true,
      snapIndicatorTime: null,
      lastEditAction:    null,
      timelineVersion:   0,
      longFormMode:      false,
      allClips:          [],
      directorTimelineId: null,
      viewportWidthPx:   1200,
      totalDurationSec:  0,
      undoStack:         [],
      redoStack:         [],
      _pendingSnapshot:  null,

      // ── Playback ──────────────────────────────────────────────────────────

      loadFromAsset: ({ label, durationSeconds, assetId }) => {
        const dur = Math.max(0.1, durationSeconds || 0)
        const clipId = assetId ? `clip-${assetId.slice(0, 8)}` : 'clip-video'
        set({
          tracks: INITIAL_TRACKS.map((t) => ({ ...t })),
          clips: [
            {
              id: clipId,
              trackId: 'video',
              startTime: 0,
              duration: dur,
              label,
              type: 'video',
              sourceStart: 0,
              sourceEnd: dur,
            },
            {
              id: `${clipId}-audio`,
              trackId: 'audio',
              startTime: 0,
              duration: dur,
              label: 'Audio',
              type: 'audio',
              sourceStart: 0,
              sourceEnd: dur,
            },
          ],
          playheadTime: 0,
          selectedClipIds: [],
          undoStack: [],
          redoStack: [],
          _pendingSnapshot: null,
          lastEditAction: null,
          longFormMode: false,
          allClips: [],
          totalDurationSec: dur,
        })
      },

      loadFromApi: (data: ApiTimelineData, options?: { preservePlayhead?: boolean }) => {
        const { tracks, clips } = apiTimelineToStore(data)
        const prevPlayhead = get().playheadTime
        syncStyleTransferFromTimeline(data)
        const lf = configureLongForm(clips)
        const totalDurationSec =
          data.global_settings?.duration ??
          timelineDurationSeconds(clips)
        set({
          tracks,
          clips,
          ...lf,
          totalDurationSec,
          playheadTime: options?.preservePlayhead ? prevPlayhead : 0,
          selectedClipIds: [],
          undoStack: [],
          redoStack: [],
          _pendingSnapshot: null,
          lastEditAction: null,
          timelineVersion: get().timelineVersion + 1,
        })
        if (lf.longFormMode) {
          get().refreshVisibleWindow(get().viewportWidthPx)
        }
      },

      loadDemoData: () =>
        set({
          tracks:            INITIAL_TRACKS.map((t) => ({ ...t })),
          clips:             INITIAL_CLIPS.map((c) => ({ ...c })),
          markers:           [],
          playheadTime:      0,
          selectedClipIds:   [],
          undoStack:         [],
          redoStack:         [],
          _pendingSnapshot:  null,
          lastEditAction:    null,
          longFormMode:      false,
          allClips:          [],
          totalDurationSec:  timelineDurationSeconds(INITIAL_CLIPS),
        }),

      resetTimeline: () =>
        set({
          tracks:            INITIAL_TRACKS.map((t) => ({ ...t })),
          clips:             [],
          markers:           [],
          playheadTime:      0,
          selectedClipIds:   [],
          undoStack:         [],
          redoStack:         [],
          _pendingSnapshot:  null,
          lastEditAction:    null,
          longFormMode:      false,
          allClips:          [],
          totalDurationSec:  0,
        }),

      setPlayheadTime: (t) => {
        const clamped = clampTime(t)
        set({ playheadTime: clamped })
        usePlayerStore.getState().seek(clamped)
      },

      stepPlayhead: (delta) => {
        const clamped = clampTime(get().playheadTime + delta)
        set({ playheadTime: clamped })
        usePlayerStore.getState().seek(clamped)
      },

      // ── Zoom / scroll ──────────────────────────────────────────────────────

      setPixelsPerSecond: (pps) => {
        set({ pixelsPerSecond: clampPPS(pps) })
        const s = get()
        if (s.longFormMode) s.refreshVisibleWindow(s.viewportWidthPx)
      },

      zoomIn: () => {
        set((s) => ({ pixelsPerSecond: clampPPS(s.pixelsPerSecond * 1.5) }))
        const s = get()
        if (s.longFormMode) s.refreshVisibleWindow(s.viewportWidthPx)
      },

      zoomOut: () => {
        set((s) => ({ pixelsPerSecond: clampPPS(s.pixelsPerSecond / 1.5) }))
        const s = get()
        if (s.longFormMode) s.refreshVisibleWindow(s.viewportWidthPx)
      },

      zoomToFit: (viewportWidthPx, durationSec) => {
        set({ pixelsPerSecond: computeFitPixelsPerSecond(viewportWidthPx, durationSec) })
        const s = get()
        if (s.longFormMode) s.refreshVisibleWindow(viewportWidthPx)
      },

      setScrollX: (x) => {
        set({ scrollX: Math.max(0, x) })
        const s = get()
        if (s.longFormMode) {
          s.refreshVisibleWindow(s.viewportWidthPx)
        }
      },

      refreshVisibleWindow: (viewportWidthPx) => {
        const s = get()
        const source = s.longFormMode && s.allClips.length > 0 ? s.allClips : s.clips
        const window = computeVisibleTimeWindow(s.scrollX, viewportWidthPx, s.pixelsPerSecond)
        const visible = filterClipsToWindow(source, window)
        set({ clips: visible, viewportWidthPx, allClips: s.longFormMode ? source : [] })
      },

      setDirectorTimelineId: (id) => set({ directorTimelineId: id }),

      syncDirectorWindow: async (viewportWidthPx, fps?: number) => {
        const s = get()
        if (!s.longFormMode || !s.directorTimelineId) return
        s.refreshVisibleWindow(viewportWidthPx)
        const directorFps =
          fps ??
          useDirectorStore.getState().timeline?.fps ??
          30
        const window = computeVisibleTimeWindow(
          s.scrollX,
          viewportWidthPx,
          s.pixelsPerSecond,
        )
        const { startFrame, endFrame } = framesFromTimeWindow(window, directorFps)
        const { data } = await fetchDirectorTimelineWindow(
          s.directorTimelineId,
          startFrame,
          endFrame,
        )
        if (!data?.timeline) return
        useDirectorStore.getState().applyWindowSlice(
          data.timeline as import('@/types/director').DirectorTimeline,
          startFrame,
          endFrame,
        )
      },

      getFullClips: () => fullClipSource(get()),

      commitClipsUpdate: (mutator, options) =>
        set((s) => {
          const source = fullClipSource(s)
          const nextAll = mutator(source)
          const mutation = applyClipMutation(s, () => nextAll, options?.tracks)
          const patch: Partial<TimelineState> = {
            ...mutation,
            ...(options?.lastEditAction !== undefined
              ? { lastEditAction: options.lastEditAction }
              : {}),
            ...(options?.selectedClipIds !== undefined
              ? { selectedClipIds: options.selectedClipIds }
              : {}),
          }
          if (options?.recordUndo) {
            patch.undoStack = pushHistoryFromMutation(
              s.undoStack,
              { clips: source, tracks: s.tracks },
              {
                clips: nextAll,
                tracks: options?.tracks ?? s.tracks,
              },
              s.longFormMode,
            )
            patch.redoStack = []
          }
          return patch
        }),

      // ── Selection ──────────────────────────────────────────────────────────

      selectClip: (id, addToSelection = false) =>
        set((s) => {
          if (id === null) return { selectedClipIds: [] }
          if (addToSelection) {
            const already = s.selectedClipIds.includes(id)
            return {
              selectedClipIds: already
                ? s.selectedClipIds.filter((x) => x !== id)
                : [...s.selectedClipIds, id],
            }
          }
          return { selectedClipIds: [id] }
        }),

      clearSelection: () => set({ selectedClipIds: [] }),

      // ── Snap ───────────────────────────────────────────────────────────────

      toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

      setSnapIndicatorTime: (t) => set({ snapIndicatorTime: t }),

      // ── Drag lifecycle ─────────────────────────────────────────────────────

      beginEdit: () =>
        set((s) => {
          const source = fullClipSource(s)
          return {
            _pendingSnapshot: {
              clips: source.map((c) => ({ ...c })),
              tracks: s.tracks.map((t) => ({ ...t })),
            },
          }
        }),

      endEdit: (actionLabel) =>
        set((s) => {
          if (!s._pendingSnapshot) return { lastEditAction: actionLabel }
          const source = fullClipSource(s)
          return {
            undoStack: pushHistoryFromMutation(
              s.undoStack,
              s._pendingSnapshot,
              { clips: source, tracks: s.tracks },
              s.longFormMode,
            ),
            redoStack: [],
            lastEditAction: actionLabel,
            _pendingSnapshot: null,
          }
        }),

      // ── Live mutations (called during drag) ────────────────────────────────

      moveClip: (clipId, newStartTime) =>
        set((s) => applyClipMutation(s, (clips) =>
          clips.map((c) =>
            c.id === clipId ? { ...c, startTime: clampTime(newStartTime) } : c,
          ),
        )),

      trimClipStart: (clipId, newStartTime, newDuration) =>
        set((s) => applyClipMutation(s, (clips) =>
          clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  startTime: clampTime(newStartTime),
                  duration: Math.max(CLIP_MIN_DURATION, newDuration),
                }
              : c,
          ),
        )),

      trimClipEnd: (clipId, newDuration) =>
        set((s) => applyClipMutation(s, (clips) =>
          clips.map((c) =>
            c.id === clipId
              ? { ...c, duration: Math.max(CLIP_MIN_DURATION, newDuration) }
              : c,
          ),
        )),

      // ── Instant edits (push to history internally) ─────────────────────────

      splitClip: (clipId, splitTime) =>
        set((s) => {
          const source = fullClipSource(s)
          const clip = source.find((c) => c.id === clipId)
          if (!clip) return {}
          const end = clip.startTime + clip.duration
          if (splitTime <= clip.startTime + CLIP_MIN_DURATION) return {}
          if (splitTime >= end - CLIP_MIN_DURATION) return {}

          const left: Clip = {
            ...clip,
            id: `${clip.id}_L${Date.now()}`,
            duration: splitTime - clip.startTime,
          }
          const right: Clip = {
            ...clip,
            id: `${clip.id}_R${Date.now()}`,
            startTime: splitTime,
            duration: end - splitTime,
          }
          const newAll = source.filter((c) => c.id !== clipId).concat([left, right])
          const mutation = applyClipMutation(s, () => newAll)

          return {
            ...mutation,
            undoStack: pushHistoryFromMutation(
              s.undoStack,
              { clips: source, tracks: s.tracks },
              { clips: newAll, tracks: s.tracks },
              s.longFormMode,
            ),
            redoStack: [],
            lastEditAction: 'Split clip',
          }
        }),

      deleteSelectedClips: () =>
        set((s) => {
          if (s.selectedClipIds.length === 0) return {}
          const source = fullClipSource(s)
          const captionIds = source
            .filter((c) => s.selectedClipIds.includes(c.id) && c.trackId === 'captions')
            .map((c) => c.id)
          if (captionIds.length > 0) removeCaptionsByClipIds(captionIds)
          const newAll = source.filter((c) => !s.selectedClipIds.includes(c.id))
          return {
            ...applyClipMutation(s, () => newAll),
            selectedClipIds: [],
            undoStack: pushHistoryFromMutation(
              s.undoStack,
              { clips: source, tracks: s.tracks },
              { clips: newAll, tracks: s.tracks },
              s.longFormMode,
            ),
            redoStack: [],
            lastEditAction: `Deleted ${s.selectedClipIds.length} clip${s.selectedClipIds.length > 1 ? 's' : ''}`,
          }
        }),

      duplicateClip: (clipId) =>
        set((s) => {
          const source = fullClipSource(s)
          const clip = source.find((c) => c.id === clipId)
          if (!clip) return {}
          const copy: Clip = {
            ...clip,
            id: `${clipId}_dup_${Date.now()}`,
            startTime: clip.startTime + clip.duration + 0.1,
            label: `${clip.label} (copy)`,
          }

          let nextTracks = s.tracks
          if (isFamilyTrack(clip.trackId, OVERLAY_FAMILY.prefix) && clip.type === 'overlay') {
            const alloc = allocateDedicatedTrack(s.tracks, source, OVERLAY_FAMILY)
            nextTracks = alloc.tracks
            copy.trackId = alloc.trackId
            if (copy.effects) {
              copy.effects = offsetEffectsForLane(
                copy.effects,
                alloc.trackId,
                OVERLAY_FAMILY.prefix,
              )
            }
          } else if (isFamilyTrack(clip.trackId, IMAGES_FAMILY.prefix)) {
            const alloc = allocateDedicatedTrack(s.tracks, source, IMAGES_FAMILY)
            nextTracks = alloc.tracks
            copy.trackId = alloc.trackId
          }

          const newAll = [...source, copy]
          return {
            ...applyClipMutation(s, () => newAll, nextTracks),
            selectedClipIds: [copy.id],
            undoStack: pushHistoryFromMutation(
              s.undoStack,
              { clips: source, tracks: s.tracks },
              { clips: newAll, tracks: nextTracks },
              s.longFormMode,
            ),
            redoStack: [],
            lastEditAction: 'Duplicated clip',
          }
        }),

      // ── Track controls ─────────────────────────────────────────────────────

      toggleMute: (trackId) =>
        set((s) => ({
          tracks: s.tracks.map((t) =>
            t.id === trackId ? { ...t, muted: !t.muted } : t
          ),
        })),

      toggleLock: (trackId) =>
        set((s) => ({
          tracks: s.tracks.map((t) =>
            t.id === trackId ? { ...t, locked: !t.locked } : t
          ),
        })),

      toggleVisibility: (trackId) =>
        set((s) => ({
          tracks: s.tracks.map((t) =>
            t.id === trackId ? { ...t, visible: !t.visible } : t
          ),
        })),

      addMarker: (marker) =>
        set((s) => ({
          markers: [
            ...s.markers,
            {
              id: marker.id ?? `mk-${Date.now().toString(36)}`,
              time: marker.time,
              label: marker.label,
              type: marker.type ?? 'chapter',
            },
          ],
          lastEditAction: `Added chapter: ${marker.label}`,
        })),

      clearMarkers: () => set({ markers: [] }),

      setMarkers: (markers) => set({ markers }),

      updateOverlayClip: (clipId, patch) =>
        set((s) => ({
          ...applyClipMutation(s, (clips) =>
            clips.map((c) =>
              c.id === clipId
                ? { ...c, effects: { ...c.effects, ...patch } }
                : c,
            ),
          ),
          lastEditAction: 'Moved overlay',
        })),

      // ── Undo / redo ────────────────────────────────────────────────────────

      undo: () =>
        set((s) => {
          if (s.undoStack.length === 0) return {}
          const entry = s.undoStack[s.undoStack.length - 1]
          const newUndo = s.undoStack.slice(0, -1)
          const source = fullClipSource(s)
          const applied = applyHistoryEntry(
            entry,
            { clips: source, tracks: s.tracks },
            'undo',
          )
          const redoEntry: HistoryEntry = s.longFormMode && entry.kind === 'diff'
            ? entry
            : snapshotEntry(source, s.tracks)
          const windowed = s.longFormMode
            ? {
                allClips: applied.clips,
                clips: filterClipsToWindow(
                  applied.clips,
                  computeVisibleTimeWindow(
                    s.scrollX,
                    s.viewportWidthPx,
                    s.pixelsPerSecond,
                  ),
                ),
              }
            : { clips: applied.clips }
          return {
            ...windowed,
            tracks: applied.tracks,
            undoStack: newUndo,
            redoStack: [...s.redoStack, redoEntry],
            lastEditAction: null,
          }
        }),

      redo: () =>
        set((s) => {
          if (s.redoStack.length === 0) return {}
          const entry = s.redoStack[s.redoStack.length - 1]
          const newRedo = s.redoStack.slice(0, -1)
          const source = fullClipSource(s)
          const applied = applyHistoryEntry(
            entry,
            { clips: source, tracks: s.tracks },
            'redo',
          )
          const undoEntry: HistoryEntry = s.longFormMode && entry.kind === 'diff'
            ? entry
            : snapshotEntry(source, s.tracks)
          const windowed = s.longFormMode
            ? {
                allClips: applied.clips,
                clips: filterClipsToWindow(
                  applied.clips,
                  computeVisibleTimeWindow(
                    s.scrollX,
                    s.viewportWidthPx,
                    s.pixelsPerSecond,
                  ),
                ),
              }
            : { clips: applied.clips }
          return {
            ...windowed,
            tracks: applied.tracks,
            undoStack: pushToHistory(s.undoStack, undoEntry),
            redoStack: newRedo,
            lastEditAction: null,
          }
        }),

      clearLastEditAction: () => set({ lastEditAction: null }),
    }),
    {
      name: 'viraedit-timeline',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : (null as never)
      ),
      // Only persist UI preferences; clips/tracks come from API
      partialize: (s) => ({
        pixelsPerSecond: s.pixelsPerSecond,
        snapEnabled:     s.snapEnabled,
      }),
    }
  )
)
