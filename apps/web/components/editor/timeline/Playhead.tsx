'use client'

/**
 * Playhead — vertical red line spanning all clip tracks.
 *
 * Positioned absolutely at `playheadTime * pixelsPerSecond`.
 * The drag handle in the ruler (TimelineRuler) controls the time;
 * this component only renders the visual line.
 */

import { useTimelineStore } from '@/stores/timelineStore'

interface PlayheadProps {
  /** Total number of tracks — used to size the line height */
  trackCount: number
  /** Height of each track row in px */
  trackHeight: number
}

const TRACK_HEIGHT = 40

export function Playhead({ trackCount, trackHeight = TRACK_HEIGHT }: PlayheadProps) {
  const { pixelsPerSecond, playheadTime } = useTimelineStore()

  const left   = playheadTime * pixelsPerSecond
  const height = trackCount * trackHeight

  return (
    <div
      data-testid="playhead"
      className="absolute top-0 z-20 pointer-events-none"
      style={{ left, height }}
      aria-hidden="true"
    >
      {/* Vertical line */}
      <div
        className="w-px h-full bg-accent"
        style={{ boxShadow: '0 0 4px rgba(196,30,58,0.6)' }}
      />
    </div>
  )
}
