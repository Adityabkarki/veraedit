/**
 * Tests for stores/uiStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore, initialUIState } from '@/stores/uiStore'

beforeEach(() => {
  useUIStore.setState({ ...initialUIState, shortcutsOpen: false })
  localStorage.clear()
})

describe('uiStore — initial state', () => {
  it('sidebarOpen defaults to true', () => {
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })

  it('aiPanelOpen defaults to true', () => {
    expect(useUIStore.getState().aiPanelOpen).toBe(true)
  })

  it('shortcutsOpen defaults to false', () => {
    expect(useUIStore.getState().shortcutsOpen).toBe(false)
  })
})

describe('uiStore — toggleSidebar', () => {
  it('flips sidebarOpen from true to false', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarOpen).toBe(false)
  })

  it('flips sidebarOpen back to true on second call', () => {
    useUIStore.getState().toggleSidebar()
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })

  it('does not affect aiPanelOpen', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().aiPanelOpen).toBe(true)
  })
})

describe('uiStore — toggleAIPanel', () => {
  it('flips aiPanelOpen from true to false', () => {
    useUIStore.getState().toggleAIPanel()
    expect(useUIStore.getState().aiPanelOpen).toBe(false)
  })

  it('flips aiPanelOpen back on second call', () => {
    useUIStore.getState().toggleAIPanel()
    useUIStore.getState().toggleAIPanel()
    expect(useUIStore.getState().aiPanelOpen).toBe(true)
  })

  it('does not affect sidebarOpen', () => {
    useUIStore.getState().toggleAIPanel()
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })
})

describe('uiStore — shortcuts modal', () => {
  it('openShortcuts sets shortcutsOpen to true', () => {
    useUIStore.getState().openShortcuts()
    expect(useUIStore.getState().shortcutsOpen).toBe(true)
  })

  it('closeShortcuts sets shortcutsOpen to false', () => {
    useUIStore.setState({ shortcutsOpen: true })
    useUIStore.getState().closeShortcuts()
    expect(useUIStore.getState().shortcutsOpen).toBe(false)
  })

  it('openShortcuts then closeShortcuts returns to false', () => {
    useUIStore.getState().openShortcuts()
    useUIStore.getState().closeShortcuts()
    expect(useUIStore.getState().shortcutsOpen).toBe(false)
  })

  it('closeShortcuts is a no-op when already closed', () => {
    expect(() => useUIStore.getState().closeShortcuts()).not.toThrow()
    expect(useUIStore.getState().shortcutsOpen).toBe(false)
  })
})
