/**
 * Auto-edit review state — tracks podcast autopilot snapshot for Accept / Revert.
 */

import { create } from 'zustand'
import type { Clip, Track, TimelineMarker } from '@/stores/timelineStore'

interface AutopilotSnapshot {
  clips: Clip[]
  tracks: Track[]
  markers: TimelineMarker[]
}

interface AutoEditState {
  appliedForProject: string | null
  editCount: number
  snapshot: AutopilotSnapshot | null
  pendingReview: boolean

  markApplied: (projectId: string, snapshot: AutopilotSnapshot, count: number) => void
  clearApplied: () => void
}

export const useAutoEditStore = create<AutoEditState>((set) => ({
  appliedForProject: null,
  editCount: 0,
  snapshot: null,
  pendingReview: false,

  markApplied: (projectId, snapshot, count) =>
    set({
      appliedForProject: projectId,
      editCount: count,
      snapshot,
      pendingReview: true,
    }),

  clearApplied: () =>
    set({
      appliedForProject: null,
      editCount: 0,
      snapshot: null,
      pendingReview: false,
    }),
}))
