/**
 * Tests for lib/openStyleTransfer.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { openStyleTransfer } from '@/lib/openStyleTransfer'
import { useEditorStore, initialEditorState } from '@/stores/editorStore'
import { useUIStore, initialUIState } from '@/stores/uiStore'

beforeEach(() => {
  useEditorStore.setState({ ...initialEditorState })
  useUIStore.setState({ ...initialUIState })
})

describe('openStyleTransfer', () => {
  it('switches left panel to style tab', () => {
    openStyleTransfer()
    expect(useEditorStore.getState().activeLeftTab).toBe('style')
  })

  it('opens the sidebar', () => {
    useUIStore.setState({ sidebarOpen: false })
    openStyleTransfer()
    expect(useUIStore.getState().sidebarOpen).toBe(true)
  })
})
