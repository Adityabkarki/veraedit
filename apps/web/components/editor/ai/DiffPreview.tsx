'use client'

/**
 * DiffPreview — "What will this change?" expandable section.
 *
 * Shows a before/after list of diff entries:
 *   remove  → red   line with ✗  (content being cut)
 *   add     → green line with ✓  (content being added)
 *   keep    → grey  line with ·  (context, unchanged)
 */

import type { DiffEntry } from '@/stores/suggestionsStore'

interface DiffPreviewProps {
  diff: DiffEntry[]
}

const KIND_STYLES: Record<DiffEntry['kind'], { icon: string; color: string; bg: string }> = {
  remove: { icon: '✕', color: 'text-status-error',   bg: 'bg-status-error/10'   },
  add:    { icon: '✓', color: 'text-status-success',  bg: 'bg-status-success/10' },
  keep:   { icon: '·', color: 'text-text-disabled',   bg: ''                     },
}

function formatTimeRange(tr: { start: number; end: number }): string {
  const fmt = (s: number) => {
    const m  = Math.floor(s / 60)
    const ss = (s % 60).toFixed(1)
    return m > 0 ? `${m}:${ss.padStart(4, '0')}` : `${ss}s`
  }
  return `${fmt(tr.start)} – ${fmt(tr.end)}`
}

export function DiffPreview({ diff }: DiffPreviewProps) {
  return (
    <div data-testid="diff-preview" className="space-y-1 mt-2">
      {diff.map((entry, i) => {
        const style = KIND_STYLES[entry.kind]
        return (
          <div
            key={i}
            data-testid={`diff-entry-${entry.kind}`}
            className={`flex items-start gap-2 px-2 py-1 rounded text-xs ${style.bg}`}
          >
            <span className={`font-bold mt-0.5 flex-shrink-0 ${style.color}`}>
              {style.icon}
            </span>
            <span className="text-text-secondary flex-1">{entry.description}</span>
            {entry.timeRange && (
              <span className="text-text-disabled font-mono text-[10px] flex-shrink-0 mt-0.5">
                {formatTimeRange(entry.timeRange)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
