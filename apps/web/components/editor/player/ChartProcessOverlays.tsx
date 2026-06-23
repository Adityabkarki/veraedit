'use client'

/**
 * Chart & process diagram overlays — preview renderers.
 */

import type { Clip } from '@/stores/timelineStore'

interface Props {
  clip: Clip
  primary: string
  accent: string
}

function CardShell({
  clip,
  children,
  className = '',
}: {
  clip: Clip
  children: React.ReactNode
  className?: string
}) {
  const full = clip.effects?.overlayMode === 'fullscreen'
  return (
    <div
      data-testid={`visual-overlay-${clip.id}`}
      className={`pointer-events-none w-full h-full flex items-center justify-center ${full ? 'p-8 bg-black/70' : 'p-3'} ${className}`}
    >
      <div
        className={`w-full rounded-2xl px-5 py-4 bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl ${
          full ? 'max-w-3xl h-full max-h-full flex flex-col justify-center' : 'max-w-lg'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

export function HorizontalBarOverlay({ clip, primary, accent }: Props) {
  const items = (clip.effects?.displayValue || 'A|B|C').split('|').map((s) => s.trim()).filter(Boolean)
  const max = Math.max(items.length, 1)
  return (
    <CardShell clip={clip}>
      <p className="text-sm font-semibold text-white mb-3">{clip.effects?.secondaryText || 'Comparison'}</p>
      <div className="space-y-2">
        {items.slice(0, 5).map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-white/70 w-16 truncate">{label}</span>
            <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${55 + (i * 12) % 40}%`, background: i === 0 ? accent : `${primary}99` }}
              />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

export function StackedBarOverlay({ clip, primary, accent }: Props) {
  const title = clip.effects?.displayValue || 'Stacked metric'
  const segments = [28, 22, 18, 32]
  return (
    <CardShell clip={clip}>
      <p className="text-sm font-semibold text-white mb-2">{title}</p>
      <p className="text-[10px] text-white/60 mb-3">{clip.effects?.secondaryText}</p>
      <div className="flex h-8 rounded-lg overflow-hidden">
        {segments.map((w, i) => (
          <div key={i} style={{ width: `${w}%`, background: i % 2 ? accent : primary }} />
        ))}
      </div>
    </CardShell>
  )
}

export function AreaChartOverlay({ clip, primary, accent }: Props) {
  const title = clip.effects?.displayValue || 'Trend'
  return (
    <CardShell clip={clip}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="text-xs text-emerald-400 font-bold mt-0.5">{clip.effects?.secondaryText}</p>
      <svg viewBox="0 0 120 40" className="w-full h-14 mt-2" aria-hidden="true">
        <polyline fill={`${primary}44`} stroke="none" points="0,35 20,28 40,32 60,18 80,22 100,8 120,12 120,40 0,40" />
        <polyline fill="none" stroke={accent} strokeWidth="2.5" points="0,35 20,28 40,32 60,18 80,22 100,8 120,12" />
      </svg>
    </CardShell>
  )
}

export function PieChartOverlay({ clip, accent }: Props) {
  const value = clip.effects?.displayValue || '45%'
  return (
    <CardShell clip={clip}>
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="14" fill="none" stroke="#ffffff22" strokeWidth="4" />
            <circle cx="18" cy="18" r="14" fill="none" stroke={accent} strokeWidth="4" strokeDasharray="45 100" />
          </svg>
        </div>
        <div>
          <p className="text-2xl font-black text-white">{value}</p>
          <p className="text-[10px] text-white/60">{clip.effects?.secondaryText}</p>
        </div>
      </div>
    </CardShell>
  )
}

export function GaugeChartOverlay({ clip, primary, accent }: Props) {
  const value = clip.effects?.displayValue || '78%'
  return (
    <CardShell clip={clip}>
      <p className="text-center text-[10px] text-white/60 mb-1">{clip.effects?.secondaryText}</p>
      <svg viewBox="0 0 100 55" className="w-full h-20" aria-hidden="true">
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#ffffff22" strokeWidth="8" strokeLinecap="round" />
        <path d="M10 50 A40 40 0 0 1 75 22" fill="none" stroke={accent} strokeWidth="8" strokeLinecap="round" />
      </svg>
      <p className="text-center text-2xl font-black text-white -mt-6">{value}</p>
    </CardShell>
  )
}

export function ProgressBarOverlay({ clip, primary, accent }: Props) {
  const value = clip.effects?.displayValue || '72%'
  const pct = Number.parseInt(value, 10) || 72
  return (
    <CardShell clip={clip}>
      <p className="text-sm font-semibold text-white mb-1">{clip.effects?.secondaryText || 'Progress'}</p>
      <div className="h-3 rounded-full bg-white/10 overflow-hidden mt-2">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(90deg, ${primary}, ${accent})` }} />
      </div>
      <p className="text-right text-lg font-black text-white mt-2">{value}</p>
    </CardShell>
  )
}

export function FlowchartOverlay({ clip, primary, accent }: Props) {
  const steps = (clip.effects?.displayValue || 'Start → Process → End').split(/→|->/).map((s) => s.trim())
  return (
    <CardShell clip={clip}>
      <p className="text-[10px] text-white/60 mb-3">{clip.effects?.secondaryText}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {steps.slice(0, 4).map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="px-3 py-2 rounded-lg text-xs font-semibold text-white border border-white/20" style={{ background: `${primary}66` }}>
              {step}
            </div>
            {i < steps.length - 1 && <span className="text-accent text-lg">→</span>}
          </div>
        ))}
      </div>
    </CardShell>
  )
}

export function ProcessFlowOverlay({ clip, accent }: Props) {
  return (
    <CardShell clip={clip}>
      <p className="text-sm font-semibold text-white text-center mb-3">{clip.effects?.secondaryText || 'Process'}</p>
      <svg viewBox="0 0 200 48" className="w-full h-12" aria-hidden="true">
        <line x1="20" y1="24" x2="150" y2="24" stroke={accent} strokeWidth="4" />
        <polygon points="155,24 145,18 145,30" fill={accent} />
      </svg>
      <p className="text-center text-xs text-white/80 mt-2">{clip.effects?.displayValue}</p>
    </CardShell>
  )
}

export function FunnelChartOverlay({ clip, primary, accent }: Props) {
  const stages = (clip.effects?.displayValue || 'Top|Middle|Bottom').split(/→|->|\|/).map((s) => s.trim())
  const widths = [100, 72, 48]
  return (
    <CardShell clip={clip}>
      <p className="text-[10px] text-white/60 mb-3 text-center">{clip.effects?.secondaryText}</p>
      <div className="space-y-1.5 flex flex-col items-center">
        {stages.slice(0, 3).map((label, i) => (
          <div
            key={i}
            className="py-2 rounded text-center text-xs font-semibold text-white"
            style={{ width: `${widths[i]}%`, background: i === 0 ? primary : `${accent}${i === 1 ? 'CC' : '88'}` }}
          >
            {label}
          </div>
        ))}
      </div>
    </CardShell>
  )
}

export function TimelineStepsOverlay({ clip, primary, accent }: Props) {
  const steps = (clip.effects?.displayValue || 'Step 1 | Step 2 | Step 3').split(/\|/).map((s) => s.trim())
  return (
    <CardShell clip={clip}>
      <p className="text-[10px] text-white/60 mb-3">{clip.effects?.secondaryText}</p>
      <div className="flex items-center justify-between gap-1">
        {steps.slice(0, 4).map((step, i) => (
          <div key={i} className="flex-1 text-center">
            <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ background: i === steps.length - 1 ? accent : primary }} />
            <p className="text-[9px] text-white/80 leading-tight">{step}</p>
          </div>
        ))}
      </div>
      <div className="h-0.5 mt-2 rounded" style={{ background: `linear-gradient(90deg, ${primary}, ${accent})` }} />
    </CardShell>
  )
}

export function ProcessStepsOverlay({ clip, primary, accent }: Props) {
  const lines = (clip.effects?.displayValue || 'Plan, Build, Launch').split(/[,|•\n]/).map((s) => s.trim()).filter(Boolean)
  return (
    <CardShell clip={clip}>
      <p className="text-sm font-semibold text-white mb-2">{clip.effects?.secondaryText}</p>
      <ol className="space-y-2">
        {lines.slice(0, 5).map((line, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-white">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: accent }}>
              {i + 1}
            </span>
            <span>{line.replace(/^\d+\.\s*/, '')}</span>
          </li>
        ))}
      </ol>
    </CardShell>
  )
}

export function CycleDiagramOverlay({ clip, primary, accent }: Props) {
  const parts = (clip.effects?.displayValue || 'Create → Share → Learn').split(/→|->/).map((s) => s.trim())
  return (
    <CardShell clip={clip}>
      <p className="text-center text-[10px] text-white/60 mb-3">{clip.effects?.secondaryText}</p>
      <div className="relative w-36 h-36 mx-auto">
        <div className="absolute inset-4 rounded-full border-2 border-dashed" style={{ borderColor: `${accent}88` }} />
        {parts.slice(0, 3).map((part, i) => {
          const angle = (i / 3) * Math.PI * 2 - Math.PI / 2
          const x = 50 + Math.cos(angle) * 38
          const y = 50 + Math.sin(angle) * 38
          return (
            <span
              key={i}
              className="absolute text-[9px] font-semibold text-white px-1.5 py-0.5 rounded"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', background: primary }}
            >
              {part}
            </span>
          )
        })}
      </div>
    </CardShell>
  )
}

export function OrgChartOverlay({ clip, primary }: Props) {
  const parts = (clip.effects?.displayValue || 'Lead → Team A, Team B').split(/→/).map((s) => s.trim())
  const lead = parts[0] || 'Lead'
  const teams = (parts[1] || 'Team A, Team B').split(',').map((s) => s.trim())
  return (
    <CardShell clip={clip}>
      <div className="flex flex-col items-center gap-2">
        <div className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: primary }}>{lead}</div>
        <div className="w-px h-3 bg-white/30" />
        <div className="flex gap-2">
          {teams.slice(0, 3).map((t, i) => (
            <div key={i} className="px-3 py-1.5 rounded text-[10px] text-white bg-white/15 border border-white/20">{t}</div>
          ))}
        </div>
      </div>
    </CardShell>
  )
}

export function ChecklistOverlay({ clip, accent }: Props) {
  const items = (clip.effects?.displayValue || 'Task one, Task two').split(/[,|•\n]/).map((s) => s.trim()).filter(Boolean)
  return (
    <CardShell clip={clip}>
      <p className="text-sm font-semibold text-white mb-2">{clip.effects?.secondaryText}</p>
      <ul className="space-y-1.5">
        {items.slice(0, 6).map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-white">
            <span className="text-emerald-400">✓</span>
            <span style={{ color: i < 2 ? accent : undefined }}>{item}</span>
          </li>
        ))}
      </ul>
    </CardShell>
  )
}

export function GanttChartOverlay({ clip, primary, accent }: Props) {
  const rows = (clip.effects?.displayValue || 'Design | Dev | QA').split(/\|/).map((s) => s.trim())
  const bars = [
    { left: 5, width: 35 },
    { left: 25, width: 45 },
    { left: 55, width: 30 },
  ]
  return (
    <CardShell clip={clip}>
      <p className="text-[10px] text-white/60 mb-2">{clip.effects?.secondaryText}</p>
      <div className="space-y-2">
        {rows.slice(0, 4).map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[9px] text-white/70 w-12 truncate">{row}</span>
            <div className="flex-1 h-4 rounded bg-white/10 relative">
              <div
                className="absolute top-0.5 bottom-0.5 rounded"
                style={{
                  left: `${bars[i % bars.length].left}%`,
                  width: `${bars[i % bars.length].width}%`,
                  background: i % 2 ? accent : primary,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

export function SwimLaneOverlay({ clip, primary, accent }: Props) {
  const lanes = (clip.effects?.displayValue || 'Marketing | Sales | Support').split(/\|/).map((s) => s.trim())
  return (
    <CardShell clip={clip}>
      <p className="text-[10px] text-white/60 mb-2">{clip.effects?.secondaryText}</p>
      <div className="space-y-1">
        {lanes.slice(0, 4).map((lane, i) => (
          <div key={i} className="flex items-center gap-2 py-1 border-b border-white/10">
            <span className="text-[9px] text-white/60 w-14 shrink-0">{lane}</span>
            <div className="h-2 flex-1 rounded" style={{ width: `${40 + i * 15}%`, background: i % 2 ? accent : primary }} />
          </div>
        ))}
      </div>
    </CardShell>
  )
}

export function DecisionTreeOverlay({ clip, primary, accent }: Props) {
  return (
    <CardShell clip={clip}>
      <p className="text-center text-xs font-semibold text-white mb-3">{clip.effects?.displayValue || 'Decision?'}</p>
      <div className="flex justify-center gap-6">
        <div className="text-center">
          <div className="px-3 py-1 rounded text-[10px] text-white mb-1" style={{ background: primary }}>Yes</div>
          <div className="text-[9px] text-white/60">Path A</div>
        </div>
        <div className="text-center">
          <div className="px-3 py-1 rounded text-[10px] text-white mb-1" style={{ background: accent }}>No</div>
          <div className="text-[9px] text-white/60">Path B</div>
        </div>
      </div>
      <p className="text-center text-[10px] text-white/50 mt-3">{clip.effects?.secondaryText}</p>
    </CardShell>
  )
}

export function MindMapOverlay({ clip, primary, accent }: Props) {
  const center = clip.effects?.displayValue || 'Topic'
  const branches = (clip.effects?.secondaryText || 'A, B, C').split(/[,|]/).map((s) => s.trim())
  return (
    <CardShell clip={clip}>
      <div className="relative h-32 flex items-center justify-center">
        <div className="px-4 py-2 rounded-full text-xs font-bold text-white z-10" style={{ background: primary }}>{center}</div>
        {branches.slice(0, 4).map((b, i) => {
          const positions = [
            { top: '8%', left: '15%' },
            { top: '8%', right: '15%' },
            { bottom: '8%', left: '20%' },
            { bottom: '8%', right: '20%' },
          ]
          return (
            <span
              key={i}
              className="absolute text-[9px] px-2 py-1 rounded text-white"
              style={{ ...positions[i], background: `${accent}99` }}
            >
              {b}
            </span>
          )
        })}
      </div>
    </CardShell>
  )
}
