'use client'

/**
 * EditorPage — client-side orchestrator for the editor route.
 *
 * Handles global keyboard shortcuts:
 *
 *   Playback:
 *     Space       — play / pause
 *     J           — rewind 5 s
 *     L           — forward 5 s
 *     K           — jump to start (time = 0)
 *     ←           — step back 1 frame (~0.033 s)
 *     →           — step forward 1 frame
 *     Shift+←     — step back 1 s
 *     Shift+→     — step forward 1 s
 *
 *   Editing:
 *     C           — split selected clips at playhead
 *     Delete/Backspace — delete selected clips
 *     Ctrl+Z      — undo
 *     Ctrl+Y / Ctrl+Shift+Z — redo
 *     Ctrl+D      — duplicate selected clip (first selected)
 *
 *   Panels:
 *     [           — toggle left panel
 *     ]           — toggle AI panel
 *     \           — reset panel layout
 *     ?           — show keyboard shortcuts modal
 *     = / +       — zoom in timeline
 *     - / _       — zoom out timeline
 */

import { useEffect, useState, useCallback } from 'react'
import { useUIStore }      from '@/stores/uiStore'
import { useEditorStore }  from '@/stores/editorStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { usePlayerStore } from '@/stores/playerStore'
import { EditorLayout }    from '@/components/editor/EditorLayout'
import { preloadCommonSfx } from '@/lib/sfxLibrary'
import { ExportModal }     from '@/components/editor/ExportModal'
import { loadEditorProject, saveProjectTimeline } from '@/lib/editorData'

interface EditorPageProps {
  projectId: string
}

const FRAME = 1 / 30   // one video frame ≈ 0.033 s
const STEP  = 1        // 1 second step

export function EditorPage({ projectId }: EditorPageProps) {
  const { openShortcuts, toggleSidebar, toggleAIPanel } = useUIStore()
  const { resetLayout, setSaveStatus } = useEditorStore()
  const {
    undo, redo,
    stepPlayhead,
    setPlayheadTime,
    splitClip,
    deleteSelectedClips,
    duplicateClip,
    zoomIn, zoomOut,
    lastEditAction,
  } = useTimelineStore()
  const { togglePlay, clearPreviewRange, isPlaying } = usePlayerStore()

  const [exportOpen, setExportOpen] = useState(false)

  const handleSave = useCallback(async () => {
    setSaveStatus('saving')
    const result = await saveProjectTimeline(projectId)
    setSaveStatus(result.ok ? 'saved' : 'error')
  }, [projectId, setSaveStatus])

  useEffect(() => {
    preloadCommonSfx()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire when typing in a text input or textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      const ctrl  = e.ctrlKey || e.metaKey
      const shift = e.shiftKey

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (!isPlaying) clearPreviewRange()
          togglePlay()
          break

        // ── Playback ────────────────────────────────────────────────────────
        case 'j': case 'J':
          e.preventDefault()
          stepPlayhead(-5)
          break

        case 'l': case 'L':
          e.preventDefault()
          stepPlayhead(5)
          break

        case 'k': case 'K':
          e.preventDefault()
          setPlayheadTime(0)
          break

        case 'ArrowLeft':
          e.preventDefault()
          stepPlayhead(shift ? -STEP : -FRAME)
          break

        case 'ArrowRight':
          e.preventDefault()
          stepPlayhead(shift ? STEP : FRAME)
          break

        // ── Editing ─────────────────────────────────────────────────────────
        case 'c': case 'C':
          if (!ctrl) {
            e.preventDefault()
            // Split all selected clips at playhead
            const { playheadTime, selectedClipIds: ids } = useTimelineStore.getState()
            if (ids.length > 0) {
              ids.forEach((id) => splitClip(id, playheadTime))
            }
          }
          break

        case 'Delete':
        case 'Backspace':
          e.preventDefault()
          deleteSelectedClips()
          break

        case 'z': case 'Z':
          if (ctrl && shift) { e.preventDefault(); redo() }
          else if (ctrl)     { e.preventDefault(); undo() }
          break

        case 'y': case 'Y':
          if (ctrl) { e.preventDefault(); redo() }
          break

        case 'd': case 'D':
          if (ctrl) {
            e.preventDefault()
            const first = useTimelineStore.getState().selectedClipIds[0]
            if (first) duplicateClip(first)
          }
          break

        // ── Timeline zoom ────────────────────────────────────────────────────
        case '=': case '+':
          if (!ctrl) { e.preventDefault(); zoomIn() }
          break

        case '-': case '_':
          if (!ctrl) { e.preventDefault(); zoomOut() }
          break

        // ── Panels ───────────────────────────────────────────────────────────
        case '[':
          toggleSidebar()
          break

        case ']':
          toggleAIPanel()
          break

        case '\\':
          resetLayout()
          break

        case '?':
          openShortcuts()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    openShortcuts, toggleSidebar, toggleAIPanel, resetLayout,
    undo, redo, stepPlayhead, setPlayheadTime,
    splitClip, deleteSelectedClips, duplicateClip,
    zoomIn, zoomOut, togglePlay, clearPreviewRange, isPlaying,
  ])

  // ── Load real project + transcript from the backend ──────────────────────
  const [projectTitle, setProjectTitle] = useState('Loading…')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await loadEditorProject(projectId)
      if (cancelled) return

      setProjectTitle(result.projectTitle)
    }

    void load()
    return () => { cancelled = true }
  }, [projectId])

  // Auto-save timeline after edits (debounced 2 s)
  useEffect(() => {
    if (!lastEditAction) return
    const timer = setTimeout(() => { void handleSave() }, 2000)
    return () => clearTimeout(timer)
  }, [lastEditAction, handleSave])

  return (
    <>
      <EditorLayout
        projectTitle={projectTitle}
        projectId={projectId}
        onUndo={undo}
        onRedo={redo}
        onExport={() => setExportOpen(true)}
      />
      <ExportModal
        projectId={projectId}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />
    </>
  )
}
