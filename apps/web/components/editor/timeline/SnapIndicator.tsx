'use client'

/**
 * SnapIndicator — orange vertical line shown when a clip snaps
 * to a nearby edge or the playhead during drag.
 *
 * Hidden when snapIndicatorTime is null.
 */

import { useTimelineStore } from '@/stores/timelineStore'

interface SnapIndicatorProps {
  trackCount:  number
  trackHeight: number
}

export function SnapIndicator({ trackCount, trackHeight }: SnapIndicatorProps) {
  const { pixelsPerSecond, snapIndicatorTime } = useTimelineStore()

  if (snapIndicatorTime === null) return null

  const left   = snapIndicatorTime * pixelsPerSecond
  const height = trackCount * trackHeight

  return (
    <div
      data-testid="snap-indicator"
      className="absolute top-0 z-30 pointer-events-none"
      style={{ left, height }}
      aria-hidden="true"
    >
      <div
        className="w-px h-full"
        style={{
          background:  '#F97316',
          boxShadow:   '0 0 6px rgba(249,115,22,0.8)',
        }}
      />
    </div>
  )
}
