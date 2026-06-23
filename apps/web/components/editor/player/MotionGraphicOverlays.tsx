'use client'

/**
 * AE-style motion graphic overlays — editable metrics, SVG arrows, conflict frames.
 */

import { useCallback } from 'react'
import type { Clip } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'

interface MotionProps {
  clip: Clip
  primary: string
  accent: string
  interactive?: boolean
}

function EditableField({
  value,
  placeholder,
  className,
  onChange,
  interactive,
  testId,
}: {
  value: string
  placeholder: string
  className: string
  onChange: (v: string) => void
  interactive?: boolean
  testId?: string
}) {
  if (!interactive) {
    return (
      <span className={className} data-testid={testId}>
        {value || placeholder}
      </span>
    )
  }
  return (
    <input
      data-testid={testId}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      className={`${className} bg-transparent border-none outline-none focus:ring-1 focus:ring-white/40 rounded px-0.5 min-w-[3ch] w-full`}
    />
  )
}

/** Slate verification card — slides in from the right with metric + label. */
export function DataCardOverlay({ clip, primary, accent, interactive }: MotionProps) {
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)
  const metric = clip.effects?.displayValue ?? ''
  const label = clip.effects?.secondaryText ?? ''

  const patch = useCallback(
    (p: { displayValue?: string; secondaryText?: string }) => {
      updateOverlayClip(clip.id, p)
    },
    [clip.id, updateOverlayClip],
  )

  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      data-visual-type="data_card"
      className="motion-gfx-data-card w-full"
    >
      <div
        className="rounded-lg overflow-hidden shadow-2xl border border-white/15 backdrop-blur-md"
        style={{
          background: 'linear-gradient(145deg, rgba(15,23,42,0.94) 0%, rgba(30,41,59,0.88) 100%)',
          boxShadow: `0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        <div className="flex">
          <div className="w-1 flex-shrink-0" style={{ background: accent }} />
          <div className="flex-1 px-4 py-3 min-w-[140px]">
            <EditableField
              testId={`data-card-metric-${clip.id}`}
              value={metric}
              placeholder="12,500"
              interactive={interactive}
              onChange={(v) => patch({ displayValue: v })}
              className="block text-2xl md:text-3xl font-black text-white tabular-nums leading-none tracking-tight"
            />
            <EditableField
              testId={`data-card-label-${clip.id}`}
              value={label}
              placeholder="Metric label"
              interactive={interactive}
              onChange={(v) => patch({ secondaryText: v })}
              className="block mt-1.5 text-[10px] md:text-xs font-semibold uppercase tracking-widest text-white/55"
            />
            <div className="mt-2.5 h-0.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full motion-gfx-data-bar"
                style={{ background: `linear-gradient(90deg, ${primary}, ${accent})` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Vector arrow — resizable length + rotation (not a text label). */
export function ArrowFlowOverlay({ clip, accent }: MotionProps) {
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      data-visual-type="arrow_flow"
      className="relative w-full"
    >
      <svg
        viewBox="0 0 200 48"
        className="w-full h-auto drop-shadow-lg"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id={`arrowhead-${clip.id}`}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 8 4, 0 8" fill={accent} />
          </marker>
        </defs>
        <path
          d="M 8 28 Q 70 8, 120 24 T 188 20"
          fill="none"
          stroke={accent}
          strokeWidth="4"
          strokeLinecap="round"
          markerEnd={`url(#arrowhead-${clip.id})`}
          opacity="0.95"
        />
        <path
          d="M 8 28 Q 70 8, 120 24 T 188 20"
          fill="none"
          stroke="white"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.25"
        />
      </svg>
    </div>
  )
}

/** Pulsing dual-tone conflict frame — highlights a region, not a text card. */
export function ConflictBoxOverlay({ clip, primary, accent, interactive }: MotionProps) {
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)
  const note = clip.effects?.displayValue ?? ''

  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      data-visual-type="conflict_box"
      className="w-full h-full min-h-[72px] relative motion-gfx-conflict-pulse rounded-md"
    >
      <div
        className="absolute inset-0 rounded-md motion-gfx-conflict-border"
        style={{
          boxShadow: `inset 0 0 0 3px ${primary}cc, 0 0 24px ${primary}44`,
        }}
      />
      <div
        className="absolute inset-[3px] rounded-sm"
        style={{
          background: `linear-gradient(135deg, ${primary}18 0%, transparent 45%, ${accent}14 100%)`,
          borderLeft: `3px solid ${primary}`,
          borderRight: `3px solid ${accent}`,
        }}
      />
      {interactive && (
        <div className="absolute bottom-1 left-0 right-0 px-2" onPointerDown={(e) => e.stopPropagation()}>
          <input
            data-testid={`conflict-note-${clip.id}`}
            type="text"
            value={note}
            placeholder="Optional note (leave empty for frame only)"
            onChange={(e) => updateOverlayClip(clip.id, { displayValue: e.target.value })}
            className="w-full text-[9px] text-center bg-black/50 border border-white/15 rounded px-1 py-0.5 text-white/80 placeholder:text-white/35 outline-none focus:border-white/40"
          />
        </div>
      )}
      {!interactive && note && (
        <p className="absolute bottom-1 left-0 right-0 text-[9px] text-center text-white/70 px-2">{note}</p>
      )}
    </div>
  )
}

/** Upper-third context label — compact floating tag. */
export function UpperThirdLabelOverlay({ clip, primary, interactive }: MotionProps) {
  const updateOverlayClip = useTimelineStore((s) => s.updateOverlayClip)
  const text = clip.effects?.displayValue ?? ''

  return (
    <div data-testid={`visual-overlay-${clip.id}`} data-visual-type="upper_third_label">
      <div
        className="px-3 py-1.5 rounded-md shadow-lg border border-white/20 backdrop-blur-sm"
        style={{ background: `${primary}dd` }}
      >
        <EditableField
          testId={`upper-third-text-${clip.id}`}
          value={text}
          placeholder="Context label"
          interactive={interactive}
          onChange={(v) => updateOverlayClip(clip.id, { displayValue: v })}
          className="text-xs font-bold text-white uppercase tracking-wide whitespace-nowrap"
        />
      </div>
    </div>
  )
}
