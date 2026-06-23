'use client'

/**
 * EffectRangeOverlay — highlights the In/Out range for applying keyframed effects.
 */

import { useEffectsStore } from '@/stores/effectsStore'

interface EffectRangeOverlayProps {
  pixelsPerSecond: number
  height: number
}

export function EffectRangeOverlay({ pixelsPerSecond, height }: EffectRangeOverlayProps) {
  const effectRangeIn = useEffectsStore((s) => s.effectRangeIn)
  const effectRangeOut = useEffectsStore((s) => s.effectRangeOut)

  if (effectRangeIn == null || effectRangeOut == null || effectRangeOut <= effectRangeIn) {
    return null
  }

  const left = effectRangeIn * pixelsPerSecond
  const width = (effectRangeOut - effectRangeIn) * pixelsPerSecond

  return (
    <div
      data-testid="effect-range-overlay"
      className="absolute pointer-events-none z-20 border-y-2 border-violet-400/70 bg-violet-500/10"
      style={{ left, width, top: 0, height }}
    >
      <span className="absolute left-1 top-0.5 text-[9px] font-mono text-violet-300 bg-violet-900/60 px-1 rounded">
        Effect range
      </span>
    </div>
  )
}

/** Format seconds for In/Out display. */
export function formatEffectTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1)
  return `${m}:${sec.padStart(4, '0')}`
}
