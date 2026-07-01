import { describe, it, expect } from 'vitest'
import { coverageFromPreset, gapReportFromPreset } from '@/lib/styleGapReport'

describe('styleGapReport', () => {
  it('reads coverage from preset fields', () => {
    expect(coverageFromPreset({ coverage_pct: 80 })).toBe(80)
    expect(coverageFromPreset({ supported_coverage_pct: 65 })).toBe(65)
  })

  it('returns gap report when present', () => {
    const gr = {
      total_detected: 2,
      implemented: [{ toolbox_id: 'hook_text_overlay', display_name: 'Hook', category: 'overlay' }],
      partial: [],
      unresolvable: [],
      coverage_pct: 100,
    }
    const preset = { gap_report: gr }
    expect(gapReportFromPreset(preset)).toEqual(gr)
  })
})
