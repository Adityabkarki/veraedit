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
  it('sets the right panel mode to style', () => {
    openStyleTransfer()
    expect(useUIStore.getState().rightPanelMode).toBe('style')
  })

  it('opens the AI panel when closed', () => {
    useUIStore.setState({ aiPanelOpen: false })
    openStyleTransfer()
    expect(useUIStore.getState().aiPanelOpen).toBe(true)
  })
})
