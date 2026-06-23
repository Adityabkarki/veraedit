'use client'

/**
 * OverlayEditPanel — edit a placed visual's text, timing, and duration.
 * Opens when inserting a template or clicking an overlay on the timeline / placed list.
 */

import { useVisualLibraryStore, VISUAL_TEMPLATES } from '@/stores/visualLibraryStore'
import { useTimelineStore } from '@/stores/timelineStore'

function formatTimeInput(s: number): string {
  return s.toFixed(1)
}

export function OverlayEditPanel() {
  const editingId = useVisualLibraryStore((s) => s.editingOverlayId)
  const overlay = useVisualLibraryStore((s) =>
    s.placedOverlays.find((o) => o.id === s.editingOverlayId)
  )
  const updateOverlay = useVisualLibraryStore((s) => s.updateOverlay)
  const stopEditOverlay = useVisualLibraryStore((s) => s.stopEditOverlay)
  const removeOverlay = useVisualLibraryStore((s) => s.removeOverlay)
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime)
  const selectClip = useTimelineStore((s) => s.selectClip)

  if (!editingId || !overlay) return null

  const template = VISUAL_TEMPLATES.find((t) => t.id === overlay.templateId)

  return (
    <div
      data-testid="overlay-edit-panel"
      className="border-t border-bg-overlay bg-bg-elevated flex-shrink-0 p-3 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-text-primary">
          Edit visual — {template?.name ?? 'Overlay'}
        </p>
        <button
          type="button"
          data-testid="overlay-edit-close"
          onClick={() => stopEditOverlay()}
          aria-label="Close overlay editor"
          title="Close (Esc)"
          className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay text-sm leading-none"
        >
          ✕
        </button>
      </div>

      <p className="text-[10px] text-text-disabled leading-snug">
        Changes appear on the <strong className="text-text-secondary">Visuals</strong> timeline track
        and in the video preview. Drag the clip to move; trim handles to change length.
      </p>

      <label className="block">
        <span className="text-[10px] text-text-disabled">Main text</span>
        <input
          data-testid="overlay-edit-text"
          type="text"
          value={overlay.text}
          onChange={(e) => updateOverlay(editingId, { text: e.target.value })}
          className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
        />
      </label>

      <label className="block">
        <span className="text-[10px] text-text-disabled">Subtitle / label</span>
        <input
          data-testid="overlay-edit-subtitle"
          type="text"
          value={overlay.secondaryText ?? ''}
          onChange={(e) => updateOverlay(editingId, { secondaryText: e.target.value })}
          className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
        />
      </label>

      <div className="flex gap-2">
        <label className="flex-1">
          <span className="text-[10px] text-text-disabled">Horizontal (%)</span>
          <input
            data-testid="overlay-edit-x"
            type="range"
            min={0}
            max={100}
            value={Math.round(overlay.xPct ?? 50)}
            onChange={(e) => updateOverlay(editingId, { xPct: Number(e.target.value) })}
            className="w-full accent-accent mt-1"
          />
        </label>
        <label className="flex-1">
          <span className="text-[10px] text-text-disabled">Vertical (%)</span>
          <input
            data-testid="overlay-edit-y"
            type="range"
            min={0}
            max={100}
            value={Math.round(overlay.yPct ?? 50)}
            onChange={(e) => updateOverlay(editingId, { yPct: Number(e.target.value) })}
            className="w-full accent-accent mt-1"
          />
        </label>
        <label className="w-20">
          <span className="text-[10px] text-text-disabled">Scale</span>
          <input
            data-testid="overlay-edit-scale"
            type="number"
            min={0.5}
            max={3}
            step={0.1}
            value={overlay.scale ?? 1}
            onChange={(e) => updateOverlay(editingId, { scale: Number(e.target.value) })}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
          />
        </label>
      </div>

      <div className="flex gap-2">
        <label className="flex-1">
          <span className="text-[10px] text-text-disabled">Start (sec)</span>
          <input
            data-testid="overlay-edit-start"
            type="number"
            min={0}
            step={0.1}
            value={formatTimeInput(overlay.startTime)}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value))
              updateOverlay(editingId, { startTime: v })
              setPlayheadTime(v)
            }}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
          />
        </label>
        <label className="flex-1">
          <span className="text-[10px] text-text-disabled">Duration (sec)</span>
          <input
            data-testid="overlay-edit-duration"
            type="number"
            min={0.5}
            step={0.1}
            value={formatTimeInput(overlay.duration)}
            onChange={(e) =>
              updateOverlay(editingId, { duration: Math.max(0.5, Number(e.target.value)) })
            }
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[10px] text-text-disabled">Layout</span>
        <select
          data-testid="overlay-edit-mode"
          value={overlay.overlayMode ?? 'corner'}
          onChange={(e) =>
            updateOverlay(editingId, {
              overlayMode: e.target.value as 'corner' | 'fullscreen',
            })
          }
          className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
        >
          <option value="corner">Corner / positioned</option>
          <option value="fullscreen">Full screen</option>
        </select>
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          data-testid="overlay-edit-jump"
          onClick={() => {
            setPlayheadTime(overlay.startTime)
            selectClip(editingId)
          }}
          className="flex-1 py-1.5 rounded text-xs font-medium bg-bg-overlay text-text-secondary hover:text-text-primary"
        >
          Jump on timeline
        </button>
        <button
          type="button"
          data-testid="overlay-edit-delete"
          onClick={() => removeOverlay(editingId)}
          className="px-3 py-1.5 rounded text-xs font-medium text-status-error hover:bg-status-error/10"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
