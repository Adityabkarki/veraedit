/**
 * Project Store
 *
 * Manages the list of projects on the dashboard, wired to the real backend
 * (FastAPI /api/v1/projects).
 *
 * The backend ProjectResponse is intentionally minimal:
 *   { id, user_id, name, description, content_type, editor_mode, status }
 * The dashboard UI expects a richer Project shape (title, counts, duration,
 * cost, timestamps, processing stage). We map backend → UI at the boundary
 * and default the fields the list endpoint doesn't yet provide. Real
 * counts/duration are filled in per-project once the editor loads its asset.
 *
 * updateProject is used by the WebSocket handler (EP-6.2) to push real-time
 * processing stage/progress without a refetch.
 */

import { create } from 'zustand'
import { api } from '@/lib/api'

export type ProjectStatus = 'uploading' | 'processing' | 'ready' | 'failed'

export interface Project {
  id: string
  title: string
  thumbnail_url: string | null
  status: ProjectStatus
  duration_seconds: number | null
  created_at: string
  updated_at: string
  cost_usd: number
  scenes_count: number
  suggestions_count: number
  shorts_count: number
  processing_stage: string | null
  processing_progress: number | null
  /** Editor layout mode persisted on the backend (podcast/shorts/full_editor/…) */
  editor_mode?: string
  content_type?: string
}

/** Raw shape returned by the backend (schemas/projects.py → ProjectResponse). */
interface BackendProject {
  id: string
  user_id: string
  name: string
  description: string | null
  content_type: string
  editor_mode: string
  status: 'draft' | 'processing' | 'ready' | 'error'
}

/** Map the backend ProjectStatus enum onto the UI's status union. */
function mapStatus(s: BackendProject['status']): ProjectStatus {
  switch (s) {
    case 'processing': return 'processing'
    case 'ready':      return 'ready'
    case 'error':      return 'failed'
    case 'draft':      return 'ready' // empty project — openable, awaiting upload
    default:           return 'ready'
  }
}

/**
 * The backend ContentType enum only accepts these values. The onboarding
 * wizard uses some that don't exist server-side (e.g. 'mixed'), so map any
 * unknown value to 'other' to avoid a 422 on project creation.
 */
const VALID_CONTENT_TYPES = new Set([
  'podcast', 'tutorial', 'vlog', 'shorts', 'interview', 'other',
])

export function normalizeContentType(value?: string): string {
  return value && VALID_CONTENT_TYPES.has(value) ? value : 'other'
}

/** Map a backend project onto the richer UI Project shape. */
export function mapProject(p: BackendProject): Project {
  return {
    id: p.id,
    title: p.name,
    thumbnail_url: null,
    status: mapStatus(p.status),
    duration_seconds: null,
    created_at: '',
    updated_at: '',
    cost_usd: 0,
    scenes_count: 0,
    suggestions_count: 0,
    shorts_count: 0,
    processing_stage: null,
    processing_progress: null,
    editor_mode: p.editor_mode,
    content_type: p.content_type,
  }
}

interface ProjectStore {
  projects: Project[]
  isLoading: boolean
  error: string | null

  fetchProjects: () => Promise<void>
  /** Create a project on the backend; returns the new project or null on failure. */
  createProject: (
    name: string,
    opts?: { contentType?: string; editorMode?: string; description?: string }
  ) => Promise<Project | null>
  deleteProject: (id: string) => Promise<boolean>
  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  removeProject: (id: string) => void
  clearError: () => void
}

export const useProjectStore = create<ProjectStore>()((set) => ({
  projects: [],
  isLoading: false,
  error: null,

  fetchProjects: async () => {
    set({ isLoading: true, error: null })
    // Backend returns a bare array of ProjectResponse, newest first.
    const { data, error } = await api.get<BackendProject[]>('/projects')
    if (data) {
      set({ projects: data.map(mapProject), isLoading: false })
    } else {
      set({
        error: error ?? 'Failed to load projects. Please try again.',
        isLoading: false,
      })
    }
  },

  createProject: async (name, opts = {}) => {
    set({ error: null })
    const { data, error } = await api.post<BackendProject>('/projects', {
      name,
      description: opts.description ?? null,
      content_type: normalizeContentType(opts.contentType),
      editor_mode: opts.editorMode ?? 'full_editor',
    })
    if (data) {
      const project = mapProject(data)
      set((s) => ({ projects: [project, ...s.projects] }))
      return project
    }
    set({ error: error ?? 'Could not create the project. Please try again.' })
    return null
  },

  deleteProject: async (id) => {
    const { error } = await api.delete(`/projects/${id}`)
    if (error) {
      set({ error })
      return false
    }
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
    return true
  },

  addProject: (project) =>
    set((s) => ({ projects: [project, ...s.projects] })),

  updateProject: (id, patch) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  removeProject: (id) =>
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

  clearError: () => set({ error: null }),
}))
