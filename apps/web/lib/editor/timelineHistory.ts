/**
 * Diff-based undo/redo for long-form timelines (Phase 15).
 */
import type { Clip, Track } from '@/stores/timelineStore'

export interface ClipMutation {
  id: string
  before: Clip
  after: Clip
}

export interface TimelinePatch {
  added: Clip[]
  removed: Clip[]
  updated: ClipMutation[]
  tracksBefore?: Track[]
  tracksAfter?: Track[]
}

export interface DiffHistoryEntry {
  kind: 'diff'
  patch: TimelinePatch
}

export interface SnapshotHistoryEntry {
  kind: 'snapshot'
  clips: Clip[]
  tracks: Track[]
}

export type HistoryEntry = DiffHistoryEntry | SnapshotHistoryEntry

export function computeTimelinePatch(
  before: Clip[],
  after: Clip[],
  tracksBefore?: Track[],
  tracksAfter?: Track[],
): TimelinePatch {
  const beforeMap = new Map(before.map((c) => [c.id, c]))
  const afterMap = new Map(after.map((c) => [c.id, c]))

  const added = after.filter((c) => !beforeMap.has(c.id))
  const removed = before.filter((c) => !afterMap.has(c.id))
  const updated: ClipMutation[] = []

  for (const clip of after) {
    const prev = beforeMap.get(clip.id)
    if (!prev) continue
    if (JSON.stringify(prev) !== JSON.stringify(clip)) {
      updated.push({ id: clip.id, before: prev, after: clip })
    }
  }

  return {
    added,
    removed,
    updated,
    tracksBefore,
    tracksAfter,
  }
}

export function applyTimelinePatch(
  clips: Clip[],
  tracks: Track[],
  patch: TimelinePatch,
  direction: 'forward' | 'inverse',
): { clips: Clip[]; tracks: Track[] } {
  let nextClips = [...clips]
  let nextTracks = [...tracks]

  if (direction === 'forward') {
    const removeIds = new Set(patch.removed.map((c) => c.id))
    nextClips = nextClips.filter((c) => !removeIds.has(c.id))
    for (const u of patch.updated) nextClips = nextClips.map((c) => (c.id === u.id ? u.after : c))
    nextClips = [...nextClips, ...patch.added]
    if (patch.tracksAfter) nextTracks = patch.tracksAfter.map((t) => ({ ...t }))
  } else {
    const removeIds = new Set(patch.added.map((c) => c.id))
    nextClips = nextClips.filter((c) => !removeIds.has(c.id))
    for (const u of patch.updated) nextClips = nextClips.map((c) => (c.id === u.id ? u.before : c))
    nextClips = [...nextClips, ...patch.removed]
    if (patch.tracksBefore) nextTracks = patch.tracksBefore.map((t) => ({ ...t }))
  }

  return { clips: nextClips, tracks: nextTracks }
}

export function isEmptyPatch(patch: TimelinePatch): boolean {
  return (
    patch.added.length === 0 &&
    patch.removed.length === 0 &&
    patch.updated.length === 0 &&
    !patch.tracksBefore &&
    !patch.tracksAfter
  )
}
