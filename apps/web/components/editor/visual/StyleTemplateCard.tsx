'use client'

import type { StylePreset } from '@/lib/styleTransfer'
import {
  coverageFromPreset,
  gapReportFromPreset,
  type StyleGapReport,
} from '@/lib/styleGapReport'

export function CoverageChip({ coverage }: { coverage: number }) {
  const color =
    coverage >= 80
      ? 'bg-status-success/15 text-status-success'
      : coverage >= 50
        ? 'bg-status-warning/15 text-status-warning'
        : 'bg-status-error/15 text-status-error'
  return (
    <span
      data-testid="coverage-chip"
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${color}`}
    >
      {coverage}% will apply
    </span>
  )
}

export function EffectsList({ gapReport }: { gapReport: StyleGapReport }) {
  return (
    <div data-testid="effects-gap-list" className="space-y-0.5 mt-1.5">
      {gapReport.implemented.map((item) => (
        <div key={item.toolbox_id} className="flex items-center gap-1.5 text-[10px]">
          <span className="text-status-success" aria-hidden="true">✓</span>
          <span className="text-text-secondary">{item.display_name}</span>
        </div>
      ))}
      {gapReport.partial.map((item) => (
        <div key={item.toolbox_id} className="flex items-center gap-1.5 text-[10px]">
          <span className="text-status-warning" aria-hidden="true">~</span>
          <span className="text-text-disabled">{item.display_name}</span>
          <span className="text-text-disabled">(coming soon)</span>
        </div>
      ))}
      {gapReport.unresolvable.map((item, i) => (
        <div key={`unres-${i}`} className="flex items-center gap-1.5 text-[10px]">
          <span className="text-status-error/70" aria-hidden="true">✗</span>
          <span className="text-text-disabled line-through">{item.raw_description}</span>
        </div>
      ))}
    </div>
  )
}

interface StyleTemplateCardProps {
  preset: StylePreset
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}

export function StyleTemplateCard({
  preset,
  selected,
  onSelect,
  onDelete,
}: StyleTemplateCardProps) {
  const gapReport = gapReportFromPreset(preset)
  const coverage = coverageFromPreset(preset)
  const editCount = preset.edit_event_count ?? 0
  const duration = Math.round(preset.reference_duration_s ?? 0)

  return (
    <li
      data-testid={`style-preset-${preset.id}`}
      className={[
        'flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors',
        selected
          ? 'border-accent bg-accent/10'
          : 'border-bg-overlay hover:border-text-disabled',
      ].join(' ')}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{preset.name}</p>
            <p className="text-[10px] text-text-disabled mt-0.5">
              {editCount} edit{editCount !== 1 ? 's' : ''} detected
              {duration > 0 ? ` · ${duration}s reference` : ''}
              {preset.has_vision ? ' · vision' : ''}
            </p>
          </div>
          {gapReport && <CoverageChip coverage={coverage} />}
        </div>

        {gapReport && <EffectsList gapReport={gapReport} />}

        {!gapReport && preset.detected_effects && preset.detected_effects.length > 0 && (
          <p className="text-[10px] text-text-secondary">
            {preset.detected_effects.slice(0, 3).join(', ')}
          </p>
        )}

        {coverage > 0 && coverage < 50 && (
          <p className="text-[10px] text-status-warning bg-status-warning/10 rounded p-1.5 leading-relaxed">
            Less than half of the detected effects can be applied automatically. Apply what is
            supported, then add the rest from Effects.
          </p>
        )}

        {preset.source_url && !preset.source_url.startsWith('upload://') && (
          <a
            href={preset.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-accent hover:underline truncate block"
          >
            Source ↗
          </a>
        )}
        {preset.source_url?.startsWith('upload://') && (
          <p className="text-[10px] text-text-disabled truncate">
            From upload: {preset.source_url.replace('upload://', '')}
          </p>
        )}
      </div>
      <button
        type="button"
        data-testid={`style-delete-${preset.id}`}
        aria-label={`Delete ${preset.name}`}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="text-text-disabled hover:text-status-error text-xs px-1 flex-shrink-0"
      >
        ✕
      </button>
    </li>
  )
}
