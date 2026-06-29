'use client'

import { useTimelineStore } from '@/stores/timelineStore'
import type { Clip } from '@/stores/timelineStore'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'

interface ClipTimingSectionProps {
  clip: Clip
}

export function ClipTimingSection({ clip }: ClipTimingSectionProps) {
  const tracks = useTimelineStore((s) => s.tracks)
  const moveClip = useTimelineStore((s) => s.moveClip)
  const trimClipEnd = useTimelineStore((s) => s.trimClipEnd)

  const track = tracks.find((t) => t.id === clip.trackId)
  const end = clip.startTime + clip.duration

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-bg-overlay bg-bg-elevated/60 text-[11px]">
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
        {clip.duration.toFixed(1)}s
      </span>
    </div>
  )
}
