/**
 * ViraEdit Timeline Engine — Timeline Compiler (→ FFmpeg)
 *
 * compileTimeline(TimelineData) → RenderPlan
 *
 * Converts a non-destructive TimelineData into a concrete RenderPlan that
 * the Python render worker uses to invoke FFmpeg.
 *
 * Windows note: all paths passed to FFmpeg must use POSIX separators
 * (path.as_posix()). That conversion is the Python caller's responsibility —
 * the compiler emits asset_ids; the caller resolves them to posix paths.
 *
 * Track handling:
 *   VIDEO   tracks → video_clips  (video + audio stream filters in filter_complex)
 *   AUDIO   tracks → audio_clips  (audio stream only, positioned with adelay)
 *   MUSIC   tracks → audio_clips  (same as AUDIO)
 *   CAPTION tracks → caption_clips  (no filter_complex entry — caption engine)
 *   OVERLAY tracks → overlay_clips  (no filter_complex entry — overlay engine)
 */

import { SCHEMA_VERSION, TrackType } from './constants'
import type { Clip, Effect, TimelineData, Transition } from './types'
import {
  computeDuration,
  getAudioTracks,
  getCaptionTracks,
  getOverlayTracks,
  getVideoTracks,
  parseResolution,
} from './utils'

// ── Public types ──────────────────────────────────────────────────────────────

/** One source file the render worker must supply to FFmpeg as an -i input */
export interface RenderInput {
  asset_id: string
  /** Zero-based index in the FFmpeg -i argument list */
  input_index: number
  /** Suggested filename when downloading from storage (name only, no directory) */
  suggested_filename: string
}

/** A single clip normalised for the render worker */
export interface RenderClip {
  track_type: TrackType
  asset_id: string
  /** Index matching the corresponding RenderInput in the plan's inputs array */
  input_index: number
  source_start: number
  source_end: number
  source_duration: number
  timeline_start: number
  timeline_end: number
  timeline_duration: number
  speed: number
  volume: number
  muted: boolean
  effects: Effect[]
  transition_in: Transition | null
  transition_out: Transition | null
  label: string
}

/**
 * Compiled render plan — everything the Python render worker needs.
 *
 * Render workflow:
 *   1. Python downloads each inputs[n].asset_id from S3 to a temp dir.
 *   2. Python prepends `-i <posix_path>` for each input (in index order).
 *   3. Python appends ffmpeg_args (filter_complex + maps + encoding).
 *   4. Python appends the output file path.
 *   5. Python calls FFmpeg.
 *   6. Caption / overlay clips are handled in separate passes.
 */
export interface RenderPlan {
  schema_version: number
  total_duration: number
  width: number
  height: number
  fps: number
  audio_sample_rate: number
  inputs: RenderInput[]
  /** Clips from video tracks, sorted by timeline_start */
  video_clips: RenderClip[]
  /** Clips from audio and music tracks, sorted by timeline_start */
  audio_clips: RenderClip[]
  /** Clips from caption tracks — handled by the caption engine */
  caption_clips: RenderClip[]
  /** Clips from overlay tracks — handled by the overlay engine */
  overlay_clips: RenderClip[]
  /** Ready-to-use FFmpeg filter_complex string (no -i flags; no output path) */
  filter_complex: string
  /**
   * FFmpeg output label to -map for the video stream, e.g. "[vout]" or "[vc0]".
   * Empty string when the timeline has no video clips.
   */
  output_video_label: string
  /**
   * FFmpeg output label to -map for the audio stream, e.g. "[aout]" or "[vac0]".
   * Empty string when there is no renderable audio.
   */
  output_audio_label: string
  /**
   * FFmpeg argument array EXCLUDING:
   *   - "ffmpeg" executable name
   *   - -i input flags (Python prepends these from the inputs array)
   *   - output file path (Python appends this)
   *
   * Includes: -filter_complex, -map, default encoding flags.
   * Python may override the encoding flags for platform-specific presets.
   */
  ffmpeg_args: string[]
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Build the asset_id → RenderInput map.
 * Each unique asset_id receives a sequential FFmpeg input index (0, 1, 2 …).
 * Clips are processed in the order they are supplied; first occurrence wins.
 */
function buildInputMap(clips: Clip[]): Map<string, RenderInput> {
  const map = new Map<string, RenderInput>()
  for (const clip of clips) {
    if (!map.has(clip.asset_id)) {
      map.set(clip.asset_id, {
        asset_id: clip.asset_id,
        input_index: map.size,
        suggested_filename: `${clip.asset_id}.mp4`,
      })
    }
  }
  return map
}

/** Convert a raw Clip + its TrackType to a RenderClip */
function toRenderClip(
  clip: Clip,
  trackType: TrackType,
  inputMap: Map<string, RenderInput>,
): RenderClip {
  const input = inputMap.get(clip.asset_id)!
  return {
    track_type: trackType,
    asset_id: clip.asset_id,
    input_index: input.input_index,
    source_start: clip.source_start,
    source_end: clip.source_end,
    source_duration: clip.source_end - clip.source_start,
    timeline_start: clip.timeline_start,
    timeline_end: clip.timeline_end,
    timeline_duration: clip.timeline_end - clip.timeline_start,
    speed: clip.speed,
    volume: clip.volume,
    muted: clip.muted,
    effects: clip.effects,
    transition_in: clip.transitions.in ?? null,
    transition_out: clip.transitions.out ?? null,
    label: clip.label ?? '',
  }
}

/** Sort clips by timeline_start ascending, returning a new array */
function sortByTimeline<T extends { timeline_start: number }>(clips: T[]): T[] {
  return [...clips].sort((a, b) => a.timeline_start - b.timeline_start)
}

/**
 * Generate an FFmpeg `atempo` filter chain for audio speed changes.
 *
 * The `atempo` filter only accepts values in [0.5, 2.0].  For speeds outside
 * that range multiple atempo filters are chained.
 *
 * Returns an empty string when speed is effectively 1.0 (no-op).
 *
 * Examples
 *   buildAtempoChain(1.0)  → ""
 *   buildAtempoChain(2.0)  → "atempo=2.000000"
 *   buildAtempoChain(2.5)  → "atempo=2.000000,atempo=1.250000"
 *   buildAtempoChain(4.0)  → "atempo=2.000000,atempo=2.000000"
 *   buildAtempoChain(0.5)  → "atempo=0.500000"
 *   buildAtempoChain(0.25) → "atempo=0.500000,atempo=0.500000"
 */
export function buildAtempoChain(speed: number): string {
  if (Math.abs(speed - 1.0) < 1e-9) return ''

  const filters: string[] = []
  let remaining = speed

  if (speed > 1.0) {
    // Speed-up: each step can multiply by at most 2.0
    while (remaining > 2.0 + 1e-9) {
      filters.push('atempo=2.000000')
      remaining /= 2.0
    }
    if (Math.abs(remaining - 1.0) > 1e-9) {
      filters.push(`atempo=${remaining.toFixed(6)}`)
    }
  } else {
    // Slow-down: each step can divide by at most 2.0 (i.e. atempo=0.5)
    while (remaining < 0.5 - 1e-9) {
      filters.push('atempo=0.500000')
      remaining *= 2.0
    }
    if (Math.abs(remaining - 1.0) > 1e-9) {
      filters.push(`atempo=${remaining.toFixed(6)}`)
    }
  }

  return filters.join(',')
}

/**
 * Build the FFmpeg filter_complex string plus output labels.
 *
 * Label convention
 *   [vc{n}]       — video stream from video clip n
 *   [vac{n}]      — audio stream from (non-muted) video clip n
 *   [vout]        — concatenated video output (≥2 video clips)
 *   [vout_audio]  — concatenated video-track audio (≥2 non-muted video clips)
 *   [aac{n}]      — audio stream from audio-only clip n (before delay)
 *   [aac{n}d]     — audio stream from audio-only clip n (after adelay)
 *   [aout]        — amixed audio output (when ≥2 audio segments present)
 *
 * Single-segment short-circuits (no rename filter needed):
 *   1 video clip         → outputVideoLabel = "[vc0]"
 *   1 non-muted video    → outputAudioLabel = "[vac0]"
 *   1 audio-only clip    → outputAudioLabel = "[aac0d]"
 *
 * Audio-only clips are positioned on the timeline via adelay so they can be
 * mixed with the video-track audio using amix.
 */
function buildFilterComplex(
  videoClips: RenderClip[],
  audioClips: RenderClip[],
): { filterComplex: string; outputVideoLabel: string; outputAudioLabel: string } {
  const parts: string[] = []

  // ── Video stream filters ──────────────────────────────────────────────────
  const videoLabels: string[] = []

  for (let n = 0; n < videoClips.length; n++) {
    const clip = videoClips[n]
    const inv = 1 / clip.speed
    const speedFilter =
      Math.abs(clip.speed - 1.0) < 1e-9
        ? ',setpts=PTS-STARTPTS'
        : `,setpts=${inv.toFixed(6)}*(PTS-STARTPTS)`

    parts.push(
      `[${clip.input_index}:v]trim=start=${clip.source_start}:end=${clip.source_end}${speedFilter}[vc${n}]`,
    )
    videoLabels.push(`[vc${n}]`)
  }

  let outputVideoLabel = ''
  if (videoLabels.length === 1) {
    // Single clip — its label is already a valid terminal; no rename needed
    outputVideoLabel = videoLabels[0]
  } else if (videoLabels.length > 1) {
    parts.push(
      `${videoLabels.join('')}concat=n=${videoLabels.length}:v=1:a=0[vout]`,
    )
    outputVideoLabel = '[vout]'
  }

  // ── Audio from video clips (each video track clip carries an audio stream) ─
  const nonMutedVideoClips = videoClips.filter((c) => !c.muted)
  const videoAudioLabels: string[] = []

  for (let n = 0; n < nonMutedVideoClips.length; n++) {
    const clip = nonMutedVideoClips[n]
    const tempoChain = buildAtempoChain(clip.speed)
    const tempoFilter = tempoChain ? `,${tempoChain}` : ''

    parts.push(
      `[${clip.input_index}:a]atrim=start=${clip.source_start}:end=${clip.source_end}${tempoFilter},asetpts=PTS-STARTPTS,volume=${clip.volume.toFixed(6)}[vac${n}]`,
    )
    videoAudioLabels.push(`[vac${n}]`)
  }

  const audioSegments: string[] = []

  if (videoAudioLabels.length === 1) {
    audioSegments.push(videoAudioLabels[0])
  } else if (videoAudioLabels.length > 1) {
    parts.push(
      `${videoAudioLabels.join('')}concat=n=${videoAudioLabels.length}:v=0:a=1[vout_audio]`,
    )
    audioSegments.push('[vout_audio]')
  }

  // ── Audio from audio-only clips (positioned on timeline with adelay) ─────
  const nonMutedAudioClips = audioClips.filter((c) => !c.muted)

  for (let n = 0; n < nonMutedAudioClips.length; n++) {
    const clip = nonMutedAudioClips[n]
    const tempoChain = buildAtempoChain(clip.speed)
    const tempoFilter = tempoChain ? `,${tempoChain}` : ''
    const delayMs = Math.round(clip.timeline_start * 1000)

    parts.push(
      `[${clip.input_index}:a]atrim=start=${clip.source_start}:end=${clip.source_end}${tempoFilter},asetpts=PTS-STARTPTS,volume=${clip.volume.toFixed(6)}[aac${n}]`,
    )
    parts.push(`[aac${n}]adelay=${delayMs}|${delayMs}[aac${n}d]`)
    audioSegments.push(`[aac${n}d]`)
  }

  // ── Final audio output ────────────────────────────────────────────────────
  let outputAudioLabel = ''
  if (audioSegments.length === 1) {
    // Single segment — use its existing label directly
    outputAudioLabel = audioSegments[0]
  } else if (audioSegments.length > 1) {
    parts.push(
      `${audioSegments.join('')}amix=inputs=${audioSegments.length}:duration=longest[aout]`,
    )
    outputAudioLabel = '[aout]'
  }

  return {
    filterComplex: parts.join(';'),
    outputVideoLabel,
    outputAudioLabel,
  }
}

/** Build the ffmpeg_args array (no -i flags, no output path) */
function buildFfmpegArgs(
  filterComplex: string,
  outputVideoLabel: string,
  outputAudioLabel: string,
  fps: number,
  audioSampleRate: number,
): string[] {
  const args: string[] = []

  if (filterComplex) {
    args.push('-filter_complex', filterComplex)
  }

  if (outputVideoLabel) {
    args.push('-map', outputVideoLabel)
  }
  if (outputAudioLabel) {
    args.push('-map', outputAudioLabel)
  }

  // Default encoding — Python caller may override for platform-specific presets
  if (outputVideoLabel) {
    args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-r', String(fps))
  }
  if (outputAudioLabel) {
    args.push('-c:a', 'aac', '-b:a', '192k', '-ar', String(audioSampleRate))
  }

  return args
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compile a TimelineData into a RenderPlan ready for the Python render worker.
 *
 * The input timeline is never mutated — a fresh RenderPlan is constructed.
 *
 * @throws Error — if global_settings.resolution cannot be parsed
 */
export function compileTimeline(timeline: TimelineData): RenderPlan {
  const { global_settings } = timeline
  const { width, height } = parseResolution(global_settings.resolution)
  const totalDuration = computeDuration(timeline)

  // ── Gather clips, preserving each clip's track type ───────────────────────
  const videoClipPairs = getVideoTracks(timeline).flatMap((t) =>
    t.clips.map((c) => ({ clip: c, trackType: TrackType.VIDEO as TrackType })),
  )
  const audioClipPairs = getAudioTracks(timeline).flatMap((t) =>
    t.clips.map((c) => ({ clip: c, trackType: t.type as TrackType })),
  )
  const captionClipPairs = getCaptionTracks(timeline).flatMap((t) =>
    t.clips.map((c) => ({ clip: c, trackType: TrackType.CAPTIONS as TrackType })),
  )
  const overlayClipPairs = getOverlayTracks(timeline).flatMap((t) =>
    t.clips.map((c) => ({ clip: c, trackType: TrackType.OVERLAY as TrackType })),
  )

  // ── Build input map (deduplicate asset_ids across all tracks) ─────────────
  const allRawClips = [
    ...videoClipPairs,
    ...audioClipPairs,
    ...captionClipPairs,
    ...overlayClipPairs,
  ].map((p) => p.clip)

  const inputMap = buildInputMap(allRawClips)
  const inputs = Array.from(inputMap.values()).sort((a, b) => a.input_index - b.input_index)

  // ── Build RenderClip lists sorted by timeline_start ───────────────────────
  const videoClips = sortByTimeline(
    videoClipPairs.map(({ clip, trackType }) => toRenderClip(clip, trackType, inputMap)),
  )
  const audioClips = sortByTimeline(
    audioClipPairs.map(({ clip, trackType }) => toRenderClip(clip, trackType, inputMap)),
  )
  const captionClips = sortByTimeline(
    captionClipPairs.map(({ clip, trackType }) => toRenderClip(clip, trackType, inputMap)),
  )
  const overlayClips = sortByTimeline(
    overlayClipPairs.map(({ clip, trackType }) => toRenderClip(clip, trackType, inputMap)),
  )

  // ── Build filter_complex ──────────────────────────────────────────────────
  const { filterComplex, outputVideoLabel, outputAudioLabel } = buildFilterComplex(
    videoClips,
    audioClips,
  )

  // ── Build ffmpeg_args ─────────────────────────────────────────────────────
  const ffmpegArgs = buildFfmpegArgs(
    filterComplex,
    outputVideoLabel,
    outputAudioLabel,
    global_settings.fps,
    global_settings.audio_sample_rate,
  )

  return {
    schema_version: SCHEMA_VERSION,
    total_duration: totalDuration,
    width,
    height,
    fps: global_settings.fps,
    audio_sample_rate: global_settings.audio_sample_rate,
    inputs,
    video_clips: videoClips,
    audio_clips: audioClips,
    caption_clips: captionClips,
    overlay_clips: overlayClips,
    filter_complex: filterComplex,
    output_video_label: outputVideoLabel,
    output_audio_label: outputAudioLabel,
    ffmpeg_args: ffmpegArgs,
  }
}
