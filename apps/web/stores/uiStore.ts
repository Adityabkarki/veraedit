/**
 * UI Store — Zustand
 *
 * Global UI state: panel visibility, keyboard shortcut modal,
 * right-panel mode (AI suggestions vs Caption Editor).
 * Persisted to localStorage so panel layout survives page reloads.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type RightPanelMode = 'ai' | 'captions' | 'producer' | 'effects' | 'style' | 'broll' | 'image' | 'camera' | 'overlay-element' | 'keyframes' | 'ai-broll' | 'motion-graphic'

export interface UIState {
  /** Left media/scenes panel open */
  sidebarOpen:     boolean
  /** Right panel open */
  aiPanelOpen:     boolean
  /** Which content the right panel shows */
  rightPanelMode:  RightPanelMode
  /** Keyboard shortcuts modal open */
  shortcutsOpen:   boolean

  toggleSidebar:      () => void
  toggleAIPanel:      () => void
  setRightPanelMode:  (mode: RightPanelMode) => void
  openShortcuts:      () => void
  closeShortcuts:     () => void
}

export const initialUIState = {
  sidebarOpen:    true,
  aiPanelOpen:    true,
  rightPanelMode: 'ai' as RightPanelMode,
  shortcutsOpen:  false,
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      ...initialUIState,

      toggleSidebar:     () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleAIPanel:     () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
      setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
      openShortcuts:     () => set({ shortcutsOpen: true }),
      closeShortcuts:    () => set({ shortcutsOpen: false }),
    }),
    {
      name: 'viraedit-ui',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : (null as never)
      ),
      partialize: (s) => ({
        sidebarOpen:    s.sidebarOpen,
        aiPanelOpen:    s.aiPanelOpen,
        rightPanelMode: s.rightPanelMode,
        // shortcutsOpen is session-only — don't persist
      }),
    }
  )
)
