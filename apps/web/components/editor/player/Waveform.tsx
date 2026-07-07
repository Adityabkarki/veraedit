'use client'

/**
 * Waveform — canvas-based audio waveform visualisation.
 *
 * Peaks are pre-computed and cached per zoom level (Phase 15).
 * Reuses AudioAnalysisTrack amplitudes when provided.
 */

import { useEffect, useRef } from 'react'
import { getCachedWaveformPeaks, type AnalysisFrameLike } from '@/lib/editor/waveformPeaks'

interface WaveformProps {
  /** Total duration in seconds (determines bar count) */
  duration:     number
  /** Current playback position in seconds */
  currentTime:  number
  /** Track accent colour for the played region */
  color?:       string
  /** Component height in px */
  height?:      number
  className?:   string
  /** Stable id for peak cache (e.g. clip or asset id) */
  sourceId?:    string
  /** Timeline zoom — drives peak cache bucket */
  pixelsPerSecond?: number
  /** Optional encoded analysis frames for real peaks */
  analysisFrames?: AnalysisFrameLike[]
}

const PLAYED_ALPHA   = 0.9
const UNPLAYED_ALPHA = 0.35
const BAR_GAP        = 1

export function Waveform({
  duration,
  currentTime,
  color    = '#8B5CF6',
  height   = 36,
  className = '',
  sourceId,
  pixelsPerSecond = 50,
  analysisFrames,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx    = canvas.getContext('2d')
    if (!ctx) return

    const dpr    = window.devicePixelRatio || 1
    const W      = canvas.offsetWidth
    const H      = height
    canvas.width  = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)

    if (duration <= 0 || W <= 0) return

    const barW    = 3
    const step    = barW + BAR_GAP
    const nBars   = Math.floor(W / step)
    const peaks   = getCachedWaveformPeaks({
      sourceId,
      duration,
      barCount: nBars,
      pixelsPerSecond,
      analysisFrames,
    })

    const playedFraction = Math.min(1, currentTime / Math.max(1, duration))
    const playedX        = playedFraction * W

    for (let i = 0; i < nBars; i++) {
      const x         = i * step
      const amplitude = peaks[i]?.amplitude ?? 0.5
      const barH      = Math.max(2, amplitude * (H * 0.85))
      const y         = (H - barH) / 2

      const played  = x < playedX
      const alpha   = played ? PLAYED_ALPHA : UNPLAYED_ALPHA

      ctx.globalAlpha = alpha
      ctx.fillStyle   = color
      ctx.fillRect(x, y, barW, barH)
    }

    ctx.globalAlpha = 1
  }, [duration, currentTime, color, height, sourceId, pixelsPerSecond, analysisFrames])

  return (
    <canvas
      ref={canvasRef}
      data-testid="waveform-canvas"
      aria-label="Audio waveform"
      className={`w-full block ${className}`}
      style={{ height }}
    />
  )
}
