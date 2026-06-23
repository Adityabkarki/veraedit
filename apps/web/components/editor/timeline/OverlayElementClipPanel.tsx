'use client'

/**
 * OverlayElementClipPanel — edit text, labels, motion, and size for all overlay elements.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import {
  isEditableOverlayClip,
  overlayElementLabel,
  overlayShowsSizeFields,
  overlayShowsSubtitleField,
  overlaySubtitleFieldLabel,
} from '@/lib/overlayElements'
import {
  OVERLAY_ENTRANCE_OPTIONS,
  OVERLAY_EXIT_OPTIONS,
  type OverlayMotionPreset,
} from '@/lib/overlayAnimations'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'
import { TimelineClipPanelHeader } from '@/components/editor/timeline/TimelineClipPanelHeader'

export function OverlayElementClipPanel() {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)

  const clip =
    selectedClipIds.length === 1
      ? clips.find((c) => c.id === selectedClipIds[0] && isEditableOverlayClip(c))
      : undefined

  if (!clip) return null

  const vt = (clip.effects?.visualType ?? '').toLowerCase()
  const showSubtitle = overlayShowsSubtitleField(vt)
  const showSize = overlayShowsSizeFields(vt)
  const showMainText = vt !== 'arrow_flow' && vt !== 'conflict_box'

  return (
    <div
      data-testid="overlay-element-clip-panel"
      className="border-t border-pink-500/30 bg-bg-elevated flex-shrink-0 flex flex-col max-h-64"
    >
      <TimelineClipPanelHeader
        title={`${overlayElementLabel(clip)} — Text & overlay`}
        subtitle={`${formatEffectTime(clip.startTime)} → ${formatEffectTime(clip.startTime + clip.duration)} · drag on preview · corner handle to resize`}
        testId="overlay-element-clip-panel-close"
      />

      <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
      {showMainText && (
        <label className="block">
          <span className="text-[10px] text-text-disabled">Main text</span>
          <input
            data-testid="overlay-element-main-text"
            type="text"
            value={clip.effects?.displayValue ?? ''}
            placeholder="Your text here"
            onChange={(e) => updateOverlayClip(clip.id, { displayValue: e.target.value })}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          />
        </label>
      )}

      {vt === 'emoji_element' && (
        <label className="block">
          <span className="text-[10px] text-text-disabled">Emoji</span>
          <input
            data-testid="overlay-element-emoji"
            type="text"
            value={clip.effects?.emoji ?? clip.effects?.displayValue ?? ''}
            placeholder="🔥"
            onChange={(e) =>
              updateOverlayClip(clip.id, { emoji: e.target.value, displayValue: e.target.value })
            }
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          />
        </label>
      )}

      {showSubtitle && (
        <label className="block">
          <span className="text-[10px] text-text-disabled">{overlaySubtitleFieldLabel(vt)}</span>
          <input
            data-testid="overlay-element-subtitle"
            type="text"
            value={clip.effects?.secondaryText ?? ''}
            placeholder="Supporting label"
            onChange={(e) => updateOverlayClip(clip.id, { secondaryText: e.target.value })}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          />
        </label>
      )}

      {vt === 'conflict_box' && (
        <label className="block">
          <span className="text-[10px] text-text-disabled">Optional note</span>
          <input
            type="text"
            value={clip.effects?.displayValue ?? ''}
            placeholder="Leave empty for frame only"
            onChange={(e) => updateOverlayClip(clip.id, { displayValue: e.target.value })}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-text-disabled">Entrance</span>
          <select
            data-testid="overlay-element-entrance"
            value={clip.effects?.overlayEntrance ?? 'fade_in'}
            onChange={(e) =>
              updateOverlayClip(clip.id, {
                overlayEntrance: e.target.value as OverlayMotionPreset,
              })
            }
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          >
            {OVERLAY_ENTRANCE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-text-disabled">Exit</span>
          <select
            data-testid="overlay-element-exit"
            value={clip.effects?.overlayExit ?? 'none'}
            onChange={(e) =>
              updateOverlayClip(clip.id, {
                overlayExit: e.target.value as OverlayMotionPreset,
              })
            }
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          >
            {OVERLAY_EXIT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] text-text-disabled">Horizontal</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(clip.effects?.xPct ?? 50)}
            onChange={(e) => updateOverlayClip(clip.id, { xPct: Number(e.target.value) })}
            className="w-full accent-accent mt-1"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-text-disabled">Vertical</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(clip.effects?.yPct ?? 50)}
            onChange={(e) => updateOverlayClip(clip.id, { yPct: Number(e.target.value) })}
            className="w-full accent-accent mt-1"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-text-disabled">Scale</span>
          <input
            type="number"
            min={0.4}
            max={3}
            step={0.1}
            value={clip.effects?.scale ?? 1}
            onChange={(e) => updateOverlayClip(clip.id, { scale: Number(e.target.value) })}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
          />
        </label>
      </div>

      {showSize && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] text-text-disabled">Width %</span>
            <input
              type="range"
              min={8}
              max={95}
              value={Math.round(clip.effects?.widthPct ?? 30)}
              onChange={(e) => updateOverlayClip(clip.id, { widthPct: Number(e.target.value) })}
              className="w-full accent-accent mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-text-disabled">Height %</span>
            <input
              type="range"
              min={8}
              max={95}
              value={Math.round(clip.effects?.heightPct ?? 20)}
              onChange={(e) => updateOverlayClip(clip.id, { heightPct: Number(e.target.value) })}
              className="w-full accent-accent mt-1"
            />
          </label>
        </div>
      )}

      {vt === 'arrow_flow' && (
        <label className="block">
          <span className="text-[10px] text-text-disabled">Rotation</span>
          <input
            type="range"
            min={-180}
            max={180}
            value={Math.round(clip.effects?.rotation ?? 0)}
            onChange={(e) => updateOverlayClip(clip.id, { rotation: Number(e.target.value) })}
            className="w-full accent-accent mt-1"
          />
        </label>
      )}
      </div>
    </div>
  )
}
