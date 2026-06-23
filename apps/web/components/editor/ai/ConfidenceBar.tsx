'use client'

/**
 * ConfidenceBar — horizontal progress bar that shows AI confidence 0–100%.
 *
 * Color tiers:
 *   ≥ 80  green  (high confidence — safe to auto-accept)
 *   50–79 amber  (medium — review before accepting)
 *   < 50  red    (low — treat with caution)
 */

interface ConfidenceBarProps {
  confidence: number   // 0–100
  showLabel?: boolean
  className?: string
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 80) return '#22C55E'   // status-success
  if (confidence >= 50) return '#F59E0B'   // status-warning
  return '#EF4444'                          // status-error
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'High'
  if (confidence >= 50) return 'Medium'
  return 'Low'
}

export function ConfidenceBar({ confidence, showLabel = true, className = '' }: ConfidenceBarProps) {
  const color = getConfidenceColor(confidence)
  const label = getConfidenceLabel(confidence)
  const pct   = Math.max(0, Math.min(100, confidence))

  return (
    <div
      data-testid="confidence-bar"
      className={`flex items-center gap-2 ${className}`}
    >
      {/* Track */}
      <div className="flex-1 h-1.5 rounded-full bg-bg-overlay overflow-hidden">
        <div
          data-testid="confidence-bar-fill"
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: color }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`AI confidence: ${pct}%`}
        />
      </div>

      {/* Label */}
      {showLabel && (
        <span
          data-testid="confidence-label"
          className="text-xs font-semibold tabular-nums flex-shrink-0"
          style={{ color }}
        >
          {pct}%
        </span>
      )}
    </div>
  )
}
