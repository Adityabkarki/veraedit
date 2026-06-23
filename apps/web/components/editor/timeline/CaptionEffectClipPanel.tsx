'use client'

/**
 * CaptionEffectClipPanel — edit caption animation presets on the Caption FX track.
 */

import { useTimelineStore } from '@/stores/timelineStore'
import {
  CAPTION_EFFECT_CONFIG,
  captionEffectLabel,
  isCaptionEffectClip,
  type CaptionAnimation,
} from '@/lib/captionEffects'
import { formatEffectTime } from '@/components/editor/timeline/EffectRangeOverlay'
import { TimelineClipPanelHeader } from '@/components/editor/timeline/TimelineClipPanelHeader'

const ANIMATION_OPTIONS: { id: CaptionAnimation; label: string }[] = [
  { id: 'pop', label: 'Pop-in' },
  { id: 'word-by-word', label: 'Word-by-word' },
  { id: 'slide', label: 'Slide-up' },
  { id: 'scale_pop', label: 'Scale-pop' },
  { id: 'masked_reveal', label: 'Masked reveal' },
]

export function CaptionEffectClipPanel() {
  const clips = useTimelineStore((s) => s.clips)
  const selectedClipIds = useTimelineStore((s) => s.selectedClipIds)
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)

  const clip =
    selectedClipIds.length === 1
      ? clips.find((c) => c.id === selectedClipIds[0] && isCaptionEffectClip(c))
      : undefined

  if (!clip) return null

  const anim =
    (clip.effects?.captionAnimation as CaptionAnimation | undefined) ?? 'pop'

  const applyAnimation = (next: CaptionAnimation) => {
    const cfg = Object.values(CAPTION_EFFECT_CONFIG).find((c) => c.animation === next)
    updateOverlayClip(clip.id, {
      captionAnimation: next,
      maxWordsPerLine: cfg?.maxWordsPerLine,
      captionCase: cfg?.captionCase,
      captionPosition: cfg?.position,
    })
    useTimelineStore.setState({
      clips: useTimelineStore.getState().clips.map((c) =>
        c.id === clip.id ? { ...c, label: cfg?.label ?? captionEffectLabel(next) } : c,
      ),
    })
  }

  return (
    <div
      data-testid="caption-effect-clip-panel"
      className="border-t border-amber-500/30 bg-bg-elevated flex-shrink-0 flex flex-col"
    >
      <TimelineClipPanelHeader
        title="Caption FX — styles your transcript"
        subtitle={`${formatEffectTime(clip.startTime)} → ${formatEffectTime(clip.startTime + clip.duration)} · animates text on the Captions track`}
        testId="caption-effect-clip-panel-close"
      />

      <div className="p-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {ANIMATION_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            data-testid={`caption-fx-preset-${opt.id}`}
            onClick={() => applyAnimation(opt.id)}
            className={`px-2 py-1 rounded text-[10px] border ${
              anim === opt.id
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-bg-overlay text-text-disabled hover:text-text-primary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-[10px] text-text-disabled">Position</span>
          <select
            data-testid="caption-fx-position"
            value={clip.effects?.captionPosition ?? 'bottom'}
            onChange={(e) =>
              updateOverlayClip(clip.id, {
                captionPosition: e.target.value as 'bottom' | 'center' | 'top',
              })
            }
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          >
            <option value="bottom">Bottom</option>
            <option value="center">Center</option>
            <option value="top">Top</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-text-disabled">Words / line</span>
          <input
            type="number"
            min={1}
            max={8}
            value={clip.effects?.maxWordsPerLine ?? 4}
            onChange={(e) =>
              updateOverlayClip(clip.id, { maxWordsPerLine: Number(e.target.value) })
            }
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
          />
        </label>
        <label className="block flex items-end pb-1">
          <input
            type="checkbox"
            checked={clip.effects?.captionCase === 'uppercase'}
            onChange={(e) =>
              updateOverlayClip(clip.id, {
                captionCase: e.target.checked ? 'uppercase' : 'normal',
              })
            }
            className="accent-amber-500 mr-1.5"
          />
          <span className="text-[10px] text-text-secondary">Uppercase</span>
        </label>
      </div>
      </div>
    </div>
  )
}
