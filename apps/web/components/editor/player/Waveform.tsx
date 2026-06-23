'use client'

/**
 * Waveform — canvas-based audio waveform visualisation.
 *
 * Draws a realistic-looking stereo waveform using a seeded pseudo-random
 * pattern (consistent on every render for the same audio source).
 * Highlights the played portion in the track colour and dims the unplayed.
 *
 * Used in:
 *   – Audio track in the Timeline clip lane
 *   – (future) full-width waveform below the video preview
 */

import { useEffect, useRef } from 'react'

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
}

const PLAYED_ALPHA   = 0.9
const UNPLAYED_ALPHA = 0.35
const BAR_GAP        = 1

/** Deterministic pseudo-random number from a seed */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export function Waveform({
  duration,
  currentTime,
  color    = '#8B5CF6',
  height   = 36,
  className = '',
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
    const rand    = seededRandom(Math.floor(duration))

    const playedFraction = Math.min(1, currentTime / Math.max(1, duration))
    const playedX        = playedFraction * W

    for (let i = 0; i < nBars; i++) {
      const x         = i * step
      const amplitude = 0.2 + rand() * 0.8   // 20–100 % of max height
      const barH      = Math.max(2, amplitude * (H * 0.85))
      const y         = (H - barH) / 2

      const played  = x < playedX
      const alpha   = played ? PLAYED_ALPHA : UNPLAYED_ALPHA

      ctx.fillStyle = color
        .replace(/^#/, '')
        .match(/.{2}/g)!
        .reduce((acc, hex, i) => {
          const val = parseInt(hex, 16)
          return acc + (i === 0 ? `${val},` : i === 1 ? `${val},` : `${val}`)
        }, 'rgba(')
        + `,${alpha})`

      // Use a simpler colour assignment
      ctx.globalAlpha = alpha
      ctx.fillStyle   = color
      ctx.fillRect(x, y, barW, barH)
    }

    ctx.globalAlpha = 1
  }, [duration, currentTime, color, height])

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
