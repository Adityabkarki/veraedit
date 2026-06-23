'use client'

/**
 * TimelineRuler — time axis above the clip lanes.
 *
 * - Renders tick marks and time labels spaced by the current zoom level.
 * - Clicking anywhere in the ruler sets the playhead to that time.
 * - Shows a small triangle at the playhead position.
 */

import { useCallback } from 'react'
import { useTimelineStore } from '@/stores/timelineStore'

interface TimelineRulerProps {
  /** Total duration of the timeline in seconds (determines ruler width) */
  totalDuration: number
}

const RULER_INTERVALS_S = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]

/** Returns the ruler tick interval in seconds for the current zoom */
export function getRulerInterval(pixelsPerSecond: number): number {
  const minIntervalS = 40 / pixelsPerSecond
  return RULER_INTERVALS_S.find((i) => i >= minIntervalS) ?? 60
}

function formatRulerLabel(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds < 1 ? 1 : 0)}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, '0')}`
}

export function TimelineRuler({ totalDuration }: TimelineRulerProps) {
  const { pixelsPerSecond, playheadTime, setPlayheadTime } = useTimelineStore()

  const totalWidth = totalDuration * pixelsPerSecond + 120 // extra right padding

  const interval = getRulerInterval(pixelsPerSecond)
  const tickCount = Math.ceil(totalDuration / interval) + 1
  const ticks = Array.from({ length: tickCount }, (_, i) => i * interval)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x    = e.clientX - rect.left
      const t    = Math.max(0, x / pixelsPerSecond)
      setPlayheadTime(t)
    },
    [pixelsPerSecond, setPlayheadTime]
  )

  const playheadX = playheadTime * pixelsPerSecond

  return (
    <div
      data-testid="timeline-ruler"
      className="relative h-6 select-none cursor-pointer flex-shrink-0"
      style={{ width: totalWidth }}
      onClick={handleClick}
    >
      {/* Ruler background */}
      <div className="absolute inset-0 bg-bg-elevated border-b border-bg-overlay" />

      {/* Tick marks */}
      {ticks.map((t) => {
        const x = t * pixelsPerSecond
        const isMajor = interval >= 1
          ? Number.isInteger(t)
          : true
        return (
          <div key={t} className="absolute top-0" style={{ left: x }}>
            <div
              className={`w-px ${isMajor ? 'h-3 bg-text-disabled' : 'h-2 bg-bg-overlay'}`}
            />
            {isMajor && (
              <span
                className="absolute top-3 text-[9px] font-mono text-text-disabled"
                style={{ transform: 'translateX(-50%)' }}
              >
                {formatRulerLabel(t)}
              </span>
            )}
          </div>
        )
      })}

      {/* Playhead triangle */}
      <div
        data-testid="ruler-playhead"
        className="absolute top-0 z-10 pointer-events-none"
        style={{ left: playheadX }}
      >
        {/* Triangle indicator */}
        <div
          className="w-0 h-0"
          style={{
            borderLeft:   '5px solid transparent',
            borderRight:  '5px solid transparent',
            borderTop:    '6px solid #C41E3A',
            transform:    'translateX(-5px)',
          }}
        />
        {/* Vertical line extending down */}
        <div
          className="w-px bg-accent"
          style={{ height: 8, marginLeft: -1 }}
        />
      </div>
    </div>
  )
}
