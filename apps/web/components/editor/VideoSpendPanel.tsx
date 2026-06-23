'use client'

/**
 * Compact, collapsible AI spend for the current video.
 */

import { useEffect, useState } from 'react'
import { fetchPipelineCosts, type PipelineCostsResponse } from '@/lib/pipelineApi'

function fmtUsd(n: number): string {
  if (n < 0.0001) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(3)}`
}

interface VideoSpendPanelProps {
  projectId: string
  assetId: string
  refreshKey?: string | number
}

export function VideoSpendPanel({ projectId, assetId, refreshKey }: VideoSpendPanelProps) {
  const [data, setData] = useState<PipelineCostsResponse | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetchPipelineCosts(projectId, assetId)
      if (!cancelled && res.data) setData(res.data)
    })()
    return () => { cancelled = true }
  }, [projectId, assetId, refreshKey])

  const spend = data?.spend
  if (!spend || (spend.total_usd <= 0 && spend.call_count === 0)) {
    return null
  }

  const el = spend.elevenlabs_usd ?? 0
  const oa = spend.openai_usd ?? 0

  return (
    <div
      data-testid="video-spend-panel"
      className="flex-shrink-0 border-b border-bg-overlay bg-bg-elevated/60 px-4 py-1"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left py-0.5"
        aria-expanded={expanded}
      >
        <span className="text-[10px] text-text-secondary">
          AI spend{' '}
          <span className="font-mono font-semibold text-accent">{fmtUsd(spend.total_usd)}</span>
          <span className="text-text-disabled ml-2">
            EL {fmtUsd(el)} · OAI {fmtUsd(oa)}
          </span>
        </span>
        <span className="text-[10px] text-text-disabled">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && spend.by_action && spend.by_action.length > 0 && (
        <ul className="mt-1 mb-1 space-y-0.5 max-h-24 overflow-y-auto">
          {spend.by_action.map((row) => (
            <li
              key={row.task}
              className="flex justify-between gap-2 text-[10px] text-text-disabled"
            >
              <span className="truncate" title={row.model}>
                {row.label}
                {row.call_count > 1 ? ` ×${row.call_count}` : ''}
              </span>
              <span className="font-mono shrink-0 text-text-secondary">
                {fmtUsd(row.cost_usd)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
