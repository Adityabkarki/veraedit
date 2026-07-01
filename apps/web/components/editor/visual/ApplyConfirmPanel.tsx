'use client'

import type { StyleGapReport } from '@/lib/styleGapReport'

interface ApplyConfirmPanelProps {
  presetName: string
  gapReport: StyleGapReport
  onConfirm: () => void
  onCancel: () => void
}

export function ApplyConfirmPanel({
  presetName,
  gapReport,
  onConfirm,
  onCancel,
}: ApplyConfirmPanelProps) {
  const willApply = gapReport.implemented
  const willSkipCount = gapReport.partial.length + gapReport.unresolvable.length

  return (
    <div
      data-testid="apply-confirm-panel"
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apply-confirm-title"
    >
      <div className="bg-bg-surface border border-bg-overlay rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl">
        <div>
          <h3 id="apply-confirm-title" className="font-semibold text-sm text-text-primary">
            Apply &ldquo;{presetName}&rdquo;
          </h3>
          <p className="text-[11px] text-text-secondary mt-1">
            Review what will be placed on your timeline before applying.
          </p>
        </div>

        {willApply.length > 0 && (
          <div>
            <p className="text-[10px] text-status-success font-medium uppercase tracking-wide mb-1">
              Will apply ({willApply.length})
            </p>
            {willApply.map((item) => (
              <div key={item.toolbox_id} className="flex items-center gap-2 py-0.5">
                <span className="text-status-success text-xs" aria-hidden="true">✓</span>
                <span className="text-xs text-text-secondary">{item.display_name}</span>
              </div>
            ))}
          </div>
        )}

        {willSkipCount > 0 && (
          <div>
            <p className="text-[10px] text-text-disabled font-medium uppercase tracking-wide mb-1">
              Cannot apply ({willSkipCount})
            </p>
            {gapReport.partial.map((item) => (
              <div key={item.toolbox_id} className="flex items-center gap-2 py-0.5">
                <span className="text-status-warning text-xs" aria-hidden="true">~</span>
                <span className="text-xs text-text-disabled">
                  {item.display_name} — not supported yet
                </span>
              </div>
            ))}
            {gapReport.unresolvable.map((item, i) => (
              <div key={`skip-${i}`} className="flex items-center gap-2 py-0.5">
                <span className="text-status-error/60 text-xs" aria-hidden="true">✗</span>
                <span className="text-xs text-text-disabled line-through">
                  {item.raw_description}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-xs border border-bg-overlay py-2 rounded-lg text-text-secondary hover:bg-bg-overlay"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="apply-confirm-btn"
            onClick={onConfirm}
            className="flex-1 text-xs bg-accent text-white py-2 rounded-lg font-medium hover:bg-accent-glow"
          >
            Apply {willApply.length} effect{willApply.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
