import { describe, it, expect } from 'vitest'
import {
  resolveExportBurnStyle,
  captionMetadataForExport,
  PRESET_TO_BURN,
} from '@/lib/captionBurnStyle'

describe('captionBurnStyle', () => {
  it('maps editor presets to ASS burn styles', () => {
    expect(PRESET_TO_BURN.tiktok).toBe('mrbeast')
    expect(PRESET_TO_BURN.subtitle).toBe('minimal')
    expect(PRESET_TO_BURN['nepali-bold']).toBe('nepali_bold')
  })

  it('prefers explicit burn-in style over editor preset', () => {
    expect(resolveExportBurnStyle('kinetic', 'subtitle')).toBe('kinetic')
  })

  it('falls back from editor preset when burn style missing', () => {
    expect(resolveExportBurnStyle(null, 'tiktok')).toBe('mrbeast')
  })

  it('builds export metadata', () => {
    expect(captionMetadataForExport('hormozi', 'subtitle')).toEqual({
      caption_burn_style: 'hormozi',
      caption_editor_preset: 'subtitle',
    })
  })
})
