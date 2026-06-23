'use client'

/**
 * ForensicReportPanel — 12-section style reverse-engineering summary.
 */

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface ForensicReportPanelProps {
  projectId: string
  presetId: string | null
}

export function ForensicReportPanel({ projectId, presetId }: ForensicReportPanelProps) {
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!presetId) {
      setReport(null)
      return
    }
    setLoading(true)
    setError(null)
    const res = await api.get<{ forensic_report: Record<string, unknown> }>(
      `/projects/${projectId}/style-library/${presetId}/forensic`,
    )
    setLoading(false)
    if (res.error) {
      setError(res.error)
      setReport(null)
      return
    }
    setReport(res.data?.forensic_report ?? null)
  }, [projectId, presetId])

  useEffect(() => {
    void load()
  }, [load])

  if (!presetId) return null
  if (loading) {
    return <p className="text-[11px] text-text-disabled px-1">Loading forensic report…</p>
  }
  if (error) {
    return (
      <p className="text-[11px] text-text-disabled px-1">
        Forensic report unavailable — re-extract reference to generate.
      </p>
    )
  }
  if (!report) return null

  const high = (report.section_1_high_level ?? {}) as Record<string, unknown>
  const metrics = (high.intensity_metrics ?? {}) as Record<string, number>
  const rhythm = (report.section_3_cutting_rhythm ?? {}) as Record<string, unknown>
  const timeline = (report.section_2_timeline ?? []) as Record<string, unknown>[]

  return (
    <div
      data-testid="forensic-report-panel"
      className="rounded-lg border border-bg-overlay bg-bg-base/40 p-3 space-y-3 max-h-64 overflow-y-auto text-[11px]"
    >
      <p className="font-semibold text-text-primary text-xs">
        Forensic analysis — {String(report.master_template_name ?? 'Reference')}
      </p>

      {high.editing_philosophy && (
        <p className="text-text-secondary leading-relaxed">{String(high.editing_philosophy)}</p>
      )}

      {Object.keys(metrics).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(metrics).map(([k, v]) => (
            <span
              key={k}
              className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px]"
            >
              {k.replace(/_/g, ' ')}: {v}/10
            </span>
          ))}
        </div>
      )}

      {rhythm.average_shot_duration_s != null && (
        <p className="text-text-disabled">
          Avg shot {String(rhythm.average_shot_duration_s)}s · {String(rhythm.total_cuts ?? '?')} cuts ·
          interrupt every {String(rhythm.pattern_interrupt_interval_s ?? '3.8')}s
        </p>
      )}

      {timeline.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-disabled uppercase mb-1">Timeline sample</p>
          <ul className="space-y-1">
            {timeline.slice(0, 4).map((row, i) => (
              <li key={i} className="text-text-secondary border-l-2 border-accent/30 pl-2">
                <span className="font-mono text-accent">{String(row.timestamp)}</span>{' '}
                {String(row.shot_type)} · {String(row.camera_framing)} · {String(row.zoom_level)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-text-disabled">
        Click ✨ Effects on the timeline to open the right panel — browse and add VFX, SFX, and B-roll.
        Apply this template to place the detected edit formula on your timeline.
      </p>
    </div>
  )
}
