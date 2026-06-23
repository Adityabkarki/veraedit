/**
 * Tests for lib/shortStyling.ts — short-scoped styling helpers
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SHORT_STYLING,
  buildShortOverlayFromTemplate,
  buildShortOverlayFromTextEffect,
  shortVideoCssFilter,
  shortPlaybackRate,
  stylingToExport,
  activeShortOverlays,
} from '@/lib/shortStyling'
import { DEFAULT_BRAND_KIT } from '@/stores/visualLibraryStore'

describe('shortStyling', () => {
  it('defaults to empty styling', () => {
    expect(DEFAULT_SHORT_STYLING.overlays).toHaveLength(0)
    expect(DEFAULT_SHORT_STYLING.filterId).toBeNull()
  })

  it('builds template overlay without touching timeline', () => {
    const overlay = buildShortOverlayFromTemplate(
      'ti-main',
      30,
      DEFAULT_BRAND_KIT,
      true,
      'en',
    )
    expect(overlay).not.toBeNull()
    expect(overlay!.templateId).toBe('ti-main')
    expect(overlay!.offset).toBe(0)
    expect(overlay!.color).toBe(DEFAULT_BRAND_KIT.primaryColor)
  })

  it('builds text effect overlay', () => {
    const overlay = buildShortOverlayFromTextEffect(
      'lt-bold',
      20,
      DEFAULT_BRAND_KIT,
      false,
      'en',
    )
    expect(overlay?.visualType).toBe('key_term')
  })

  it('resolves CSS filter and playback rate', () => {
    expect(shortVideoCssFilter('warm')).toContain('sepia')
    expect(shortPlaybackRate('fast-2x')).toBe(2)
  })

  it('exports styling payload for API', () => {
    const payload = stylingToExport({
      ...DEFAULT_SHORT_STYLING,
      filterId: 'vibrant',
      speedId: 'fast-2x',
      brandApplied: true,
      brandKit: DEFAULT_BRAND_KIT,
      overlays: [],
    })
    expect(payload.filter_id).toBe('vibrant')
    expect(payload.speed_multiplier).toBe(2)
    expect(payload.brand_applied).toBe(true)
  })

  it('filters active overlays by local time', () => {
    const overlays = activeShortOverlays(
      [
        {
          id: 'a',
          source: 'template',
          templateId: 'ti-main',
          visualType: 'hook_rewrite',
          offset: 0,
          duration: 5,
          text: 'Hi',
          language: 'en',
          color: '#fff',
        },
      ],
      2,
    )
    expect(overlays).toHaveLength(1)
    expect(activeShortOverlays(overlays, 6)).toHaveLength(0)
  })
})
