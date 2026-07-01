/**
 * Maps editor caption UI presets → FFmpeg ASS burn-in style names.
 */

import type { BurnInStyle } from '@/lib/captionsApi'
import type { CaptionPreset } from '@/stores/captionsStore'

export const PRESET_TO_BURN: Record<CaptionPreset, BurnInStyle> = {
  'nepali-bold': 'nepali_bold',
  subtitle:      'minimal',
  tiktok:        'mrbeast',
  bilingual:     'nepali_bold',
}

/** Resolve the ASS burn-in style for export from editor state. */
export function resolveExportBurnStyle(
  burnInStyle: BurnInStyle | null | undefined,
  editorPreset: CaptionPreset | undefined,
): BurnInStyle {
  if (burnInStyle) return burnInStyle
  if (editorPreset && PRESET_TO_BURN[editorPreset]) {
    return PRESET_TO_BURN[editorPreset]
  }
  return 'nepali_bold'
}

export function captionMetadataForExport(
  burnInStyle: BurnInStyle | null | undefined,
  editorPreset: CaptionPreset | undefined,
): Record<string, string> {
  const resolved = resolveExportBurnStyle(burnInStyle, editorPreset)
  return {
    caption_burn_style: resolved,
    caption_editor_preset: editorPreset ?? 'nepali-bold',
  }
}
