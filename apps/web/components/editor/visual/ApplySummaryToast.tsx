'use client'

import type { ApplySummary } from '@/lib/styleGapReport'

export function ApplySummaryToast({ summary }: { summary: ApplySummary }) {
  const notableSkips = summary.skipped.filter(
    (s) => s.reason !== 'below_strength_threshold',
  )

  return (
    <div
      data-testid="apply-summary-toast"
      className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-1"
    >
      <p className="font-medium text-text-primary">
        {summary.applied_count} effect{summary.applied_count !== 1 ? 's' : ''} applied
        {summary.skipped_count > 0 ? ` · ${summary.skipped_count} skipped` : ''}
      </p>
      {notableSkips.map((s, i) => (
        <p key={`${s.toolbox_id}-${i}`} className="text-text-disabled">
          {s.toolbox_id.replace(/_/g, ' ')} — {s.reason.replace(/_/g, ' ')}
        </p>
      ))}
    </div>
  )
}
