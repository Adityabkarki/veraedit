'use client'

/**
 * ViralityBreakdown — popover shown when hovering over a virality score ring.
 *
 * Lists each scoring factor with points (positive = green, negative = red)
 * and a total score. Shows a tip at the bottom if provided.
 *
 * Positioning: the parent wraps the ring in `relative` and this component
 * uses `absolute` to position below it.
 */

import type { Short } from '@/stores/shortsStore'

interface ViralityBreakdownProps {
  short: Short
}

export function ViralityBreakdown({ short }: ViralityBreakdownProps) {
  const positive = short.viralityFactors.filter((f) => f.positive)
  const negative = short.viralityFactors.filter((f) => !f.positive)

  return (
    <div
      data-testid={`virality-breakdown-${short.id}`}
      className="absolute top-full mt-2 right-0 z-50 w-64
                 bg-bg-elevated border border-bg-overlay rounded-xl
                 shadow-2xl p-4 animate-fade-in text-left"
    >
      {/* Score header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-text-primary">
          Virality Score
        </span>
        <span className="text-xl font-bold text-accent">
          {short.viralityScore}
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-bg-overlay mb-3" />

      {/* Positive factors */}
      {positive.map((f) => (
        <div
          key={f.label}
          data-testid={`factor-positive-${short.id}`}
          className="flex items-center justify-between mb-1.5"
        >
          <span className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="text-status-success text-[10px]">✓</span>
            {f.label}
          </span>
          <span className="text-xs font-semibold text-status-success flex-shrink-0">
            +{f.points}
          </span>
        </div>
      ))}

      {/* Negative factors */}
      {negative.length > 0 && (
        <>
          <div className="h-px bg-bg-overlay my-2" />
          {negative.map((f) => (
            <div
              key={f.label}
              data-testid={`factor-negative-${short.id}`}
              className="flex items-center justify-between mb-1.5"
            >
              <span className="text-xs text-text-secondary flex items-center gap-1.5">
                <span className="text-status-warning text-[10px]">⚠</span>
                {f.label}
              </span>
              <span className="text-xs font-semibold text-status-warning flex-shrink-0">
                −{f.points}
              </span>
            </div>
          ))}
        </>
      )}

      {/* Tip */}
      {short.viralityTip && (
        <>
          <div className="h-px bg-bg-overlay mt-3 mb-2" />
          <p className="text-[11px] text-status-info leading-snug">
            💡 {short.viralityTip}
          </p>
        </>
      )}
    </div>
  )
}
