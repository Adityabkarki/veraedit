/**
 * Visual preview styles + hover animation kinds for edit-toolbox tiles.
 */

import type { EditToolboxTool } from '@/lib/styleTransfer'
import { sfxConfigForTool, isSfxToolId } from '@/lib/mediaClips'

export interface ToolboxPreviewStyle {
  background: string
  icon?: string
  hint?: string
}

export type ToolboxPreviewKind =
  | 'sfx'
  | 'music'
  | 'broll'
  | 'zoom-in'
  | 'zoom-punch'
  | 'transition-cut'
  | 'transition-dissolve'
  | 'transition-fade'
  | 'transition-zoom'
  | 'caption-pop'
  | 'caption-word'
  | 'caption-slide'
  | 'vignette'
  | 'shake'
  | 'overlay-slide'
  | 'color-grade'
  | 'layout-split'
  | 'layout-pip'
  | 'pacing'
  | 'default'

export interface ToolboxPreviewMeta extends ToolboxPreviewStyle {
  kind: ToolboxPreviewKind
  /** Play Web Audio preview on hover (SFX tools). */
  sfxType?: string
  /** Short label shown during hover animation. */
  previewLabel?: string
}

const CATEGORY_PREVIEW: Record<string, ToolboxPreviewStyle> = {
  transitions: { background: 'linear-gradient(90deg,#1F2937 50%,#6B7280 50%)', hint: '↔' },
  color:       { background: 'linear-gradient(135deg,#1a1a2e 0%,#e94560 100%)', hint: '◐' },
  vfx:         { background: 'radial-gradient(circle at 30% 30%,#7C3AED,#111827)', hint: '✦' },
  audio:       { background: 'linear-gradient(180deg,#F59E0B,#92400E)', hint: '♪' },
  broll:       { background: '#000000', hint: '▣' },
  camera:      { background: 'linear-gradient(180deg,#3B82F6,#1E3A8A)', hint: '⊕' },
  pacing:      { background: 'repeating-linear-gradient(90deg,#374151 0 8px,#1F2937 8px 16px)', hint: '✂' },
  captions:    { background: 'linear-gradient(180deg,#111827 60%,#F59E0B 60%)', hint: 'Aa' },
  motion:      { background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', hint: '◈' },
  overlays:    { background: 'linear-gradient(135deg,#10B981,#065F46)', hint: '▤' },
  shot:        { background: 'linear-gradient(180deg,#4B5563,#111827)', hint: '◎' },
  layout:      { background: 'linear-gradient(90deg,#1F2937 33%,#374151 33% 66%,#4B5563 66%)', hint: '▦' },
}

const TOOL_OVERRIDES: Record<string, Partial<ToolboxPreviewMeta>> = {
  dissolve_transition: { background: 'linear-gradient(90deg,#111827 45%,#9CA3AF 55%,#111827)', kind: 'transition-dissolve' },
  fade_transition:     { background: 'linear-gradient(90deg,#000 40%,#374151 60%)', kind: 'transition-fade' },
  zoom_transition:     { background: 'radial-gradient(circle,#3B82F6 20%,#111827 70%)', kind: 'transition-zoom' },
  whip_pan:            { background: 'linear-gradient(90deg,#1F2937 30%,#60A5FA 50%,#1F2937 70%)', kind: 'transition-cut' },
  hard_cut:            { kind: 'transition-cut', hint: '|' },
  vfx_frame_flash:     { background: 'linear-gradient(90deg,#111827 48%,#fff 50%,#111827 52%)', kind: 'transition-fade' },
  sfx_on_cut:          { background: 'linear-gradient(90deg,#F59E0B,#FBBF24)', hint: '⚡', kind: 'sfx', sfxType: 'whoosh' },
  sfx_whoosh_cut:      { background: 'linear-gradient(90deg,#F59E0B,#FDE68A)', hint: '〜', kind: 'sfx', sfxType: 'whoosh' },
  sfx_sub_bass_thud:   { background: 'linear-gradient(180deg,#78350F,#451A03)', hint: '▼', kind: 'sfx', sfxType: 'sub_bass' },
  sfx_shutter_click:   { background: 'linear-gradient(135deg,#374151,#F59E0B)', hint: '◉', kind: 'sfx', sfxType: 'click' },
  music_bed:           { background: 'linear-gradient(180deg,#10B981,#065F46)', hint: '♫', kind: 'music' },
  broll_insert:        { background: '#000000', hint: '▣', kind: 'broll' },
  screen_broll_cutaway:{ background: '#0A0A0B', hint: '▣', kind: 'broll', previewLabel: 'Screen' },
  broll_documentary:   { background: '#111827', hint: '▣', kind: 'broll' },
  shot_broll_news:     { background: '#000000', hint: '▣', kind: 'broll' },
  digital_zoom_punch:  { background: 'radial-gradient(circle at center,#60A5FA 0%,#1E3A8A 100%)', hint: '⊕', kind: 'zoom-punch' },
  ken_burns:           { background: 'linear-gradient(180deg,#3B82F6,#1E3A8A)', hint: '⊕', kind: 'zoom-in' },
  zoom_continuous_push:{ kind: 'zoom-in' },
  zoom_step_108:       { kind: 'zoom-punch' },
  zoom_step_115:       { kind: 'zoom-punch' },
  framing_mcu:         { kind: 'zoom-in', previewLabel: 'MCU' },
  framing_ecu:         { kind: 'zoom-punch', previewLabel: 'ECU' },
  vfx_vignette:        { background: 'radial-gradient(circle,#374151 30%,#000 100%)', kind: 'vignette' },
  vfx_camera_shake:    { kind: 'shake' },
  color_grade:         { kind: 'color-grade' },
  caption_pop:         { kind: 'caption-pop', previewLabel: 'POP!' },
  caption_word_by_word:{ kind: 'caption-word', previewLabel: 'One…' },
  caption_slide:       { kind: 'caption-slide', previewLabel: 'Slide' },
  caption_scale_pop:   { kind: 'caption-pop', previewLabel: 'SCALE' },
  caption_masked_overlay: { kind: 'caption-slide', previewLabel: 'MASK' },
  jump_cut_pacing:     { kind: 'pacing' },
  speed_ramp:          { kind: 'pacing', hint: '⚡' },
  retention_open_loop: { kind: 'pacing', hint: '?' },
  split_screen:        { kind: 'layout-split', previewLabel: 'A | B' },
  picture_in_picture:  { kind: 'layout-pip', previewLabel: 'PiP' },
  title_hook_banner:   { kind: 'overlay-slide', previewLabel: 'HOOK' },
  hook_text_overlay:   { kind: 'overlay-slide', previewLabel: 'Hook' },
  cta_overlay:         { kind: 'overlay-slide', previewLabel: 'CTA' },
  text_overlay:        { kind: 'overlay-slide', previewLabel: 'Text' },
  lower_third:         { kind: 'overlay-slide', previewLabel: 'Name' },
  logo_overlay:        { kind: 'overlay-slide', previewLabel: 'Logo' },
  emoji_reaction:      { kind: 'overlay-slide', previewLabel: '🔥' },
  motion_data_card:    { kind: 'overlay-slide', previewLabel: '65K' },
  motion_arrow_flow:   { kind: 'overlay-slide', previewLabel: '→' },
  motion_conflict_box: { kind: 'overlay-slide', previewLabel: '!' },
  overlay_upper_third_label: { kind: 'overlay-slide', previewLabel: 'Label' },
}

const CATEGORY_KIND: Record<string, ToolboxPreviewKind> = {
  transitions: 'transition-dissolve',
  color: 'color-grade',
  vfx: 'default',
  audio: 'sfx',
  broll: 'broll',
  camera: 'zoom-in',
  pacing: 'pacing',
  captions: 'caption-pop',
  motion: 'overlay-slide',
  overlays: 'overlay-slide',
  shot: 'default',
  layout: 'layout-split',
}

export function toolboxPreviewStyle(tool: EditToolboxTool): ToolboxPreviewStyle {
  const meta = toolboxPreviewMeta(tool)
  return { background: meta.background, icon: meta.icon, hint: meta.hint }
}

export function toolboxPreviewMeta(tool: EditToolboxTool): ToolboxPreviewMeta {
  const override = TOOL_OVERRIDES[tool.id]
  const base = CATEGORY_PREVIEW[tool.category] ?? CATEGORY_PREVIEW.overlays
  const kind = override?.kind ?? CATEGORY_KIND[tool.category] ?? 'default'

  let sfxType = override?.sfxType
  if (!sfxType && (kind === 'sfx' || isSfxToolId(tool.id))) {
    sfxType = sfxConfigForTool(tool.id).sfxType
  }

  return {
    ...base,
    kind,
    sfxType,
    previewLabel: override?.previewLabel,
    ...override,
  }
}

/** CSS class for the animated inner layer (applied while hovering). */
export function toolboxPreviewAnimClass(kind: ToolboxPreviewKind): string {
  return `tb-preview-anim tb-preview-anim--${kind}`
}
