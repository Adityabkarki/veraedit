'use client'

/**
 * ShortFramingControls — pan the 9:16 crop window across horizontal video.
 */

import { useShortsStore } from '@/stores/shortsStore'
import { labelForPan } from '@/lib/shortFraming'
import type { Short } from '@/stores/shortsStore'

interface ShortFramingControlsProps {
  short: Short
}

export function ShortFramingControls({ short }: ShortFramingControlsProps) {
  const { setShortFraming, resetShortFramingAuto } = useShortsStore()
  const framing = short.framing
  const panX = framing.panX

  return (
    <div
      data-testid={`short-framing-${short.id}`}
      className="rounded-lg bg-bg-elevated p-2 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
          9:16 framing
        </p>
        <span className="text-[10px] text-text-secondary">{labelForPan(panX)}</span>
      </div>

      <p className="text-[10px] text-text-disabled leading-snug">
        Drag to pan the vertical crop across the frame. Auto centers on the speaker
        when AI detects a talking-head clip.
      </p>

      <div className="flex gap-1">
        <button
          type="button"
          data-testid={`framing-auto-${short.id}`}
          onClick={() => resetShortFramingAuto(short.id)}
          className={[
            'flex-1 py-1 rounded text-[10px] font-medium transition-colors',
            framing.mode === 'auto'
              ? 'bg-accent/20 text-accent'
              : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          Auto
        </button>
        <button
          type="button"
          data-testid={`framing-manual-${short.id}`}
          onClick={() => setShortFraming(short.id, { mode: 'manual' })}
          className={[
            'flex-1 py-1 rounded text-[10px] font-medium transition-colors',
            framing.mode === 'manual'
              ? 'bg-accent/20 text-accent'
              : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          Manual
        </button>
      </div>

      <label className="block">
        <div className="flex justify-between text-[10px] text-text-disabled mb-0.5">
          <span>Pan left</span>
          <span data-testid={`framing-pan-value-${short.id}`}>{Math.round(panX * 100)}%</span>
          <span>Pan right</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(panX * 100)}
          onChange={(e) =>
            setShortFraming(short.id, {
              panX: Number(e.target.value) / 100,
              mode: 'manual',
            })
          }
          data-testid={`framing-pan-slider-${short.id}`}
          className="w-full accent-accent"
          aria-label="Pan crop horizontally"
        />
      </label>

      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setShortFraming(short.id, { panX: 0, mode: 'manual' })}
          className="flex-1 py-0.5 text-[10px] rounded bg-bg-overlay text-text-secondary hover:text-text-primary"
        >
          Left
        </button>
        <button
          type="button"
          onClick={() => setShortFraming(short.id, { panX: 0.5, mode: 'manual' })}
          className="flex-1 py-0.5 text-[10px] rounded bg-bg-overlay text-text-secondary hover:text-text-primary"
        >
          Center
        </button>
        <button
          type="button"
          onClick={() => setShortFraming(short.id, { panX: 1, mode: 'manual' })}
          className="flex-1 py-0.5 text-[10px] rounded bg-bg-overlay text-text-secondary hover:text-text-primary"
        >
          Right
        </button>
      </div>
    </div>
  )
}
