/**
 * Convenience wrapper — prefer over useTimelineStore.setState({ clips }).
 */
import { useTimelineStore } from '@/stores/timelineStore'
import type { Clip, Track } from '@/stores/timelineStore'

export function commitTimelineClips(
  mutator: (clips: Clip[]) => Clip[],
  options?: {
    tracks?: Track[]
    lastEditAction?: string
    selectedClipIds?: string[]
    recordUndo?: boolean
  },
): void {
  useTimelineStore.getState().commitClipsUpdate(mutator, options)
}

export function getFullTimelineClips(): Clip[] {
  return useTimelineStore.getState().getFullClips()
}

export function replaceTimelineClips(
  clips: Clip[],
  options?: {
    tracks?: Track[]
    lastEditAction?: string
    selectedClipIds?: string[]
    recordUndo?: boolean
  },
): void {
  commitTimelineClips(() => clips, options)
}
