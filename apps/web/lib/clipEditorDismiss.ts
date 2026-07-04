/**
 * Dismiss timeline strip editors and right-panel clip editors consistently.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { useEffectsStore } from '@/stores/effectsStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'

const RIGHT_CLIP_PANEL_MODES = new Set(['image', 'broll', 'camera', 'overlay-element', 'keyframes', 'motion-graphic'])

/** Close timeline strip editors (overlay, image, B-roll, caption FX, camera, effects). */
export function dismissTimelineClipPanel(): void {
  useTimelineStore.getState().clearSelection()
  useEffectsStore.getState().stopEditingEffect()
  useVisualLibraryStore.getState().stopEditOverlay()
}

/** Close right-panel clip editors and timeline selection. */
export function dismissClipEditorPanel(): void {
  const ui = useUIStore.getState()
  if (RIGHT_CLIP_PANEL_MODES.has(ui.rightPanelMode)) {
    ui.setRightPanelMode('ai')
  }
  dismissTimelineClipPanel()
}
