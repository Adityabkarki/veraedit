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
import type { DirectorContentType, DirectorTimeline } from '@/types/director'

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
}

export const useDirectorStore = create<DirectorState>((set, get) => ({
  ...initial,

  reset: () => set({ ...initial }),

  setProjectContext: (projectId, useDirectorEngine) =>
    set({ projectId, useDirectorEngine }),

  loadTimeline: async (projectId) => {
    const { data, error } = await fetchDirectorTimeline(projectId)
    if (error || !data) {
      set({ compileError: error })
      return
    }
    set({
      timelineId: data.timelineId,
      timeline: data.timeline,
      version: data.version,
      hasManualOverrides: data.hasManualOverrides,
      contentType: data.contentType,
      compileError: null,
    })
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
    set({
      timelineId: data.timelineId,
      timeline: data.timeline,
      version: data.version,
      hasManualOverrides: data.hasManualOverrides,
      contentType: data.contentType,
      lastCompileLabel: contentType,
      compileError: null,
    })
    return true
  },

  applyOverride: async (projectId, action) => {
    const { data, error } = await patchDirectorTimeline(projectId, action)
    if (error || !data?.timeline) {
      set({ compileError: error ?? 'Could not apply that change.' })
      return false
    }
    set({
      timeline: data.timeline,
      hasManualOverrides: true,
      compileError: null,
    })
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
}))
