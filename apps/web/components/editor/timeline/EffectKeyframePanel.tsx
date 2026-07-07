'use client'

/**
 * EffectKeyframePanel — edit keyframed effect clips on the Effects track.
 */

import { useEffectsStore } from '@/stores/effectsStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { commitTimelineClips } from '@/lib/editor/timelineClipUpdates'
import type { Clip, EffectKeyframe } from '@/stores/timelineStore'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'
import { TimelineClipPanelHeader } from '@/components/editor/timeline/TimelineClipPanelHeader'
import { dismissTimelineClipPanel } from '@/lib/clipEditorDismiss'

function getEffectClip(clips: Clip[], id: string | null): Clip | undefined {
  if (!id) return undefined
  return clips.find((c) => c.id === id && c.trackId === 'effects')
}

export function EffectKeyframePanel() {
  const editingEffectId = useEffectsStore((s) => s.editingEffectClipId)
  const stopEditingEffect = useEffectsStore((s) => s.stopEditingEffect)
  const clips = useTimelineStore((s) => s.clips)
  const playheadTime = useTimelineStore((s) => s.playheadTime)
  const setPlayheadTime = useTimelineStore((s) => s.setPlayheadTime)

  const clip = getEffectClip(clips, editingEffectId)
  if (!clip || !clip.effects) return null

  const keyframes = clip.effects.keyframes ?? []
  const sorted = [...keyframes].sort((a, b) => a.offset - b.offset)
  const effectType = clip.effects.effectType ?? 'filter'

  const updateClip = (patch: Partial<NonNullable<Clip['effects']>>, label: string) => {
    commitTimelineClips(
      (allClips) =>
        allClips.map((c) =>
          c.id === clip.id ? { ...c, effects: { ...c.effects, ...patch } } : c,
        ),
      { recordUndo: true, lastEditAction: label },
    )
  }

  const updateKeyframe = (index: number, changes: Partial<EffectKeyframe>) => {
    const next = sorted.map((kf, i) => (i === index ? { ...kf, ...changes } : kf))
    updateClip({ keyframes: next }, 'Updated effect keyframe')
  }

  const addKeyframeAtPlayhead = () => {
    const local = Math.max(0, Math.min(clip.duration, playheadTime - clip.startTime))
    const value = interpolateLocal(sorted, local)
    const next = [...sorted, { offset: local, value }].sort((a, b) => a.offset - b.offset)
    updateClip({ keyframes: next }, 'Added effect keyframe')
  }

  const removeEffect = () => {
    commitTimelineClips(
      (allClips) => allClips.filter((c) => c.id !== clip.id),
      {
        selectedClipIds: useTimelineStore.getState().selectedClipIds.filter((id) => id !== clip.id),
        lastEditAction: 'Removed effect',
      },
    )
    stopEditingEffect()
  }

  const valueLabel =
    effectType === 'speed' ? 'Speed multiplier' : effectType === 'opacity' ? 'Opacity' : 'Intensity'

  return (
    <div
      data-testid="effect-keyframe-panel"
      className="border-t border-violet-500/30 bg-bg-elevated flex-shrink-0 flex flex-col max-h-48"
    >
      <TimelineClipPanelHeader
        title={clip.label}
        subtitle={`${formatEffectTime(clip.startTime)} → ${formatEffectTime(clip.startTime + clip.duration)} · ${effectType}`}
        testId="effect-keyframe-close"
        onClose={dismissTimelineClipPanel}
      />

      <div className="p-3 space-y-2 overflow-y-auto flex-1 min-h-0">
      <p className="text-[10px] text-text-disabled leading-snug">
        Set keyframes from start to end of this effect clip. Drag the clip on the Effects track to
        move the range; trim handles to change duration.
      </p>

      <div className="space-y-2">
        {sorted.map((kf, i) => (
          <div
            key={`${clip.id}-kf-${i}`}
            data-testid={`effect-keyframe-row-${i}`}
            className="flex items-center gap-2 text-xs"
          >
            <span className="text-text-disabled w-8">#{i + 1}</span>
            <label className="flex items-center gap-1">
              <span className="text-[10px] text-text-disabled">At</span>
              <input
                type="number"
                min={0}
                max={clip.duration}
                step={0.1}
                value={Number(kf.offset.toFixed(2))}
                onChange={(e) => updateKeyframe(i, { offset: Number(e.target.value) })}
                className="w-14 px-1 py-0.5 rounded bg-bg-overlay border border-bg-overlay text-text-primary"
                aria-label={`Keyframe ${i + 1} time offset`}
              />
              <span className="text-[10px] text-text-disabled">s</span>
            </label>
            <label className="flex items-center gap-1 flex-1">
              <span className="text-[10px] text-text-disabled">{valueLabel}</span>
              <input
                type="range"
                min={0}
                max={effectType === 'speed' ? 3 : 1}
                step={effectType === 'speed' ? 0.1 : 0.05}
                value={kf.value}
                onChange={(e) => updateKeyframe(i, { value: Number(e.target.value) })}
                className="flex-1 accent-violet-500"
                aria-label={`Keyframe ${i + 1} value`}
              />
              <span className="text-[10px] font-mono text-text-secondary w-8">
                {kf.value.toFixed(2)}
              </span>
            </label>
            <button
              type="button"
              disabled={sorted.length <= 2}
              onClick={() => {
                const next = sorted.filter((_, j) => j !== i)
                updateClip({ keyframes: next }, 'Removed keyframe')
              }}
              className="text-text-disabled hover:text-status-error disabled:opacity-30 text-xs"
              aria-label="Delete keyframe"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          data-testid="effect-add-keyframe"
          onClick={addKeyframeAtPlayhead}
          className="text-[11px] px-2 py-1 rounded bg-violet-600/20 text-violet-300 hover:bg-violet-600/30"
        >
          + Keyframe at playhead
        </button>
        <button
          type="button"
          onClick={() => setPlayheadTime(clip.startTime)}
          className="text-[11px] px-2 py-1 rounded text-text-secondary hover:bg-bg-overlay"
        >
          Go to start
        </button>
        <button
          type="button"
          data-testid="effect-remove-clip"
          onClick={removeEffect}
          className="text-[11px] px-2 py-1 rounded text-status-error hover:bg-bg-overlay ml-auto"
        >
          Remove effect
        </button>
      </div>
      </div>
    </div>
  )
}

function interpolateLocal(keyframes: EffectKeyframe[], localTime: number): number {
  if (keyframes.length === 0) return 1
  if (localTime <= keyframes[0].offset) return keyframes[0].value
  const last = keyframes[keyframes.length - 1]
  if (localTime >= last.offset) return last.value
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    if (localTime >= a.offset && localTime <= b.offset) {
      const t = (localTime - a.offset) / (b.offset - a.offset || 1)
      return a.value + t * (b.value - a.value)
    }
  }
  return last.value
}
