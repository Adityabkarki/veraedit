'use client'

/**
 * MotionGraphicClipPanel — edit data cards, arrows, and conflict highlights on the timeline.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import { isMotionGraphicClip, motionGraphicLabel } from '@/lib/motionGraphics'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'

export function MotionGraphicClipPanel() {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)

  const clip =
    selectedClipIds.length === 1
      ? clips.find((c) => c.id === selectedClipIds[0] && isMotionGraphicClip(c))
      : undefined

  if (!clip) return null

  const vt = (clip.effects?.visualType ?? '').toLowerCase()

  return (
    <div
      data-testid="motion-graphic-clip-panel"
      className="border-t border-gray-500/40 bg-bg-elevated flex-shrink-0 p-3 space-y-3"
    >
      <div>
        <p className="text-xs font-semibold text-text-primary">
          {motionGraphicLabel(vt)} — edit on canvas
        </p>
        <p className="text-[10px] text-text-disabled mt-0.5">
          {formatEffectTime(clip.startTime)} →{' '}
          {formatEffectTime(clip.startTime + clip.duration)} · drag on preview to move · corner handle to resize
        </p>
      </div>

      {vt === 'data_card' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block col-span-2 sm:col-span-1">
            <span className="text-[10px] text-text-disabled">Metric value</span>
            <input
              data-testid="motion-gfx-metric"
              type="text"
              value={clip.effects?.displayValue ?? ''}
              placeholder="12,500"
              onChange={(e) => updateOverlayClip(clip.id, { displayValue: e.target.value })}
              className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
            />
          </label>
          <label className="block col-span-2 sm:col-span-1">
            <span className="text-[10px] text-text-disabled">Label</span>
            <input
              data-testid="motion-gfx-label"
              type="text"
              value={clip.effects?.secondaryText ?? ''}
              placeholder="Metric label"
              onChange={(e) => updateOverlayClip(clip.id, { secondaryText: e.target.value })}
              className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
            />
          </label>
        </div>
      )}

      {vt === 'arrow_flow' && (
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="text-[10px] text-text-disabled">Length</span>
            <input
              data-testid="motion-gfx-arrow-length"
              type="range"
              min={8}
              max={70}
              value={Math.round(clip.effects?.widthPct ?? 26)}
              onChange={(e) => updateOverlayClip(clip.id, { widthPct: Number(e.target.value) })}
              className="w-full accent-accent mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-text-disabled">Rotation</span>
            <input
              data-testid="motion-gfx-arrow-rotation"
              type="range"
              min={-180}
              max={180}
              value={Math.round(clip.effects?.rotation ?? 0)}
              onChange={(e) => updateOverlayClip(clip.id, { rotation: Number(e.target.value) })}
              className="w-full accent-accent mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-text-disabled">Scale</span>
            <input
              data-testid="motion-gfx-arrow-scale"
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
      )}

      {vt === 'conflict_box' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-text-disabled">Width %</span>
              <input
                type="range"
                min={12}
                max={90}
                value={Math.round(clip.effects?.widthPct ?? 42)}
                onChange={(e) => updateOverlayClip(clip.id, { widthPct: Number(e.target.value) })}
                className="w-full accent-accent mt-1"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-text-disabled">Height %</span>
              <input
                type="range"
                min={10}
                max={80}
                value={Math.round(clip.effects?.heightPct ?? 28)}
                onChange={(e) => updateOverlayClip(clip.id, { heightPct: Number(e.target.value) })}
                className="w-full accent-accent mt-1"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-[10px] text-text-disabled">Optional note</span>
            <input
              data-testid="motion-gfx-conflict-note"
              type="text"
              value={clip.effects?.displayValue ?? ''}
              placeholder="Leave empty for frame only"
              onChange={(e) => updateOverlayClip(clip.id, { displayValue: e.target.value })}
              className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
            />
          </label>
        </div>
      )}

      {vt === 'upper_third_label' && (
        <label className="block">
          <span className="text-[10px] text-text-disabled">Label text</span>
          <input
            type="text"
            value={clip.effects?.displayValue ?? ''}
            placeholder="Context label"
            onChange={(e) => updateOverlayClip(clip.id, { displayValue: e.target.value })}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          />
        </label>
      )}
    </div>
  )
}
