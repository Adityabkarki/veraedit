import { describe, it, expect } from 'vitest'
import { colorGradeToCss, formatStyleTransferSummary } from '@/lib/styleTransferSync'

describe('styleTransferSync', () => {
  it('builds css filter from color grade params', () => {
    const css = colorGradeToCss({ brightness: -0.3, contrast: 0.1, saturation: 0, temperature: 0 })
    expect(css).toContain('brightness(')
    expect(css).toContain('contrast(')
  })

  it('formats applied summary for UI', () => {
    const text = formatStyleTransferSummary({
      components: ['color', 'pacing', 'hook', 'broll'],
      colorClips: 1,
      captionClips: 0,
      transitionClips: 0,
      audioClips: 0,
      pacingSegments: 6,
      hookOverlays: 1,
      brollOverlays: 2,
      pacingTarget: { avg_cut_duration_ms: 3000, cuts_per_minute: 20, rhythm: 'variable' },
    })
    expect(text).toContain('color on 1 video clip')
    expect(text).toContain('6 paced cut')
    expect(text).toContain('hook overlay')
    expect(text).toContain('b-roll marker')
  })
})
