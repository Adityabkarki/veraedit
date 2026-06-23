'use client'

/**
 * SelectedClipTimingBar — start / end timestamps for the selected timeline clip.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'
import { dismissTimelineClipPanel } from '@/lib/clipEditorDismiss'

export function SelectedClipTimingBar() {
  const clips = useTimelineStore((s) => s.clips)
  const tracks = useTimelineStore((s) => s.tracks)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const moveClip = useTimelineStore((s) => s.moveClip)
  const trimClipEnd = useTimelineStore((s) => s.trimClipEnd)

  const clip =
    selectedClipIds.length === 1
      ? clips.find((c) => c.id === selectedClipIds[0])
      : undefined

  if (!clip) return null

  const track = tracks.find((t) => t.id === clip.trackId)
  const end = clip.startTime + clip.duration

  return (
    <div
      data-testid="selected-clip-timing-bar"
      className="flex-shrink-0 flex flex-wrap items-center gap-3 px-3 py-1.5 border-t border-bg-overlay bg-bg-elevated/80 text-[11px]"
    >
      <span className="font-semibold text-text-primary truncate max-w-[140px]" title={clip.label}>
        {track?.label ?? clip.trackId}: {clip.label}
      </span>

      <label className="flex items-center gap-1.5">
        <span className="text-text-disabled">In</span>
        <input
          data-testid="clip-timing-in"
          type="number"
          min={0}
          step={0.1}
          value={Number(clip.startTime.toFixed(2))}
          onChange={(e) => moveClip(clip.id, Math.max(0, Number(e.target.value)))}
          className="w-16 px-1.5 py-0.5 rounded bg-bg-overlay border border-bg-overlay font-mono text-xs"
        />
        <span className="text-text-disabled font-mono">{formatEffectTime(clip.startTime)}</span>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-text-disabled">Out</span>
        <input
          data-testid="clip-timing-out"
          type="number"
          min={0.1}
          step={0.1}
          value={Number(end.toFixed(2))}
          onChange={(e) => {
            const out = Math.max(clip.startTime + 0.1, Number(e.target.value))
            trimClipEnd(clip.id, out - clip.startTime)
          }}
          className="w-16 px-1.5 py-0.5 rounded bg-bg-overlay border border-bg-overlay font-mono text-xs"
        />
        <span className="text-text-disabled font-mono">{formatEffectTime(end)}</span>
      </label>

      <span className="text-text-disabled">
        Duration {clip.duration.toFixed(1)}s — drag clip edges on the timeline to adjust
      </span>

      <button
        type="button"
        data-testid="selected-clip-timing-close"
        onClick={dismissTimelineClipPanel}
        aria-label="Close clip editor"
        title="Close (Esc)"
        className="ml-auto p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay text-sm leading-none"
      >
        ✕
      </button>
    </div>
  )
}
