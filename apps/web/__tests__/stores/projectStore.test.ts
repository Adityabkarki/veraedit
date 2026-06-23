/**
 * Tests for stores/projectStore.ts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useProjectStore } from '@/stores/projectStore'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/lib/api'
const mockGet = api.get as ReturnType<typeof vi.fn>
const mockPost = api.post as ReturnType<typeof vi.fn>
const mockDelete = api.delete as ReturnType<typeof vi.fn>

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Raw backend shape (ProjectResponse) returned by /api/v1/projects.
const backendProject = {
  id: 'p1',
  user_id: 'u1',
  name: 'Test Video',
  description: null,
  content_type: 'podcast',
  editor_mode: 'full_editor',
  status: 'ready' as const,
}

// The mapped UI Project shape produced by mapProject().
const fakeProject = {
  id: 'p1',
  title: 'Test Video',
  thumbnail_url: null,
  status: 'ready' as const,
  duration_seconds: 300,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  cost_usd: 0.042,
  scenes_count: 8,
  suggestions_count: 12,
  shorts_count: 3,
  processing_stage: null,
  processing_progress: null,
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useProjectStore.setState({ projects: [], isLoading: false, error: null })
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('projectStore — initial state', () => {
  it('projects is an empty array', () => {
    expect(useProjectStore.getState().projects).toEqual([])
  })

  it('isLoading is false', () => {
    expect(useProjectStore.getState().isLoading).toBe(false)
  })

  it('error is null', () => {
    expect(useProjectStore.getState().error).toBeNull()
  })
})

// ── fetchProjects ─────────────────────────────────────────────────────────────

describe('projectStore — fetchProjects', () => {
  it('maps the backend bare array into UI projects', async () => {
    mockGet.mockResolvedValueOnce({
      data: [backendProject],
      error: null,
      status: 200,
    })
    await useProjectStore.getState().fetchProjects()
    const projects = useProjectStore.getState().projects
    expect(projects).toHaveLength(1)
    expect(projects[0].id).toBe('p1')
    expect(projects[0].title).toBe('Test Video') // name → title
    expect(projects[0].status).toBe('ready')
    expect(projects[0].editor_mode).toBe('full_editor')
  })

  it('maps draft status to ready (openable)', async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ ...backendProject, status: 'draft' }],
      error: null,
      status: 200,
    })
    await useProjectStore.getState().fetchProjects()
    expect(useProjectStore.getState().projects[0].status).toBe('ready')
  })

  it('maps error status to failed', async () => {
    mockGet.mockResolvedValueOnce({
      data: [{ ...backendProject, status: 'error' }],
      error: null,
      status: 200,
    })
    await useProjectStore.getState().fetchProjects()
    expect(useProjectStore.getState().projects[0].status).toBe('failed')
  })

  it('isLoading=false after success', async () => {
    mockGet.mockResolvedValueOnce({ data: [], error: null, status: 200 })
    await useProjectStore.getState().fetchProjects()
    expect(useProjectStore.getState().isLoading).toBe(false)
  })

  it('sets error string on failure', async () => {
    mockGet.mockResolvedValueOnce({
      data: null,
      error: 'The server ran into a problem.',
      status: 500,
    })
    await useProjectStore.getState().fetchProjects()
    expect(useProjectStore.getState().error).toBeTruthy()
  })

  it('uses fallback error when api.error is null', async () => {
    mockGet.mockResolvedValueOnce({ data: null, error: null, status: 500 })
    await useProjectStore.getState().fetchProjects()
    expect(useProjectStore.getState().error).toBeTruthy()
    expect(useProjectStore.getState().error).not.toContain('undefined')
  })

  it('isLoading=false after failure', async () => {
    mockGet.mockResolvedValueOnce({ data: null, error: 'err', status: 500 })
    await useProjectStore.getState().fetchProjects()
    expect(useProjectStore.getState().isLoading).toBe(false)
  })

  it('handles an empty project list gracefully', async () => {
    mockGet.mockResolvedValueOnce({ data: [], error: null, status: 200 })
    await useProjectStore.getState().fetchProjects()
    expect(useProjectStore.getState().projects).toEqual([])
  })
})

// ── createProject ─────────────────────────────────────────────────────────────

describe('projectStore — createProject', () => {
  it('posts {name, content_type, editor_mode} and prepends the mapped project', async () => {
    mockPost.mockResolvedValueOnce({
      data: { ...backendProject, id: 'new1', name: 'My New Project' },
      error: null,
      status: 201,
    })
    const result = await useProjectStore.getState().createProject('My New Project', {
      contentType: 'podcast',
      editorMode: 'podcast',
    })
    expect(mockPost).toHaveBeenCalledWith('/projects', {
      name: 'My New Project',
      description: null,
      content_type: 'podcast',
      editor_mode: 'podcast',
    })
    expect(result?.title).toBe('My New Project')
    expect(useProjectStore.getState().projects[0].id).toBe('new1')
  })

  it('returns null and sets error on failure', async () => {
    mockPost.mockResolvedValueOnce({ data: null, error: 'Server error', status: 500 })
    const result = await useProjectStore.getState().createProject('X')
    expect(result).toBeNull()
    expect(useProjectStore.getState().error).toBeTruthy()
  })

  it('defaults content_type=other and editor_mode=full_editor', async () => {
    mockPost.mockResolvedValueOnce({
      data: { ...backendProject, id: 'd1' },
      error: null,
      status: 201,
    })
    await useProjectStore.getState().createProject('Defaults')
    expect(mockPost).toHaveBeenCalledWith('/projects', {
      name: 'Defaults',
      description: null,
      content_type: 'other',
      editor_mode: 'full_editor',
    })
  })

  it('normalises an invalid content_type (e.g. onboarding "mixed") to "other"', async () => {
    mockPost.mockResolvedValueOnce({
      data: { ...backendProject, id: 'm1' },
      error: null,
      status: 201,
    })
    await useProjectStore.getState().createProject('Mixed', { contentType: 'mixed' })
    expect(mockPost).toHaveBeenCalledWith(
      '/projects',
      expect.objectContaining({ content_type: 'other' }),
    )
  })

  it('passes through a valid content_type', async () => {
    mockPost.mockResolvedValueOnce({
      data: { ...backendProject, id: 'p1' },
      error: null,
      status: 201,
    })
    await useProjectStore.getState().createProject('Pod', { contentType: 'podcast' })
    expect(mockPost).toHaveBeenCalledWith(
      '/projects',
      expect.objectContaining({ content_type: 'podcast' }),
    )
  })
})

// ── deleteProject ─────────────────────────────────────────────────────────────

describe('projectStore — deleteProject', () => {
  it('removes the project on success', async () => {
    useProjectStore.setState({ projects: [fakeProject] })
    mockDelete.mockResolvedValueOnce({ data: null, error: null, status: 204 })
    const ok = await useProjectStore.getState().deleteProject('p1')
    expect(ok).toBe(true)
    expect(useProjectStore.getState().projects).toHaveLength(0)
  })

  it('keeps the project and sets error on failure', async () => {
    useProjectStore.setState({ projects: [fakeProject] })
    mockDelete.mockResolvedValueOnce({ data: null, error: 'Forbidden', status: 403 })
    const ok = await useProjectStore.getState().deleteProject('p1')
    expect(ok).toBe(false)
    expect(useProjectStore.getState().projects).toHaveLength(1)
    expect(useProjectStore.getState().error).toBe('Forbidden')
  })
})

// ── addProject ────────────────────────────────────────────────────────────────

describe('projectStore — addProject', () => {
  it('prepends the new project', () => {
    const p2 = { ...fakeProject, id: 'p2' }
    useProjectStore.setState({ projects: [p2] })
    useProjectStore.getState().addProject(fakeProject)
    expect(useProjectStore.getState().projects[0].id).toBe('p1')
  })

  it('adds to an empty list', () => {
    useProjectStore.getState().addProject(fakeProject)
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })

  it('does not affect existing projects', () => {
    const p2 = { ...fakeProject, id: 'p2' }
    useProjectStore.setState({ projects: [p2] })
    useProjectStore.getState().addProject(fakeProject)
    expect(useProjectStore.getState().projects[1].id).toBe('p2')
  })
})

// ── updateProject ─────────────────────────────────────────────────────────────

describe('projectStore — updateProject', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [fakeProject] })
  })

  it('patches title of matching project', () => {
    useProjectStore.getState().updateProject('p1', { title: 'Updated' })
    expect(useProjectStore.getState().projects[0].title).toBe('Updated')
  })

  it('patches processing_progress', () => {
    useProjectStore.getState().updateProject('p1', { processing_progress: 75 })
    expect(useProjectStore.getState().projects[0].processing_progress).toBe(75)
  })

  it('patches status', () => {
    useProjectStore.getState().updateProject('p1', { status: 'processing' })
    expect(useProjectStore.getState().projects[0].status).toBe('processing')
  })

  it('does not affect sibling projects', () => {
    const p2 = { ...fakeProject, id: 'p2', title: 'Sibling' }
    useProjectStore.setState({ projects: [fakeProject, p2] })
    useProjectStore.getState().updateProject('p1', { title: 'Changed' })
    expect(useProjectStore.getState().projects[1].title).toBe('Sibling')
  })

  it('no-ops for unknown id', () => {
    useProjectStore.getState().updateProject('unknown', { title: 'X' })
    expect(useProjectStore.getState().projects[0].title).toBe('Test Video')
  })
})

// ── removeProject ─────────────────────────────────────────────────────────────

describe('projectStore — removeProject', () => {
  it('removes the matching project', () => {
    useProjectStore.setState({ projects: [fakeProject] })
    useProjectStore.getState().removeProject('p1')
    expect(useProjectStore.getState().projects).toHaveLength(0)
  })

  it('leaves sibling projects intact', () => {
    const p2 = { ...fakeProject, id: 'p2' }
    useProjectStore.setState({ projects: [fakeProject, p2] })
    useProjectStore.getState().removeProject('p1')
    expect(useProjectStore.getState().projects[0].id).toBe('p2')
  })

  it('no-ops for unknown id', () => {
    useProjectStore.setState({ projects: [fakeProject] })
    useProjectStore.getState().removeProject('does-not-exist')
    expect(useProjectStore.getState().projects).toHaveLength(1)
  })
})

// ── clearError ────────────────────────────────────────────────────────────────

describe('projectStore — clearError', () => {
  it('sets error to null', () => {
    useProjectStore.setState({ error: 'something went wrong' })
    useProjectStore.getState().clearError()
    expect(useProjectStore.getState().error).toBeNull()
  })

  it('no-ops when error is already null', () => {
    expect(() => useProjectStore.getState().clearError()).not.toThrow()
  })
})
