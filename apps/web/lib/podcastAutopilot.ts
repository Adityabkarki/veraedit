/**
 * Podcast auto-edit — applies safe autopilot suggestions to the timeline
 * after analysis completes (filler trim, silence cuts, chapters, speaker cards).
 */

import type { ApiSuggestion } from '@/stores/suggestionsStore'
import { applySuggestionToEditor, type SuggestionAction } from '@/lib/applySuggestionClient'
import { syncOverlaysToVisualLibrary } from '@/lib/applySuggestionClient'
import { useTimelineStore, type Clip, type Track, type TimelineMarker } from '@/stores/timelineStore'
import { getFullTimelineClips, replaceTimelineClips } from '@/lib/editor/timelineClipUpdates'
import { useAutoEditStore } from '@/stores/autoEditStore'

const PODCAST_TYPES = new Set(['podcast', 'video_podcast', 'interview'])

function isPodcastContentType(contentType: string | undefined): boolean {
  return PODCAST_TYPES.has((contentType || '').toLowerCase())
}

function isAutopilotSuggestion(s: ApiSuggestion): boolean {
  const src = String((s.action as Record<string, unknown> | undefined)?.source ?? '')
  return src === 'podcast_autopilot'
}

function isSafeAutopilot(s: ApiSuggestion): boolean {
  const op = String((s.action as Record<string, unknown> | undefined)?.operation ?? s.type ?? '').toLowerCase()
  return [
    'remove_fillers',
    'trim_silence',
    'add_chapter_marker',
    'add_speaker_overlay',
  ].includes(op) || ['remove_fillers', 'trim_silence', 'add_overlay'].includes(s.type.toLowerCase())
}

/** Apply podcast autopilot edits once per project load. */
export function applyPodcastAutopilotIfNeeded(
  projectId: string,
  contentType: string | undefined,
  assetStatus: string | undefined,
  suggestions: ApiSuggestion[],
): { applied: boolean; count: number } {
  if (assetStatus?.toLowerCase() !== 'ready') return { applied: false, count: 0 }
  if (!isPodcastContentType(contentType)) return { applied: false, count: 0 }

  const store = useAutoEditStore.getState()
  if (store.appliedForProject === projectId) return { applied: false, count: 0 }

  const autopilot = suggestions.filter(isAutopilotSuggestion).filter(isSafeAutopilot)
  if (autopilot.length === 0) return { applied: false, count: 0 }

  const snapshot = {
    clips: getFullTimelineClips().map((c) => ({ ...c })),
    tracks: useTimelineStore.getState().tracks.map((t) => ({ ...t })),
    markers: useTimelineStore.getState().markers.map((m) => ({ ...m })),
  }

  let applied = 0
  for (const sug of autopilot) {
    const ok = applySuggestionToEditor(
      (sug.action ?? {}) as SuggestionAction,
      sug.type,
    )
    if (ok) applied += 1
  }

  if (applied === 0) return { applied: false, count: 0 }

  syncOverlaysToVisualLibrary(getFullTimelineClips())
  store.markApplied(projectId, snapshot, applied)
  return { applied: true, count: applied }
}

/** Revert autopilot timeline edits. */
export function revertPodcastAutopilot(): boolean {
  const store = useAutoEditStore.getState()
  const snap = store.snapshot
  if (!snap) return false

  replaceTimelineClips(snap.clips as Clip[], {
    tracks: snap.tracks as Track[],
    lastEditAction: 'Reverted auto-edits',
  })
  useTimelineStore.setState({ markers: snap.markers as TimelineMarker[] })
  store.clearApplied()
  return true
}

/** Accept autopilot edits (dismiss review banner). */
export function acceptPodcastAutopilot(): void {
  useAutoEditStore.getState().clearApplied()
}
