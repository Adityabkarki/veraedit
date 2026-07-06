import { describe, expect, it } from 'vitest'
import { projectUsesDirectorEngine } from '@/lib/directorApi'
import { triggerLabel } from '@/types/director'

describe('directorApi', () => {
  it('detects useDirectorEngine in project settings', () => {
    expect(projectUsesDirectorEngine({ useDirectorEngine: true })).toBe(true)
    expect(projectUsesDirectorEngine({ use_director_engine: true })).toBe(true)
    expect(projectUsesDirectorEngine({})).toBe(false)
    expect(projectUsesDirectorEngine(null)).toBe(false)
  })
})

describe('director types', () => {
  it('formats trigger labels for display', () => {
    expect(triggerLabel('stat_mention')).toBe('stat mention')
    expect(triggerLabel('speaker_change')).toBe('speaker change')
  })
})
