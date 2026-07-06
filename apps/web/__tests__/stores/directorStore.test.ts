import { describe, expect, it, beforeEach } from 'vitest'
import { useDirectorStore } from '@/stores/directorStore'

describe('directorStore', () => {
  beforeEach(() => {
    useDirectorStore.getState().reset()
  })

  it('tracks project context and engine flag', () => {
    useDirectorStore.getState().setProjectContext('proj-1', true)
    expect(useDirectorStore.getState().projectId).toBe('proj-1')
    expect(useDirectorStore.getState().useDirectorEngine).toBe(true)
  })

  it('resets to initial state', () => {
    useDirectorStore.getState().setProjectContext('proj-1', true)
    useDirectorStore.getState().reset()
    expect(useDirectorStore.getState().projectId).toBeNull()
    expect(useDirectorStore.getState().timeline).toBeNull()
  })
})
