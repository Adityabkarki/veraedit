import { describe, it, expect, beforeEach } from 'vitest'
import {
  dismissClipEditorPanel,
  dismissTimelineClipPanel,
} from '@/lib/clipEditorDismiss'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { useEffectsStore } from '@/stores/effectsStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'

beforeEach(() => {
  useTimelineStore.getState().resetTimeline()
  useTimelineStore.getState().loadDemoData()
  useTimelineStore.getState().selectClip('clip-1')
  useUIStore.setState({ rightPanelMode: 'image', aiPanelOpen: true })
  useEffectsStore.setState({ editingEffectClipId: 'fx-1' })
  useVisualLibraryStore.setState({ editingOverlayId: 'ov-1' })
})

describe('clipEditorDismiss', () => {
  it('dismissTimelineClipPanel clears selection and editing state', () => {
    dismissTimelineClipPanel()
    expect(useTimelineStore.getState().selectedClipIds).toEqual([])
    expect(useEffectsStore.getState().editingEffectClipId).toBeNull()
    expect(useVisualLibraryStore.getState().editingOverlayId).toBeNull()
  })

  it('dismissClipEditorPanel also resets right panel mode', () => {
    dismissClipEditorPanel()
    expect(useUIStore.getState().rightPanelMode).toBe('ai')
    expect(useTimelineStore.getState().selectedClipIds).toEqual([])
  })
})
