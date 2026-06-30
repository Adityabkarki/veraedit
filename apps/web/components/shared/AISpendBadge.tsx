'use client'

import { useEffect, useState } from 'react'
import {
  ACTION_LABELS,
  getProjectSpend,
  type ProjectSpend,
} from '@/lib/aiSpendApi'

interface AISpendBadgeProps {
  projectId: string
}

export function AISpendBadge({ projectId }: AISpendBadgeProps) {
  const [spend, setSpend] = useState<ProjectSpend | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      const res = await getProjectSpend(projectId)
      if (!cancelled && res.data) setSpend(res.data)
    }

    void poll()
    const interval = window.setInterval(poll, 4000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [projectId])

  if (!spend) return null

  const breakdown = spend.by_action ?? {}

  return (
    <div className="relative" data-testid="ai-spend-badge">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex items-center gap-1.5 text-xs bg-bg-overlay hover:bg-bg-surface px-3 py-1.5 rounded-full transition-colors text-text-secondary"
        aria-expanded={expanded}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-status-success" aria-hidden />
        <span className="font-medium text-text-primary">${spend.total_usd.toFixed(3)}</span>
        <span>AI spend</span>
      </button>

      {expanded && (
        <div className="absolute top-full right-0 mt-2 bg-bg-surface border border-border rounded-xl shadow-lg w-64 p-3 z-50">
          <p className="text-xs font-medium text-text-primary mb-2">
            This project&apos;s AI spend
          </p>
          <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
            {Object.entries(breakdown).length === 0 ? (
              <p className="text-xs text-text-disabled">No AI calls recorded yet.</p>
            ) : (
              Object.entries(breakdown).map(([action, cost]) => (
                <div key={action} className="flex justify-between text-xs gap-2">
                  <span className="text-text-secondary truncate">
                    {ACTION_LABELS[action] ?? action}
                  </span>
                  <span className="font-medium text-text-primary flex-shrink-0">
                    ${cost.toFixed(4)}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border pt-2 flex justify-between text-xs font-semibold text-text-primary">
            <span>Total</span>
            <span>${spend.total_usd.toFixed(4)}</span>
          </div>
          <p className="text-[10px] text-text-disabled mt-2">
            {spend.call_count} AI call{spend.call_count === 1 ? '' : 's'} so far
            {spend.budget_used_percent > 0 && (
              <> · {Math.round(spend.budget_used_percent)}% of hourly budget</>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
