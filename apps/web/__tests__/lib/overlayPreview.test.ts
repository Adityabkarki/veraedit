import { describe, it, expect } from 'vitest'
import { activePreviewOverlays, isOverlayPreviewTrack } from '@/lib/overlayPreview'
import type { Clip } from '@/stores/timelineStore'

describe('overlayPreview', () => {
  it('includes stacked element lanes', () => {
    expect(isOverlayPreviewTrack('overlay-2')).toBe(true)
    expect(isOverlayPreviewTrack('images')).toBe(true)
  })

  it('returns all active overlays at playhead', () => {
    const clips: Clip[] = [
      {
        id: 'a',
        trackId: 'overlay',
        startTime: 0,
        duration: 5,
        label: 'CTA',
        type: 'overlay',
        effects: { visualType: 'cta', displayValue: 'Subscribe' },
      },
      {
        id: 'b',
        trackId: 'overlay-2',
        startTime: 0,
        duration: 5,
        label: 'Stat',
        type: 'overlay',
        effects: { visualType: 'large_number', displayValue: '90%' },
      },
    ]
    const active = activePreviewOverlays(clips, 1)
    expect(active).toHaveLength(2)
  })
})
