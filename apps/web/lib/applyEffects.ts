/**
 * Applies Effects drawer presets to timeline clips and preview.
 */

import type { Clip } from '@/stores/timelineStore'
import { useTimelineStore } from '@/stores/timelineStore'
import {
  TRANSITIONS,
  COLOR_FILTERS,
  TEXT_TEMPLATES,
  SPEED_PRESETS,
  type EffectTab,
  type TextTemplate,
} from '@/stores/effectsStore'
import { allocateDedicatedTrack, OVERLAY_FAMILY, offsetEffectsForLane } from '@/lib/timelineLayers'
import { defaultEntranceForVisualType } from '@/lib/overlayAnimations'
import { useVisualLibraryStore, type PlacedOverlay } from '@/stores/visualLibraryStore'
import { useEffectsStore } from '@/stores/effectsStore'
import {
  defaultKeyframes,
  effectClipLabel,
  resolveEffectPreviewAt,
  resolveZoomScaleAt,
  filterStyleForIntensity,
  interpolateKeyframes,
} from '@/lib/effectKeyframes'
import type { Track } from '@/stores/timelineStore'

export interface ApplyEffectResult {
  ok: boolean
  message: string
}

const TEXT_DEFAULT_DURATION = 4
const DEFAULT_EFFECT_DURATION = 3

function ensureEffectsTrack(tracks: Track[]): Track[] {
  if (tracks.some((t) => t.id === 'effects')) return tracks
  return [
    ...tracks,
    {
      id: 'effects',
      label: 'Effects',
      color: '#7C3AED',
      muted: false,
      locked: false,
      visible: true,
    },
  ]
}

/** Resolve time range for a new keyframed effect clip (uses selected clip or playhead). */
export function resolveEffectTimeRange(): {
  start: number
  end: number
  parentClipId: string
} | null {
  const { clips, selectedClipIds, playheadTime } = useTimelineStore.getState()

  if (selectedClipIds.length === 1) {
    const c = clips.find((x) => x.id === selectedClipIds[0])
    if (c) {
      const parent =
        c.trackId === 'video'
          ? c
          : clipAtTime(clips, c.startTime + 0.01, ['video'])
      return {
        start: c.startTime,
        end: c.startTime + c.duration,
        parentClipId: parent?.id ?? c.effects?.parentClipId ?? '',
      }
    }
  }

  const parent = clipAtTime(clips, playheadTime, ['video'])
  if (!parent) return null

  const end = Math.min(
    parent.startTime + parent.duration,
    playheadTime + DEFAULT_EFFECT_DURATION,
  )
  return {
    start: playheadTime,
    end: Math.max(playheadTime + 0.5, end),
    parentClipId: parent.id,
  }
}

function addEffectClip(
  opts: {
    effectType: 'filter' | 'speed' | 'opacity'
    presetId: string
    presetName: string
    start: number
    end: number
    parentClipId: string
    startValue: number
    endValue: number
    colorFilterCss?: string
  },
): string {
  const duration = Math.max(0.1, opts.end - opts.start)
  const id = `efx-${Date.now().toString(36)}`
  const { tracks, clips } = useTimelineStore.getState()

  const effectClip: Clip = {
    id,
    trackId: 'effects',
    startTime: opts.start,
    duration,
    label: effectClipLabel(opts.effectType, opts.presetId, opts.presetName),
    type: 'effect',
    effects: {
      effectType: opts.effectType,
      effectPresetId: opts.presetId,
      parentClipId: opts.parentClipId,
      colorFilterCss: opts.colorFilterCss,
      keyframes: defaultKeyframes(duration, opts.startValue, opts.endValue),
    },
  }

  useTimelineStore.setState({
    tracks: ensureEffectsTrack(tracks),
    clips: [...clips, effectClip],
    undoStack: [
      ...useTimelineStore.getState().undoStack.slice(-49),
      { clips, tracks },
    ],
    redoStack: [],
    lastEditAction: `Added ${opts.presetName} effect`,
    selectedClipIds: [id],
  })
  useEffectsStore.getState().startEditingEffect(id)
  useEffectsStore.getState().clearEffectRange()
  return id
}

function clipAtTime(clips: Clip[], time: number, trackIds: string[]): Clip | undefined {
  return clips.find(
    (c) =>
      trackIds.includes(c.trackId) &&
      time >= c.startTime &&
      time < c.startTime + c.duration,
  )
}

/** Resolve target clip IDs: selection first, then clip under playhead. */
export function resolveTargetClipIds(
  clips: Clip[],
  selectedClipIds: string[],
  playheadTime: number,
  trackIds: string[],
): string[] {
  const selected = selectedClipIds.filter((id) => {
    const c = clips.find((x) => x.id === id)
    return c && trackIds.includes(c.trackId)
  })
  if (selected.length > 0) return selected

  const atPlayhead = clipAtTime(clips, playheadTime, trackIds)
  return atPlayhead ? [atPlayhead.id] : []
}

/** Video clip that should receive an out transition at `time` (playhead or drop point). */
export function resolveVideoClipForTransition(
  clips: Clip[],
  selectedClipIds: string[],
  time: number,
): string[] {
  const fromPlayhead = resolveTargetClipIds(clips, selectedClipIds, time, ['video'])
  if (fromPlayhead.length > 0) return fromPlayhead

  // Drop on a cut boundary — attach to the clip ending nearest that time.
  const nearEnd = clips
    .filter((c) => c.trackId === 'video')
    .map((c) => ({ c, end: c.startTime + c.duration }))
    .filter(({ end }) => Math.abs(end - time) <= 0.35)
    .sort((a, b) => Math.abs(a.end - time) - Math.abs(b.end - time))[0]

  return nearEnd ? [nearEnd.c.id] : []
}

function commitClips(nextClips: Clip[], actionLabel: string) {
  const s = useTimelineStore.getState()
  useTimelineStore.setState({
    clips: nextClips,
    undoStack: [...s.undoStack.slice(-(49)), { clips: s.clips, tracks: s.tracks }],
    redoStack: [],
    lastEditAction: actionLabel,
  })
}

function mergeClipEffects(clip: Clip, effectsPatch: NonNullable<Clip['effects']>): Clip {
  return {
    ...clip,
    effects: { ...clip.effects, ...effectsPatch },
  }
}

function defaultTextPosition(category: TextTemplate['category']): { xPct: number; yPct: number } {
  switch (category) {
    case 'lower-third':
      return { xPct: 50, yPct: 88 }
    case 'title':
      return { xPct: 50, yPct: 14 }
    case 'quote':
      return { xPct: 50, yPct: 42 }
    case 'stat':
      return { xPct: 50, yPct: 38 }
    case 'cta':
      return { xPct: 50, yPct: 82 }
    default:
      return { xPct: 50, yPct: 55 }
  }
}

function textTemplateVisualType(category: TextTemplate['category']): string {
  switch (category) {
    case 'lower-third':
      return 'key_term'
    case 'title':
      return 'hook_rewrite'
    case 'quote':
      return 'statistic'
    case 'stat':
      return 'large_number'
    case 'cta':
      return 'cta'
    default:
      return 'statistic'
  }
}

function applyFilter(effectId: string): ApplyEffectResult {
  const filter = COLOR_FILTERS.find((f) => f.id === effectId)
  if (!filter) return { ok: false, message: 'Unknown filter' }

  const range = resolveEffectTimeRange()
  if (!range) {
    return { ok: false, message: 'Select a video clip or move the playhead onto one' }
  }

  if (filter.id === 'none') {
    const { clips } = useTimelineStore.getState()
    const next = clips.filter(
      (c) =>
        !(
          c.trackId === 'effects' &&
          c.effects?.effectType === 'filter' &&
          c.startTime >= range.start - 0.01 &&
          c.startTime + c.duration <= range.end + 0.01
        ),
    )
    commitClips(next, 'Removed filters in range')
    return { ok: true, message: 'Removed filters in range' }
  }

  addEffectClip({
    effectType: 'filter',
    presetId: filter.id,
    presetName: filter.name,
    start: range.start,
    end: range.end,
    parentClipId: range.parentClipId,
    startValue: 0,
    endValue: 1,
    colorFilterCss: filter.cssFilter,
  })
  return { ok: true, message: `Added ${filter.name} on Effects track` }
}

function applyTransition(effectId: string, atTime?: number): ApplyEffectResult {
  const transition = TRANSITIONS.find((t) => t.id === effectId)
  if (!transition) return { ok: false, message: 'Unknown transition' }

  const store = useTimelineStore.getState()
  let { clips, selectedClipIds, playheadTime } = store
  const time = atTime ?? playheadTime
  let targetIds = resolveVideoClipForTransition(clips, selectedClipIds, time)
  if (targetIds.length === 0) {
    return { ok: false, message: 'Move the playhead onto a video clip or drop on a cut point' }
  }

  let targetClip = clips.find((c) => c.id === targetIds[0])
  if (!targetClip) return { ok: false, message: 'Video clip not found' }

  const clipEnd = targetClip.startTime + targetClip.duration
  const timeToEnd = clipEnd - time
  const minEdge = 0.2
  const shouldSplitAtPlayhead =
    transition.duration > 0 &&
    timeToEnd > transition.duration + 0.35 &&
    time > targetClip.startTime + minEdge &&
    time < clipEnd - minEdge

  if (shouldSplitAtPlayhead) {
    store.splitClip(targetClip.id, time)
    clips = useTimelineStore.getState().clips
    targetClip = clips.find(
      (c) =>
        c.trackId === 'video' &&
        Math.abs(c.startTime + c.duration - time) < 0.05,
    )
    if (!targetClip) {
      return { ok: false, message: 'Could not place transition at the playhead' }
    }
    targetIds = [targetClip.id]
  }

  const idSet = new Set(targetIds)
  const next = clips.map((c) =>
    idSet.has(c.id)
      ? mergeClipEffects(c, {
          transitionOut: transition.id,
          transitionDuration: transition.duration,
        })
      : c,
  )
  commitClips(next, `Applied ${transition.name} transition`)
  return { ok: true, message: `Applied ${transition.name} at this cut` }
}

/** Apply a transition preset to the video clip at the playhead or drop time. */
export function applyTransitionToTimeline(
  transitionId: string,
  atTime?: number,
): ApplyEffectResult {
  return applyTransition(transitionId, atTime)
}

function applySpeed(effectId: string): ApplyEffectResult {
  const preset = SPEED_PRESETS.find((p) => p.id === effectId)
  if (!preset) return { ok: false, message: 'Unknown speed preset' }

  const range = resolveEffectTimeRange()
  if (!range) {
    return { ok: false, message: 'Select a video clip or move the playhead onto one' }
  }

  if (preset.id === 'normal') {
    addEffectClip({
      effectType: 'speed',
      presetId: preset.id,
      presetName: preset.name,
      start: range.start,
      end: range.end,
      parentClipId: range.parentClipId,
      startValue: 1,
      endValue: 1,
    })
    return { ok: true, message: 'Added normal speed effect' }
  }

  const startVal = preset.curve === 'ramp-up' ? 0.5 : preset.curve === 'ramp-down' ? preset.multiplier : 1
  const endVal = preset.curve === 'ramp-down' ? 0.5 : preset.multiplier

  addEffectClip({
    effectType: 'speed',
    presetId: preset.id,
    presetName: preset.name,
    start: range.start,
    end: range.end,
    parentClipId: range.parentClipId,
    startValue: startVal,
    endValue: endVal,
  })
  return { ok: true, message: `Added ${preset.name} on Effects track` }
}

function applyTextTemplate(effectId: string): ApplyEffectResult {
  const template = TEXT_TEMPLATES.find((t) => t.id === effectId)
  if (!template) return { ok: false, message: 'Unknown text template' }

  const { playheadTime, tracks, clips } = useTimelineStore.getState()
  const { contentLanguage, brandKit, brandApplied } = useVisualLibraryStore.getState()

  const id = `txt-${Date.now().toString(36)}`
  const text = template.previewText
  const overlay: PlacedOverlay = {
    id,
    templateId: template.id,
    startTime: playheadTime,
    duration: TEXT_DEFAULT_DURATION,
    text,
    secondaryText: '',
    language: template.nepaliReady && contentLanguage === 'ne' ? 'ne' : 'en',
    color: brandApplied ? brandKit.primaryColor : template.previewColor,
  }

  const visualType = textTemplateVisualType(template.category)
  const duration = TEXT_DEFAULT_DURATION
  const { tracks: nextTracks, trackId } = allocateDedicatedTrack(
    tracks,
    clips,
    OVERLAY_FAMILY,
  )
  const position = defaultTextPosition(template.category)
  const baseEffects = {
    visualType,
    templateId: template.id,
    displayValue: text,
    secondaryText: '',
    suggestedVisual: template.category,
    nepaliLabel: template.nepaliReady ? text : '',
    overlayEntrance: defaultEntranceForVisualType(visualType),
    overlayExit: 'none',
    ...position,
  }

  const clip: Clip = {
    id,
    trackId,
    startTime: playheadTime,
    duration,
    label: `${template.name}: ${text.slice(0, 24)}`,
    type: 'overlay',
    effects: offsetEffectsForLane(baseEffects, trackId, OVERLAY_FAMILY.prefix) as Clip['effects'],
  }

  useTimelineStore.setState({
    tracks: nextTracks,
    clips: [...clips, clip],
    undoStack: [
      ...useTimelineStore.getState().undoStack.slice(-49),
      { clips, tracks },
    ],
    redoStack: [],
    lastEditAction: `Added ${template.name} to timeline`,
    selectedClipIds: [id],
  })
  useVisualLibraryStore.setState({
    placedOverlays: [...useVisualLibraryStore.getState().placedOverlays, overlay],
    editingOverlayId: id,
  })

  return { ok: true, message: `Added ${template.name} to timeline` }
}

/** Apply an effect from the Effects drawer to the timeline / preview. */
export function applyEffectToTimeline(effectId: string, tab: EffectTab): ApplyEffectResult {
  switch (tab) {
    case 'filters':
      return applyFilter(effectId)
    case 'transitions':
      return applyTransition(effectId)
    case 'speed':
      return applySpeed(effectId)
    case 'text':
      return applyTextTemplate(effectId)
    default:
      return { ok: false, message: 'Unknown effect tab' }
  }
}

/** Active video clip at playback time (for preview filters / speed). */
export function activeVideoClipAt(clips: Clip[], time: number): Clip | undefined {
  return clipAtTime(clips, time, ['video'])
}

/** CSS filter for the clip at the current time (includes keyframed Effects track). */
export function clipPreviewFilter(
  clip: Clip | undefined,
  allClips?: Clip[],
  time?: number,
): string {
  if (allClips != null && time != null) {
    const { filterCss, filterIntensity } = resolveEffectPreviewAt(allClips, time, clip)
    const styled = filterStyleForIntensity(filterCss, filterIntensity)
    if (styled) return styled
  }
  const css = clip?.effects?.colorFilterCss
  return css && css !== 'none' ? css : 'none'
}

/** Combined playback rate: player rate × clip speed × keyframed speed effects. */
export function clipPlaybackMultiplier(
  clip: Clip | undefined,
  allClips?: Clip[],
  time?: number,
): number {
  if (allClips != null && time != null) {
    return resolveEffectPreviewAt(allClips, time, clip).speedMultiplier
  }
  const speed = clip?.speed ?? 1
  return speed > 0 ? speed : 1
}

/** Opacity from keyframed effects + transition-out on video clip. */
export function clipPreviewOpacity(
  clip: Clip | undefined,
  time: number,
  allClips?: Clip[],
): number {
  let opacity = 1
  if (allClips) {
    opacity = resolveEffectPreviewAt(allClips, time, clip).opacity
  }
  return opacity * clipTransitionOpacity(clip, time)
}

/** Scale transform from Effects-track zoom clips or embedded video keyframes. */
export function clipPreviewScale(
  clip: Clip | undefined,
  time: number,
  allClips?: Clip[],
): number {
  if (allClips) {
    return resolveZoomScaleAt(allClips, time, clip)
  }
  if (!clip?.effects?.keyframes?.length) return 1
  const preset = clip.effects.effectPresetId ?? ''
  if (preset !== 'digital_zoom_punch' && preset !== 'ken_burns') return 1
  const local = (time - clip.startTime) / Math.max(clip.duration, 0.01)
  return interpolateKeyframes(clip.effects.keyframes, local, 1)
}

/** Short label for transition markers on the timeline. */
export function transitionTimelineLabel(transitionId: string): string {
  const map: Record<string, string> = {
    dissolve: 'Dissolve',
    'fade-black': 'Fade',
    'fade-white': 'Fade W',
    'zoom-in': 'Zoom',
    'zoom-out': 'Zoom out',
    'whip-pan': 'Whip',
    wipe: 'Wipe',
    blur: 'Blur',
    glitch: 'Glitch',
    'slide-l': 'Slide',
    'slide-r': 'Slide',
  }
  return map[transitionId] ?? transitionId
}

/** Opacity for transition-out preview near clip end. */
export function clipTransitionOpacity(clip: Clip | undefined, time: number): number {
  if (!clip?.effects?.transitionOut || !clip.effects.transitionDuration) return 1
  const trans = clip.effects.transitionOut
  const dur = clip.effects.transitionDuration
  if (dur <= 0 || trans === 'cut') return 1

  const clipEnd = clip.startTime + clip.duration
  const timeToEnd = clipEnd - time
  if (timeToEnd < 0 || timeToEnd > dur) return 1

  const progress = 1 - timeToEnd / dur
  if (trans === 'fade-black' || trans === 'fade-white') return 1 - progress
  if (trans === 'dissolve' || trans === 'blur') return 1 - progress * 0.55
  return 1
}
