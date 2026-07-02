/**
 * Tests for lib/exportTimeline.ts
 */

import { describe, it, expect } from 'vitest'
import { resolveClipAssetId, buildCaptionExportMetadata } from '@/lib/exportTimeline'
import type { Clip } from '@/stores/timelineStore'
import { CAPTION_PRESETS } from '@/stores/captionsStore'

describe('resolveClipAssetId', () => {
  const primary = 'main-asset-id'

  it('uses primary asset for video clips', () => {
    const clip: Clip = {
      id: 'v1', trackId: 'video', startTime: 0, duration: 10, label: 'Main', type: 'video',
    }
    expect(resolveClipAssetId(clip, primary)).toBe(primary)
  })

  it('uses media asset id for broll with uploaded media', () => {
    const clip: Clip = {
      id: 'b1', trackId: 'broll', startTime: 2, duration: 3, label: 'B-Roll', type: 'overlay',
      effects: { mediaAssetId: 'media-uuid-1', storageKey: 'projects/p1/media/x.mp4' },
    }
    expect(resolveClipAssetId(clip, primary)).toBe('media-uuid-1')
  })

  it('uses synthetic id for sfx clips', () => {
    const clip: Clip = {
      id: 'sfx-1', trackId: 'sfx', startTime: 1, duration: 0.3, label: 'Whoosh', type: 'audio',
      effects: { sfxSlug: 'whoosh', sfxType: 'whoosh' },
    }
    expect(resolveClipAssetId(clip, primary)).toBe('clip-sfx-1')
  })
})

describe('buildCaptionExportMetadata', () => {
  it('includes global style and burn preset', () => {
    const meta = buildCaptionExportMetadata(null, CAPTION_PRESETS['nepali-bold'], [])
    expect(meta.caption_burn_style).toBe('nepali_bold')
    expect(meta.caption_style).toMatchObject({
      preset: 'nepali-bold',
      use_nepali_font: true,
    })
  })

  it('preserves custom yellow subtitle color from editor', () => {
    const yellowStyle = { ...CAPTION_PRESETS.tiktok, color: '#FFFF00', position: 'center' as const }
    const meta = buildCaptionExportMetadata(null, yellowStyle, [])
    expect(meta.caption_style).toMatchObject({
      color: '#FFFF00',
      position: 'center',
    })
  })

  it('captures caption-fx clips even when playhead sample has none', () => {
    const meta = buildCaptionExportMetadata(
      null,
      CAPTION_PRESETS['nepali-bold'],
      [
        {
          id: 'cfx-1',
          trackId: 'caption-fx',
          startTime: 4,
          duration: 3,
          label: 'Word-by-word',
          type: 'effect',
          effects: {
            effectType: 'caption',
            captionAnimation: 'word-by-word',
            maxWordsPerLine: 2,
            captionCase: 'normal',
            captionPosition: 'center',
          },
        },
      ] as Clip[],
      0,
    )
    expect(meta.caption_fx).toMatchObject({
      animation: 'word-by-word',
      max_words_per_line: 2,
      position: 'center',
    })
  })
})
