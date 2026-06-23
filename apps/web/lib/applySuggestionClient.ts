/**
 * Client-side suggestion application — mirrors backend suggestion_apply.py
 * for instant editor feedback before/after the API round-trip.
 */

import type { Clip, Track } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useCaptionsStore } from '@/stores/captionsStore'
import { syncAllOverlaysFromTimeline } from '@/lib/visualTimelineSync'
import { syncCaptionsToTimeline } from '@/lib/captionTimelineSync'
import {
  allocateDedicatedTrack,
  OVERLAY_FAMILY,
  offsetEffectsForLane,
} from '@/lib/timelineLayers'

export interface SuggestionAction {
  action?: string
  type?: string
  visual_type?: string
  start?: number
  end?: number
  start_time?: number
  end_time?: number
  filler_cuts?: { start: number; end: number }[]
  display_value?: string
  suggested_visual?: string
  nepali_label?: string
  duration_seconds?: number
  hook_text?: string
  cut_type?: string
  operation?: string
  spans?: { start: number; end: number }[]
  label?: string
  x_pct?: number
  y_pct?: number
  duration?: number
}

function resolveActionType(action: SuggestionAction, suggestionType?: string): string {
  const op = String(action.operation ?? '').toLowerCase()
  if (op) return op

  const t =
    action.action ||
    action.type ||
    action.visual_type ||
    suggestionType ||
    ''
  const lower = String(t).toLowerCase()
  if (lower) return lower
  if (action.filler_cuts?.length) return 'remove_filler'
  if (action.cut_type) return 'transition'
  if (
    (action.start != null && action.end != null) ||
    (action.start_time != null && action.end_time != null)
  ) {
    return 'cut'
  }
  return ''
}

function removeRangeFromClips(
  clips: Clip[],
  start: number,
  end: number,
): Clip[] {
  const cutDur = end - start
  if (cutDur <= 0) return clips

  const result: Clip[] = []
  for (const clip of clips) {
    const cStart = clip.startTime
    const cEnd = clip.startTime + clip.duration

    if (cEnd <= start || cStart >= end) {
      const shifted =
        cStart >= end
          ? {
              ...clip,
              startTime: cStart - cutDur,
              sourceStart: clip.sourceStart,
              sourceEnd: clip.sourceEnd,
            }
          : clip
      result.push(shifted)
      continue
    }

    if (cStart >= start && cEnd <= end) continue

    if (cStart < start && cEnd > end) {
      const srcStart = clip.sourceStart ?? cStart
      const srcEnd = clip.sourceEnd ?? cEnd
      const overlap = end - start
      result.push({
        ...clip,
        duration: cEnd - cStart - overlap,
        sourceEnd: srcEnd - overlap,
      })
      continue
    }

    if (cStart < start && cEnd > start && cEnd <= end) {
      result.push({
        ...clip,
        duration: start - cStart,
        sourceEnd: (clip.sourceStart ?? cStart) + (start - cStart),
      })
      continue
    }

    if (cStart >= start && cStart < end && cEnd > end) {
      const trim = end - cStart
      result.push({
        ...clip,
        startTime: start,
        duration: cEnd - end,
        sourceStart: (clip.sourceStart ?? cStart) + trim,
      })
      continue
    }
  }
  return result
}

function ensureOverlayTrack(tracks: Track[]): Track[] {
  if (tracks.some((t) => t.id === 'overlay')) return tracks
  return [
    ...tracks,
    {
      id: 'overlay',
      label: 'Visuals',
      color: '#EC4899',
      muted: false,
      locked: false,
      visible: true,
    },
  ]
}

function addVisualOverlay(
  clips: Clip[],
  tracks: Track[],
  action: SuggestionAction,
): { clips: Clip[]; tracks: Track[] } {
  const start = action.start_time ?? action.start ?? 0
  const end = action.end_time ?? action.end ?? start + (action.duration ?? 3)
  const visualType = action.visual_type || action.type || 'statistic'
  const displayValue = action.display_value || action.nepali_label || action.label || ''
  const id = `ovl-${Date.now().toString(36)}`

  const overlayClip: Clip = {
    id,
    trackId: 'overlay',
    startTime: start,
    duration: Math.max(0.5, end - start),
    label: `${visualType}: ${displayValue}`.slice(0, 40),
    type: 'overlay',
    effects: {
      visualType,
      displayValue,
      suggestedVisual: action.suggested_visual || 'animated_graphic',
      nepaliLabel: action.nepali_label || displayValue,
      xPct: action.x_pct ?? 50,
      yPct: action.y_pct ?? 50,
      scale: 1,
      overlayMode: 'corner',
    },
  }

  const { tracks: nextTracks, trackId } = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
  overlayClip.trackId = trackId
  if (overlayClip.effects) {
    overlayClip.effects = offsetEffectsForLane(
      overlayClip.effects,
      trackId,
      OVERLAY_FAMILY.prefix,
    ) as typeof overlayClip.effects
  }

  return {
    tracks: nextTracks,
    clips: [...clips, overlayClip],
  }
}

/** Apply a suggestion action to the in-memory timeline store. */
export function applySuggestionToEditor(
  action: SuggestionAction,
  suggestionType?: string,
): boolean {
  const actionType = resolveActionType(action, suggestionType)
  if (!actionType) return false

  const { tracks, clips, setPlayheadTime, addMarker } = useTimelineStore.getState()
  let nextTracks = [...tracks]
  let nextClips = [...clips]

  switch (actionType) {
    case 'cut': {
      const start = action.start ?? action.start_time ?? 0
      const end = action.end ?? action.end_time ?? 0
      if (end <= start) return false
      nextClips = removeRangeFromClips(
        nextClips.filter((c) => c.trackId === 'video' || c.trackId === 'audio'),
        start,
        end,
      )
      const other = clips.filter((c) => c.trackId !== 'video' && c.trackId !== 'audio')
      nextClips = [...nextClips, ...other]
      break
    }
    case 'remove_filler':
    case 'remove_fillers': {
      const ranges = action.filler_cuts ?? action.spans ?? []
      for (const fc of ranges) {
        const st = fc.start
        const en = fc.end
        if (en > st) {
          nextClips = removeRangeFromClips(
            nextClips.filter((c) => c.trackId === 'video' || c.trackId === 'audio'),
            st,
            en,
          )
        }
      }
      const other = clips.filter((c) => c.trackId !== 'video' && c.trackId !== 'audio')
      nextClips = [...nextClips, ...other]
      break
    }
    case 'trim_silence': {
      const ranges = action.spans ?? []
      for (const span of ranges) {
        if (span.end > span.start) {
          nextClips = removeRangeFromClips(
            nextClips.filter((c) => c.trackId === 'video' || c.trackId === 'audio'),
            span.start,
            span.end,
          )
        }
      }
      const otherSilence = clips.filter((c) => c.trackId !== 'video' && c.trackId !== 'audio')
      nextClips = [...nextClips, ...otherSilence]
      break
    }
    case 'add_chapter_marker': {
      const time = action.start_time ?? action.start ?? 0
      addMarker({
        time,
        label: action.label || 'Chapter',
        type: 'chapter',
      })
      break
    }
    case 'add_speaker_overlay':
    case 'add_overlay':
    case 'visual_opportunity':
    case 'statistic':
    case 'large_number':
    case 'list_item':
    case 'comparison':
    case 'cta':
    case 'key_term':
    case 'hook_rewrite': {
      const merged = addVisualOverlay(nextClips, nextTracks, {
        ...action,
        visual_type:
          actionType === 'add_speaker_overlay' || actionType === 'add_overlay'
            ? (action.visual_type || 'key_term')
            : actionType === 'hook_rewrite'
              ? 'hook_rewrite'
              : action.visual_type || actionType,
        start_time: actionType === 'hook_rewrite' ? 0 : action.start_time,
        end_time: actionType === 'hook_rewrite' ? 3 : action.end_time,
        display_value: action.display_value || action.hook_text || action.label || '',
      })
      nextClips = merged.clips
      nextTracks = merged.tracks
      break
    }
    case 'caption':
    case 'add_captions': {
      nextTracks = nextTracks.map((t) =>
        t.id === 'captions' ? { ...t, visible: true, muted: false } : t,
      )
      useCaptionsStore.getState().applyPreset('nepali-bold')
      syncCaptionsToTimeline(useCaptionsStore.getState().captions, {
        actionLabel: 'AI captions applied',
      })
      break
    }
    default:
      return false
  }

  useTimelineStore.setState({
    tracks: nextTracks,
    clips: nextClips,
    lastEditAction: 'AI suggestion applied',
  })

  const start = action.start_time ?? action.start
  if (start != null && start >= 0) setPlayheadTime(start)

  return true
}

/** Sync visual overlay clips into the brand/template panel for editing. */
export function syncOverlaysToVisualLibrary(clips: Clip[]) {
  syncAllOverlaysFromTimeline(clips)
}

/** Apply cut ranges to video + audio tracks (e.g. transcript filler removal). */
export function applyAvCutsFromRanges(
  ranges: { start: number; end: number }[],
  actionLabel = 'Transcript cuts applied',
): number {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .sort((a, b) => b.start - a.start)
  if (sorted.length === 0) return 0

  const { clips, tracks, beginEdit, endEdit } = useTimelineStore.getState()
  beginEdit()
  let next = [...clips]
  for (const { start, end } of sorted) {
    const av = next.filter((c) => c.trackId === 'video' || c.trackId === 'audio')
    const other = next.filter((c) => c.trackId !== 'video' && c.trackId !== 'audio')
    next = [...removeRangeFromClips(av, start, end), ...other]
  }
  useTimelineStore.setState({ clips: next, tracks: [...tracks] })
  endEdit(actionLabel)
  return sorted.length
}
