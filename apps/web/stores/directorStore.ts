/**
 * Director Engine — compiled timeline state for preview and override UI.
 */

import { create } from 'zustand'
import {
  compileDirectorTimeline,
  enableDirectorEngine,
  fetchDirectorTimeline,
  patchDirectorTimeline,
  type DirectorOverrideAction,
} from '@/lib/directorApi'
import { fetchDirectorTimelineWindow } from '@/lib/directorTimelineWindow'
import {
  mergeDirectorTimelineWindowSlice,
  shouldUseDirectorWindowing,
  trimDirectorTimelineToFrameWindow,
} from '@/lib/directorTimelineWindowing'
import type { DirectorContentType, DirectorTimeline } from '@/types/director'
import { useTimelineStore } from '@/stores/timelineStore'

interface DirectorState {
  projectId: string | null
  useDirectorEngine: boolean
  timelineId: string | null
  timeline: DirectorTimeline | null
  version: number
  hasManualOverrides: boolean
  contentType: DirectorContentType | null
  compiling: boolean
  compileError: string | null
  lastCompileLabel: string | null
  directorWindowing: boolean

  reset: () => void
  setProjectContext: (projectId: string, useDirectorEngine: boolean) => void
  loadTimeline: (projectId: string) => Promise<void>
  runAutoEdit: (
    projectId: string,
    contentType: DirectorContentType,
    options?: { overwrite?: boolean; assetId?: string },
  ) => Promise<boolean>
  applyOverride: (projectId: string, action: DirectorOverrideAction) => Promise<boolean>
  enableEngine: (projectId: string) => Promise<boolean>
  mergeWindowTracks: (partial: DirectorTimeline) => void
  applyWindowSlice: (
    partial: DirectorTimeline,
    startFrame: number,
    endFrame: number,
  ) => void
  hydrateInitialWindow: (timelineId: string, fps: number) => Promise<void>
}

const initial = {
  projectId: null as string | null,
  useDirectorEngine: false,
  timelineId: null as string | null,
  timeline: null as DirectorTimeline | null,
  version: 0,
  hasManualOverrides: false,
  contentType: null as DirectorContentType | null,
  compiling: false,
  compileError: null as string | null,
  lastCompileLabel: null as string | null,
  directorWindowing: false,
}

function adoptDirectorTimeline(
  timeline: DirectorTimeline,
  timelineId: string | null,
  extras: Partial<DirectorState>,
): Partial<DirectorState> {
  const windowing = shouldUseDirectorWindowing(timeline)
  if (!windowing) {
    return {
      timeline,
      timelineId,
      directorWindowing: false,
      ...extras,
    }
  }
  const fps = timeline.fps || 30
  const prefetch = 30 * fps
  return {
    timeline: trimDirectorTimelineToFrameWindow(timeline, 0, prefetch * 2),
    timelineId,
    directorWindowing: true,
    ...extras,
  }
}

export const useDirectorStore = create<DirectorState>((set, get) => ({
  ...initial,

  reset: () => set({ ...initial }),

  setProjectContext: (projectId, useDirectorEngine) =>
    set({ projectId, useDirectorEngine }),

  hydrateInitialWindow: async (timelineId, fps) => {
    const prefetch = 30 * fps
    const { data } = await fetchDirectorTimelineWindow(
      timelineId,
      0,
      prefetch * 2,
    )
    if (!data?.timeline) return
    set((s) => {
      if (!s.timeline) return {}
      return {
        timeline: mergeDirectorTimelineWindowSlice(
          s.timeline,
          data.timeline as DirectorTimeline,
          0,
          prefetch * 2,
        ),
      }
    })
  },

  loadTimeline: async (projectId) => {
    const { data, error } = await fetchDirectorTimeline(projectId)
    if (error || !data) {
      set({ compileError: error })
      return
    }
    if (!data.timeline) {
      set({
        timelineId: data.timelineId,
        timeline: null,
        version: data.version,
        hasManualOverrides: data.hasManualOverrides,
        contentType: data.contentType,
        compileError: null,
      })
      useTimelineStore.getState().setDirectorTimelineId(data.timelineId)
      return
    }
    const adopted = adoptDirectorTimeline(data.timeline, data.timelineId, {
      version: data.version,
      hasManualOverrides: data.hasManualOverrides,
      contentType: data.contentType,
      compileError: null,
    })
    set(adopted)
    useTimelineStore.getState().setDirectorTimelineId(data.timelineId)
    if (adopted.directorWindowing && data.timelineId) {
      await get().hydrateInitialWindow(data.timelineId, data.timeline.fps)
    }
  },

  runAutoEdit: async (projectId, contentType, options) => {
    set({ compiling: true, compileError: null })
    const { data, error, status } = await compileDirectorTimeline(projectId, contentType, options)
    set({ compiling: false })
    if (error || !data) {
      const msg =
        status === 409
          ? 'Manual edits exist on this timeline. Enable overwrite or adjust entries in the log below.'
          : error ?? 'Auto Edit failed. Try again after transcription finishes.'
      set({ compileError: msg })
      return false
    }
    const adopted = adoptDirectorTimeline(data.timeline, data.timelineId, {
      version: data.version,
      hasManualOverrides: data.hasManualOverrides,
      contentType: data.contentType,
      lastCompileLabel: contentType,
      compileError: null,
    })
    set(adopted)
    useTimelineStore.getState().setDirectorTimelineId(data.timelineId)
    if (adopted.directorWindowing) {
      await get().hydrateInitialWindow(data.timelineId, data.timeline.fps)
    }
    return true
  },

  applyOverride: async (projectId, action) => {
    const { data, error } = await patchDirectorTimeline(projectId, action)
    if (error || !data?.timeline) {
      set({ compileError: error ?? 'Could not apply that change.' })
      return false
    }
    const adopted = adoptDirectorTimeline(
      data.timeline,
      get().timelineId,
      { hasManualOverrides: true, compileError: null },
    )
    set(adopted)
    return true
  },

  enableEngine: async (projectId) => {
    const { ok, error } = await enableDirectorEngine(projectId)
    if (!ok) {
      set({ compileError: error ?? 'Could not enable Director Engine.' })
      return false
    }
    set({ useDirectorEngine: true, compileError: null })
    return true
  },

  mergeWindowTracks: (partial) =>
    set((s) => {
      if (!s.timeline) return {}
      const mergedTracks = { ...s.timeline.tracks }
      for (const key of Object.keys(partial.tracks ?? {}) as Array<
        keyof DirectorTimeline['tracks']
      >) {
        const incoming = partial.tracks[key]
        if (!Array.isArray(incoming)) continue
        const existing = [...(mergedTracks[key] as Array<{ id?: string }>)]
        const byId = new Map(
          existing.filter((e) => e.id).map((e) => [String(e.id), e]),
        )
        for (const entry of incoming) {
          if (entry && typeof entry === 'object' && 'id' in entry) {
            byId.set(String((entry as { id: string }).id), entry)
          }
        }
        mergedTracks[key] = Array.from(byId.values()) as never
      }
      return {
        timeline: {
          ...s.timeline,
          tracks: mergedTracks,
        },
      }
    }),

  applyWindowSlice: (partial, startFrame, endFrame) =>
    set((s) => {
      if (!s.timeline) return {}
      return {
        timeline: mergeDirectorTimelineWindowSlice(
          s.timeline,
          partial,
          startFrame,
          endFrame,
        ),
      }
    }),
}))
