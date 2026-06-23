/**
 * Open the Style Transfer panel in the left sidebar.
 */

import { useEditorStore } from '@/stores/editorStore'
import { useUIStore } from '@/stores/uiStore'

export function openStyleTransfer() {
  useEditorStore.getState().setActiveLeftTab('style')
  useUIStore.setState({ sidebarOpen: true })
}
