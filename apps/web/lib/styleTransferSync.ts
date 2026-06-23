/**
 * Maps backend style-transfer timeline data → visible editor state
 * (preview filters, caption style, applied-style summary).
 */

import type { ApiTimelineData } from '@/lib/timelineApi'
import { useCaptionsStore, type Position } from '@/stores/captionsStore'

export interface StyleTransferSummary {
  components: string[]
  presetLabel?: string
  pacingTarget?: {
    avg_cut_duration_ms: number
    cuts_per_minute: number
    rhythm: string
    strength?: number
  }
  pacingSegments?: number
  hookOverlays?: number
  visualOverlays?: number
  brollOverlays?: number
  editTemplateEvents?: number
  sfxClips?: number
  musicClips?: number
  jumpCutSegments?: number
  colorClips: number
  captionClips: number
  transitionClips: number
  audioClips: number
}

/** Convert StyleDNA color_grade params to a CSS filter for preview. */
export function colorGradeToCss(params: Record<string, unknown>): string {
  const brightness = Number(params.brightness ?? 0)
  const contrast = Number(params.contrast ?? 0)
  const saturation = Number(params.saturation ?? 0)
  const temperature = Number(params.temperature ?? 0)
  const b = Math.round(100 + brightness * 35)
  const c = Math.round(100 + contrast * 45)
  const s = Math.round(100 + saturation * 55)
  const hue = Math.round(temperature * -18)
  return `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${hue}deg)`
}

/** Map backend transition type → Effects drawer / preview ids. */
export function mapStyleTransitionType(apiType: string): string {
  const map: Record<string, string> = {
    cut: 'cut',
    dissolve: 'dissolve',
    fade: 'fade-black',
    zoom: 'zoom-in',
    whip_pan: 'whip-pan',
    slide: 'slide-l',
    wipe: 'wipe',
  }
  return map[apiType] ?? apiType
}

function captionPositionFromStyle(position: unknown): Position {
  const p = String(position ?? 'bottom').toLowerCase()
  if (p === 'top') return 'top'
  if (p === 'center') return 'center'
  return 'bottom'
}

/** Apply caption_style from timeline track to the global caption preview. */
export function applyCaptionStyleFromTrack(style: Record<string, unknown> | undefined): void {
  if (!style || Object.keys(style).length === 0) return

  const store = useCaptionsStore.getState()
  const animation = String(style.animation ?? 'none')
  if (animation !== 'none' && animation !== 'slide') {
    store.applyPreset('tiktok')
  }

  store.setStyleProp('position', captionPositionFromStyle(style.position))
  if (typeof style.color === 'string') store.setStyleProp('color', style.color)
  if (String(style.case ?? '').toLowerCase() === 'uppercase') store.setStyleProp('bold', true)
  store.setStyleProp('useNepaliFont', true)
}

/** Read style-transfer metadata + clip effects; update caption store; return summary. */
export function syncStyleTransferFromTimeline(
  data: ApiTimelineData,
): StyleTransferSummary | null {
  const meta = data.metadata ?? {}
  const pacing = meta.pacing_target as StyleTransferSummary['pacingTarget'] | undefined

  let colorClips = 0
  let captionClips = 0
  let transitionClips = 0
  let audioClips = 0
  let pacingSegments = 0
  let hookOverlays = 0
  let visualOverlays = 0
  let brollOverlays = 0
  let sfxClips = 0
  let musicClips = 0
  let jumpCutSegments = 0
  const components = new Set<string>()

  const metaApplied = meta.pacing_applied as { clips_after?: number } | undefined

  for (const track of data.tracks ?? []) {
    if (track.type === 'captions' && track.style && typeof track.style === 'object') {
      applyCaptionStyleFromTrack(track.style as Record<string, unknown>)
      components.add('captions')
    }

    for (const clip of track.clips ?? []) {
      for (const fx of clip.effects ?? []) {
        if (fx.type === 'color_grade') {
          colorClips += 1
          components.add('color')
        }
        if (fx.type === 'caption_style') {
          captionClips += 1
          components.add('captions')
        }
        if (fx.type === 'audio_normalize') {
          audioClips += 1
          components.add('audio')
        }
        if (fx.type === 'style_pacing') {
          pacingSegments += 1
          jumpCutSegments += 1
          components.add('pacing')
        }
        if (fx.type === 'sfx_slot' && fx.params?.style_transfer) {
          sfxClips += 1
          components.add('audio')
        }
        if (fx.type === 'music_bed' && fx.params?.style_transfer) {
          musicClips += 1
          components.add('audio')
        }
        if (fx.type === 'visual_overlay' && fx.params) {
          const params = fx.params as Record<string, unknown>
          if (!params.style_transfer) continue
          const comp = String(params.style_component ?? '')
          const vtype = String(params.visual_type ?? '')
          if (comp === 'hook' || vtype === 'hook_rewrite') {
            hookOverlays += 1
            components.add('hook')
          } else if (
            comp.startsWith('broll')
            || comp.startsWith('recipe-broll')
            || vtype === 'broll_insert'
            || vtype === 'screen_recording'
          ) {
            brollOverlays += 1
            components.add('broll')
          } else if (vtype === 'title_banner' || vtype === 'hook_banner') {
            hookOverlays += 1
            components.add('hook')
          } else if (comp.startsWith('visual') || vtype === 'callout') {
            visualOverlays += 1
            components.add('visuals')
          }
        }
      }
      if (clip.transitions?.out) {
        transitionClips += 1
        components.add('transitions')
      }
    }
  }

  if (pacing) components.add('pacing')
  if (meta.hook_style) components.add('hook')
  if (meta.visual_style) components.add('visuals')
  if (meta.broll_style) components.add('broll')
  const editTpl = meta.edit_template as { events_applied?: number; preset_name?: string } | undefined
  if (editTpl?.events_applied) {
    components.add('template')
  }
  if (components.size === 0 && !pacing && !editTpl) return null

  return {
    components: [...components],
    pacingTarget: pacing,
    pacingSegments: pacingSegments || metaApplied?.clips_after,
    hookOverlays,
    visualOverlays,
    brollOverlays,
    editTemplateEvents: editTpl?.events_applied,
    sfxClips: sfxClips || undefined,
    musicClips: musicClips || undefined,
    jumpCutSegments: jumpCutSegments || pacingSegments || undefined,
    colorClips,
    captionClips,
    transitionClips,
    audioClips,
  }
}

export function formatStyleTransferSummary(summary: StyleTransferSummary): string {
  const parts: string[] = []
  if (summary.colorClips > 0) parts.push(`color on ${summary.colorClips} video clip(s)`)
  if (summary.captionClips > 0) parts.push('caption styling')
  if (summary.transitionClips > 0) {
    parts.push(`transitions on ${summary.transitionClips} clip(s)`)
  }
  if (summary.audioClips > 0) parts.push(`audio normalize on ${summary.audioClips} clip(s)`)
  if (summary.jumpCutSegments && summary.jumpCutSegments > 0) {
    parts.push(`${summary.jumpCutSegments} jump-cut segment(s)`)
  } else if (summary.pacingSegments && summary.pacingSegments > 0) {
    parts.push(`${summary.pacingSegments} paced cut(s)`)
  } else if (summary.pacingTarget) {
    parts.push(
      `pacing target ~${Math.round(summary.pacingTarget.avg_cut_duration_ms / 1000)}s cuts`,
    )
  }
  if (summary.hookOverlays && summary.hookOverlays > 0) {
    parts.push(`${summary.hookOverlays} hook overlay(s)`)
  }
  if (summary.visualOverlays && summary.visualOverlays > 0) {
    parts.push(`${summary.visualOverlays} visual overlay(s)`)
  }
  if (summary.brollOverlays && summary.brollOverlays > 0) {
    parts.push(`${summary.brollOverlays} b-roll marker(s)`)
  }
  if (summary.sfxClips && summary.sfxClips > 0) {
    parts.push(`${summary.sfxClips} SFX slot(s)`)
  }
  if (summary.musicClips && summary.musicClips > 0) {
    parts.push('music bed slot')
  }
  if (summary.editTemplateEvents && summary.editTemplateEvents > 0) {
    parts.push(`edit template (${summary.editTemplateEvents} edits applied)`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Style metadata saved'
}
