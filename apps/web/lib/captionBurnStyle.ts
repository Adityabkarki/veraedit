/**
 * Maps editor caption UI presets → FFmpeg ASS burn-in style names.
 */

import type { BurnInStyle } from '@/lib/captionsApi'
import type { CaptionPreset, CaptionStyle } from '@/stores/captionsStore'

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
  globalStyle?: CaptionStyle,
): Record<string, string | Record<string, unknown>> {
  const resolved = resolveExportBurnStyle(burnInStyle, editorPreset)
  const meta: Record<string, string | Record<string, unknown>> = {
    caption_burn_style: resolved,
    caption_editor_preset: editorPreset ?? 'nepali-bold',
  }
  if (globalStyle) {
    meta.caption_style = {
      preset: globalStyle.preset,
      font_size: globalStyle.fontSize,
      color: globalStyle.color,
      background_color: globalStyle.backgroundColor,
      position: globalStyle.position,
      bold: globalStyle.bold,
      use_nepali_font: globalStyle.useNepaliFont,
    }
  }
  return meta
}
