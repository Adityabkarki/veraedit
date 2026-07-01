/**
 * Style template gap report — coverage and per-effect apply status.
 */

export interface GapReportImplementedItem {
  toolbox_id: string
  display_name: string
  category: string
  raw_description?: string
  renderer?: string | null
  status?: 'supported'
}

export interface GapReportPartialItem {
  toolbox_id: string
  display_name: string
  category: string
  raw_description?: string
  reason?: string
  status?: 'partial'
}

export interface GapReportUnresolvableItem {
  raw_description: string
}

export interface StyleGapReport {
  total_detected: number
  implemented: GapReportImplementedItem[]
  partial: GapReportPartialItem[]
  unresolvable: GapReportUnresolvableItem[]
  coverage_pct: number
}

export interface ApplySummary {
  applied: { toolbox_id: string; [key: string]: unknown }[]
  skipped: { toolbox_id: string; reason: string }[]
  errors: { toolbox_id: string; error: string }[]
  applied_count: number
  skipped_count: number
}

/** Resolve gap report from preset (top-level or legacy nested). */
export function gapReportFromPreset(preset: {
  gap_report?: StyleGapReport
  coverage_pct?: number
  supported_coverage_pct?: number
}): StyleGapReport | null {
  const gr = preset.gap_report
  if (gr && (gr.implemented?.length || gr.partial?.length || gr.unresolvable?.length)) {
    return gr
  }
  return null
}

export function coverageFromPreset(preset: {
  coverage_pct?: number
  supported_coverage_pct?: number
}): number {
  if (preset.coverage_pct != null) return Math.round(preset.coverage_pct)
  if (preset.supported_coverage_pct != null) return Math.round(preset.supported_coverage_pct)
  return 0
}
