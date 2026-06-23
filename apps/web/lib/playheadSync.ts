/**
 * Keep timeline playhead and video player time in sync.
 */

import { usePlayerStore } from '@/stores/playerStore'
import { useTimelineStore } from '@/stores/timelineStore'

export function setSyncedPlayhead(seconds: number): void {
  const t = Math.max(0, seconds)
  useTimelineStore.getState().setPlayheadTime(t)
  usePlayerStore.getState().seek(t)
}

export function stepSyncedPlayhead(deltaSeconds: number): void {
  const { playheadTime } = useTimelineStore.getState()
  setSyncedPlayhead(playheadTime + deltaSeconds)
}
