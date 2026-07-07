/**
 * Caption FX — animation presets applied to transcript captions (not overlay text).
 */

import type { Clip, Track } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { commitTimelineClips, getFullTimelineClips } from '@/lib/editor/timelineClipUpdates'

export type CaptionAnimation =
  | 'pop'
  | 'word-by-word'
  | 'slide'
  | 'scale_pop'
  | 'masked_reveal'

export interface CaptionEffectConfig {
  animation: CaptionAnimation
  label: string
  maxWordsPerLine?: number
  captionCase?: 'uppercase' | 'normal'
  position?: 'bottom' | 'center' | 'top'
}

export const CAPTION_EFFECT_TOOL_IDS = new Set([
  'caption_pop',
  'caption_word_by_word',
  'caption_slide',
  'caption_scale_pop',
  'caption_masked_overlay',
])

export const CAPTION_EFFECT_CONFIG: Record<string, CaptionEffectConfig> = {
  caption_pop: {
    animation: 'pop',
    label: 'Pop-in',
    maxWordsPerLine: 4,
    position: 'center',
  },
  caption_word_by_word: {
    animation: 'word-by-word',
    label: 'Word-by-word',
    maxWordsPerLine: 2,
    position: 'center',
  },
  caption_slide: {
    animation: 'slide',
    label: 'Slide-up',
    maxWordsPerLine: 4,
    position: 'bottom',
  },
  caption_scale_pop: {
    animation: 'scale_pop',
    label: 'Scale-pop',
    maxWordsPerLine: 3,
    captionCase: 'uppercase',
    position: 'center',
  },
  caption_masked_overlay: {
    animation: 'masked_reveal',
    label: 'Masked reveal',
    maxWordsPerLine: 3,
    position: 'center',
  },
}

export function isCaptionEffectToolId(toolId: string): boolean {
  return CAPTION_EFFECT_TOOL_IDS.has(toolId)
}

export function isCaptionEffectClip(clip: Clip | undefined): boolean {
  if (!clip) return false
  return clip.trackId === 'caption-fx' || clip.effects?.effectType === 'caption'
}

export function captionEffectLabel(animation: string): string {
  const found = Object.values(CAPTION_EFFECT_CONFIG).find((c) => c.animation === animation)
  return found?.label ?? 'Caption FX'
}

export function ensureCaptionFxTrack(tracks: Track[]): Track[] {
  if (tracks.some((t) => t.id === 'caption-fx')) return tracks
  const capIdx = tracks.findIndex((t) => t.id === 'captions')
  const fxTrack: Track = {
    id: 'caption-fx',
    label: 'Caption FX',
    color: '#D97706',
    muted: false,
    locked: false,
    visible: true,
  }
  if (capIdx === -1) return [...tracks, fxTrack]
  const next = [...tracks]
  next.splice(capIdx + 1, 0, fxTrack)
  return next
}

export interface ResolvedCaptionEffect {
  clip: Clip
  config: CaptionEffectConfig
  /** 0–1 progress through the FX clip */
  clipProgress: number
  /** Seconds since FX clip started */
  localTime: number
}

export function resolveCaptionEffectAt(
  clips: Clip[],
  time: number,
): ResolvedCaptionEffect | null {
  const fx = clips.find(
    (c) =>
      isCaptionEffectClip(c) &&
      time >= c.startTime - 0.001 &&
      time < c.startTime + c.duration + 0.001,
  )
  if (!fx) return null

  const anim =
    (fx.effects?.captionAnimation as CaptionAnimation | undefined) ??
    (fx.effects?.animation as CaptionAnimation | undefined) ??
    'pop'

  const toolConfig = Object.values(CAPTION_EFFECT_CONFIG).find((c) => c.animation === anim)

  const config: CaptionEffectConfig = {
    animation: anim,
    label: fx.label || toolConfig?.label || 'Caption FX',
    maxWordsPerLine: Number(fx.effects?.maxWordsPerLine ?? toolConfig?.maxWordsPerLine ?? 4),
    captionCase:
      (fx.effects?.captionCase as CaptionEffectConfig['captionCase']) ??
      toolConfig?.captionCase ??
      'normal',
    position:
      (fx.effects?.captionPosition as CaptionEffectConfig['position']) ??
      toolConfig?.position ??
      'bottom',
  }

  const localTime = Math.max(0, time - fx.startTime)
  const clipProgress = fx.duration > 0 ? Math.min(1, localTime / fx.duration) : 0

  return { clip: fx, config, clipProgress, localTime }
}

/** Move legacy toolbox caption-effect clips off the Captions text track. */
export function migrateCaptionEffectClips(
  tracks: Track[],
  clips: Clip[],
): { tracks: Track[]; clips: Clip[] } {
  const nextTracks = ensureCaptionFxTrack(tracks)
  const nextClips = clips.map((c) => {
    const anim = c.effects?.captionAnimation ?? c.effects?.animation
    const isCaptionFx =
      c.effects?.effectType === 'caption' ||
      (c.trackId === 'captions' && Boolean(anim))

    if (!isCaptionFx || !anim) {
      if (c.effects?.effectType === 'caption') {
        const a = String(c.effects.captionAnimation ?? 'pop')
        const cfg = Object.values(CAPTION_EFFECT_CONFIG).find((x) => x.animation === a)
        return {
          ...c,
          trackId: 'caption-fx',
          type: 'effect' as const,
          label: c.label || cfg?.label || captionEffectLabel(a),
        }
      }
      return c
    }

    const cfg = Object.values(CAPTION_EFFECT_CONFIG).find((x) => x.animation === anim)
    return {
      ...c,
      trackId: 'caption-fx',
      type: 'effect' as const,
      label: cfg?.label ?? captionEffectLabel(String(anim)),
      effects: {
        ...c.effects,
        effectType: 'caption' as const,
        captionAnimation: anim,
        maxWordsPerLine: c.effects?.maxWordsPerLine ?? cfg?.maxWordsPerLine,
        captionCase: c.effects?.captionCase ?? c.effects?.case ?? cfg?.captionCase,
        captionPosition: c.effects?.captionPosition ?? cfg?.position,
        animation: undefined,
        displayValue: undefined,
      },
    }
  })
  return { tracks: nextTracks, clips: nextClips }
}

function captionClipAtTime(clips: Clip[], time: number): Clip | undefined {
  return clips.find(
    (c) =>
      c.trackId === 'captions' &&
      c.type === 'caption' &&
      time >= c.startTime &&
      time < c.startTime + c.duration,
  )
}

/** Insert a caption animation preset on the Caption FX track (styles real captions). */
export function insertCaptionEffectAt(
  toolId: string,
  toolName: string,
  atTime: number,
): string | null {
  const cfg = CAPTION_EFFECT_CONFIG[toolId]
  if (!cfg) return null

  const { tracks } = useTimelineStore.getState()
  const clips = getFullTimelineClips()
  const captionClip = captionClipAtTime(clips, atTime)

  const startTime = captionClip?.startTime ?? atTime
  const duration = captionClip?.duration ?? 3

  const id = `cfx-${Date.now().toString(36)}`
  const clip: Clip = {
    id,
    trackId: 'caption-fx',
    startTime,
    duration: Math.max(0.5, duration),
    label: cfg.label,
    type: 'effect',
    effects: {
      effectType: 'caption',
      captionAnimation: cfg.animation,
      maxWordsPerLine: cfg.maxWordsPerLine,
      captionCase: cfg.captionCase,
      captionPosition: cfg.position,
      styleToolId: toolId,
    },
  }

  commitTimelineClips(
    (allClips) => [...allClips, clip],
    {
      tracks: ensureCaptionFxTrack(tracks),
      lastEditAction: `Added ${cfg.label} to captions`,
      selectedClipIds: [id],
    },
  )
  return id
}
