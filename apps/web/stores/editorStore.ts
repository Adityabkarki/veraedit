/**
 * Editor Store — Zustand
 *
 * Manages editor layout state: panel sizes, active tabs, save status,
 * first-time tooltip visibility.
 *
 * Panel sizes are persisted so the user's layout survives navigation.
 * Tooltip dismissed state is also persisted (once dismissed, never shown again).
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ── Panel size constraints ────────────────────────────────────────────────────

export const LEFT_PANEL_MIN  = 200
export const LEFT_PANEL_MAX  = 480
export const RIGHT_PANEL_MIN = 240
export const RIGHT_PANEL_MAX = 520
export const TIMELINE_MIN    = 140
export const TIMELINE_MAX    = 640

export const LEFT_PANEL_DEFAULT  = 300
export const RIGHT_PANEL_DEFAULT = 320
export const TIMELINE_DEFAULT    = 260

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeftTab    = 'media' | 'transcript' | 'scenes' | 'shorts' | 'highlights' | 'brand' | 'style'
export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'
/** Top-level layout mode — changes which panels are visible */
export type EditorMode = 'editor' | 'shorts'

export interface EditorState {
  /** Width in px of the left (media/scenes/etc) panel */
  leftPanelWidth: number
  /** Width in px of the right AI suggestions panel */
  rightPanelWidth: number
  /** Height in px of the bottom timeline panel */
  timelineHeight: number

  /** Top-level layout mode */
  editorMode: EditorMode

  /** Currently active left-panel tab */
  activeLeftTab: LeftTab

  /** Save status indicator */
  saveStatus: SaveStatus

  /**
   * Which first-time tooltip panels have been dismissed.
   * Keys: 'left' | 'preview' | 'ai' | 'timeline'
   */
  tooltipsDismissed: Record<string, boolean>

  // ── Actions ─────────────────────────────────────────────────────────────

  setEditorMode:      (mode: EditorMode) => void
  setLeftPanelWidth:  (w: number | ((prev: number) => number)) => void
  setRightPanelWidth: (w: number | ((prev: number) => number)) => void
  setTimelineHeight:  (h: number | ((prev: number) => number)) => void
  setActiveLeftTab:   (tab: LeftTab) => void
  setSaveStatus:      (s: SaveStatus) => void
  dismissTooltip:     (panel: string) => void
  dismissAllTooltips: () => void
  resetLayout:        () => void
}

// ── Initial state (exported for test resets) ──────────────────────────────────

export const initialEditorState = {
  editorMode:      'editor' as EditorMode,
  leftPanelWidth:  LEFT_PANEL_DEFAULT,
  rightPanelWidth: RIGHT_PANEL_DEFAULT,
  timelineHeight:  TIMELINE_DEFAULT,
  activeLeftTab:   'media' as LeftTab,
  saveStatus:      'saved' as SaveStatus,
  tooltipsDismissed: {} as Record<string, boolean>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function clampLeftPanel(w: number): number {
  return Math.max(LEFT_PANEL_MIN, Math.min(LEFT_PANEL_MAX, w))
}

export function clampRightPanel(w: number): number {
  return Math.max(RIGHT_PANEL_MIN, Math.min(RIGHT_PANEL_MAX, w))
}

export function clampTimeline(h: number): number {
  return Math.max(TIMELINE_MIN, Math.min(TIMELINE_MAX, h))
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      ...initialEditorState,

      setEditorMode: (mode) =>
        set({ editorMode: mode }),

      setLeftPanelWidth: (w) =>
        set((s) => ({
          leftPanelWidth: clampLeftPanel(typeof w === 'function' ? w(s.leftPanelWidth) : w),
        })),

      setRightPanelWidth: (w) =>
        set((s) => ({
          rightPanelWidth: clampRightPanel(typeof w === 'function' ? w(s.rightPanelWidth) : w),
        })),

      setTimelineHeight: (h) =>
        set((s) => ({
          timelineHeight: clampTimeline(typeof h === 'function' ? h(s.timelineHeight) : h),
        })),

      setActiveLeftTab: (tab) =>
        set({ activeLeftTab: tab }),

      setSaveStatus: (s) =>
        set({ saveStatus: s }),

      dismissTooltip: (panel) =>
        set((state) => ({
          tooltipsDismissed: { ...state.tooltipsDismissed, [panel]: true },
        })),

      dismissAllTooltips: () =>
        set({
          tooltipsDismissed: {
            left: true,
            preview: true,
            ai: true,
            timeline: true,
          },
        }),

      resetLayout: () =>
        set({
          leftPanelWidth:  LEFT_PANEL_DEFAULT,
          rightPanelWidth: RIGHT_PANEL_DEFAULT,
          timelineHeight:  TIMELINE_DEFAULT,
        }),
    }),
    {
      name: 'viraedit-editor',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : (null as never)
      ),
      // Persist layout + tab choice + tooltip dismissals; not save status
      partialize: (s) => ({
        editorMode:        s.editorMode,
        leftPanelWidth:    s.leftPanelWidth,
        rightPanelWidth:   s.rightPanelWidth,
        timelineHeight:    s.timelineHeight,
        activeLeftTab:     s.activeLeftTab,
        tooltipsDismissed: s.tooltipsDismissed,
      }),
    }
  )
)
