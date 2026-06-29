/**
 * Open the Style Transfer panel in the right panel.
 */

import { useUIStore } from '@/stores/uiStore'

export function openStyleTransfer() {
  const { aiPanelOpen, setRightPanelMode, toggleAIPanel } = useUIStore.getState()
  setRightPanelMode('style')
  if (!aiPanelOpen) toggleAIPanel()
}
