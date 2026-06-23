'use client'

/**
 * SpeedControl — playback speed selector popover.
 *
 * Shows the current rate as a compact label (e.g. "1×").
 * Clicking opens a small popover with all available rates.
 * Selected rate is highlighted. Selecting a rate updates playerStore
 * and closes the popover.
 */

import { useState, useEffect, useRef } from 'react'
import { usePlayerStore, PLAYBACK_RATES, type PlaybackRate } from '@/stores/playerStore'

export function SpeedControl() {
  const { playbackRate, setPlaybackRate } = usePlayerStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const select = (r: PlaybackRate) => {
    setPlaybackRate(r)
    setOpen(false)
  }

  return (
    <div data-testid="speed-control" className="relative" ref={ref}>
      <button
        data-testid="speed-control-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Playback speed: ${playbackRate}×`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="px-2 py-1 rounded text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors min-w-[2.5rem] text-center"
      >
        {playbackRate === 1 ? '1×' : `${playbackRate}×`}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select playback speed"
          className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 py-1 rounded-lg bg-bg-elevated border border-bg-overlay shadow-xl z-50 min-w-[4rem] animate-fade-in"
        >
          {PLAYBACK_RATES.map((r) => (
            <button
              key={r}
              role="option"
              aria-selected={r === playbackRate}
              data-testid={`speed-option-${r}`}
              onClick={() => select(r)}
              className={[
                'w-full text-center px-3 py-1.5 text-xs font-mono transition-colors',
                r === playbackRate
                  ? 'text-accent bg-accent/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
              ].join(' ')}
            >
              {r}×
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
