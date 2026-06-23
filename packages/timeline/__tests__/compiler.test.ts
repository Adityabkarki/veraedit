/**
 * Tests for packages/timeline/src/compiler.ts
 *
 * compileTimeline(TimelineData) → RenderPlan
 * buildAtempoChain(speed)       → string
 */

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, TrackType } from '../src/constants'
import { buildAtempoChain, compileTimeline } from '../src/compiler'
import { createClip, createTimeline, createTrack, createTransition } from '../src/factory'
import type { Clip, Track } from '../src/types'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeClip(
  id: string,
  overrides: Partial<Parameters<typeof createClip>[0]> = {},
): Clip {
  return createClip({
    id,
    asset_id: `asset-${id}`,
    source_start: 0,
    source_end: 10,
    timeline_start: 0,
    timeline_end: 10,
    ...overrides,
  })
}

function makeTrack(id: string, type: TrackType, clips: Clip[] = []): Track {
  return createTrack({ id, type, clips })
}

// ── buildAtempoChain ──────────────────────────────────────────────────────────

describe('buildAtempoChain', () => {
  it('speed 1.0 → empty string (no-op)', () => {
    expect(buildAtempoChain(1.0)).toBe('')
  })

  it('speed 1.0 via near-zero delta → empty string', () => {
    expect(buildAtempoChain(1.0 + 1e-10)).toBe('')
  })

  it('speed 2.0 → single atempo=2.000000', () => {
    expect(buildAtempoChain(2.0)).toBe('atempo=2.000000')
  })

  it('speed 0.5 → single atempo=0.500000', () => {
    expect(buildAtempoChain(0.5)).toBe('atempo=0.500000')
  })

  it('speed 1.5 → single atempo=1.500000', () => {
    expect(buildAtempoChain(1.5)).toBe('atempo=1.500000')
  })

  it('speed 0.75 → single atempo=0.750000', () => {
    expect(buildAtempoChain(0.75)).toBe('atempo=0.750000')
  })

  it('speed 2.5 → chained atempo=2.0 then atempo=1.25', () => {
    expect(buildAtempoChain(2.5)).toBe('atempo=2.000000,atempo=1.250000')
  })

  it('speed 4.0 → two atempo=2.0 steps', () => {
    expect(buildAtempoChain(4.0)).toBe('atempo=2.000000,atempo=2.000000')
  })

  it('speed 0.25 → two atempo=0.5 steps', () => {
    expect(buildAtempoChain(0.25)).toBe('atempo=0.500000,atempo=0.500000')
  })

  it('speed 10.0 → four atempo steps (2×2×2×1.25)', () => {
    const chain = buildAtempoChain(10.0)
    const steps = chain.split(',')
    // 2.0 × 2.0 × 2.0 × 1.25 = 10.0
    expect(steps).toHaveLength(4)
    expect(steps[0]).toBe('atempo=2.000000')
    expect(steps[1]).toBe('atempo=2.000000')
    expect(steps[2]).toBe('atempo=2.000000')
    expect(steps[3]).toMatch(/^atempo=1\.2/)
  })
})

// ── compileTimeline — RenderPlan metadata ─────────────────────────────────────

describe('compileTimeline — RenderPlan metadata', () => {
  it('schema_version equals SCHEMA_VERSION constant', () => {
    const plan = compileTimeline(createTimeline())
    expect(plan.schema_version).toBe(SCHEMA_VERSION)
  })

  it('empty timeline → total_duration is 0', () => {
    const plan = compileTimeline(createTimeline())
    expect(plan.total_duration).toBe(0)
  })

  it('total_duration = max timeline_end across all clips', () => {
    const clip = makeClip('c1', { timeline_start: 5, timeline_end: 20 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const plan = compileTimeline(tl)
    expect(plan.total_duration).toBe(20)
  })

  it('resolution parsed into width and height', () => {
    const tl = createTimeline({ global_settings: { resolution: '1920x1080' } })
    const plan = compileTimeline(tl)
    expect(plan.width).toBe(1920)
    expect(plan.height).toBe(1080)
  })

  it('vertical resolution (9:16) parsed correctly', () => {
    const tl = createTimeline({ global_settings: { resolution: '1080x1920' } })
    const plan = compileTimeline(tl)
    expect(plan.width).toBe(1080)
    expect(plan.height).toBe(1920)
  })

  it('fps preserved from global_settings', () => {
    const tl = createTimeline({ global_settings: { fps: 60 } })
    expect(compileTimeline(tl).fps).toBe(60)
  })

  it('audio_sample_rate preserved from global_settings', () => {
    const tl = createTimeline({ global_settings: { audio_sample_rate: 44100 } })
    expect(compileTimeline(tl).audio_sample_rate).toBe(44100)
  })

  it('empty timeline → no inputs', () => {
    expect(compileTimeline(createTimeline()).inputs).toHaveLength(0)
  })

  it('empty timeline → no video_clips', () => {
    expect(compileTimeline(createTimeline()).video_clips).toHaveLength(0)
  })

  it('empty timeline → empty filter_complex', () => {
    expect(compileTimeline(createTimeline()).filter_complex).toBe('')
  })

  it('empty timeline → empty output labels', () => {
    const plan = compileTimeline(createTimeline())
    expect(plan.output_video_label).toBe('')
    expect(plan.output_audio_label).toBe('')
  })
})

// ── compileTimeline — inputs deduplication ────────────────────────────────────

describe('compileTimeline — inputs deduplication', () => {
  it('single clip → one input with input_index=0', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const { inputs } = compileTimeline(tl)
    expect(inputs).toHaveLength(1)
    expect(inputs[0].input_index).toBe(0)
    expect(inputs[0].asset_id).toBe('asset-c1')
  })

  it('two clips with same asset_id → one input', () => {
    const c1 = makeClip('c1', { asset_id: 'shared-asset', timeline_start: 0, timeline_end: 5 })
    const c2 = makeClip('c2', { asset_id: 'shared-asset', source_start: 5, source_end: 15, timeline_start: 5, timeline_end: 15 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    expect(compileTimeline(tl).inputs).toHaveLength(1)
  })

  it('two clips with different asset_ids → two inputs with sequential indices', () => {
    const c1 = makeClip('c1', { asset_id: 'asset-A' })
    const c2 = makeClip('c2', { asset_id: 'asset-B', timeline_start: 10, timeline_end: 20 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    const { inputs } = compileTimeline(tl)
    expect(inputs).toHaveLength(2)
    expect(inputs[0].input_index).toBe(0)
    expect(inputs[1].input_index).toBe(1)
  })

  it('video clip and audio clip with distinct assets → two inputs', () => {
    const vc = makeClip('vc', { asset_id: 'video-asset' })
    const ac = makeClip('ac', { asset_id: 'audio-asset' })
    const tl = createTimeline({
      tracks: [
        makeTrack('tv', TrackType.VIDEO, [vc]),
        makeTrack('ta', TrackType.AUDIO, [ac]),
      ],
    })
    expect(compileTimeline(tl).inputs).toHaveLength(2)
  })

  it('suggested_filename is asset_id + .mp4', () => {
    const clip = makeClip('c1', { asset_id: 'my-asset-uuid' })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const { inputs } = compileTimeline(tl)
    expect(inputs[0].suggested_filename).toBe('my-asset-uuid.mp4')
  })
})

// ── compileTimeline — video_clips / audio_clips / caption_clips ───────────────

describe('compileTimeline — clip lists', () => {
  it('video track clip appears in video_clips', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).video_clips).toHaveLength(1)
  })

  it('audio track clip appears in audio_clips, NOT video_clips', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.AUDIO, [clip])] })
    const plan = compileTimeline(tl)
    expect(plan.audio_clips).toHaveLength(1)
    expect(plan.video_clips).toHaveLength(0)
  })

  it('music track clip appears in audio_clips with track_type=MUSIC', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.MUSIC, [clip])] })
    const plan = compileTimeline(tl)
    expect(plan.audio_clips).toHaveLength(1)
    expect(plan.audio_clips[0].track_type).toBe(TrackType.MUSIC)
  })

  it('caption track clip appears in caption_clips', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.CAPTIONS, [clip])] })
    const plan = compileTimeline(tl)
    expect(plan.caption_clips).toHaveLength(1)
    expect(plan.video_clips).toHaveLength(0)
    expect(plan.audio_clips).toHaveLength(0)
  })

  it('overlay track clip appears in overlay_clips', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.OVERLAY, [clip])] })
    const plan = compileTimeline(tl)
    expect(plan.overlay_clips).toHaveLength(1)
    expect(plan.video_clips).toHaveLength(0)
  })

  it('RenderClip has correct computed durations', () => {
    const clip = makeClip('c1', {
      source_start: 2, source_end: 7,
      timeline_start: 5, timeline_end: 10,
    })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const rc = compileTimeline(tl).video_clips[0]
    expect(rc.source_duration).toBe(5)
    expect(rc.timeline_duration).toBe(5)
  })

  it('RenderClip transition_in reflects clip transitions', () => {
    const transition = createTransition()
    const clip = makeClip('c1', {
      transitions: { in: transition, out: null },
    })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const rc = compileTimeline(tl).video_clips[0]
    expect(rc.transition_in).toEqual(transition)
    expect(rc.transition_out).toBeNull()
  })

  it('caption clips NOT in filter_complex', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.CAPTIONS, [clip])] })
    const plan = compileTimeline(tl)
    expect(plan.filter_complex).toBe('')
    expect(plan.output_video_label).toBe('')
  })
})

// ── compileTimeline — clip sorting ────────────────────────────────────────────

describe('compileTimeline — clip sorting', () => {
  it('video_clips sorted by timeline_start ascending', () => {
    const c1 = makeClip('c1', { timeline_start: 10, timeline_end: 20 })
    const c2 = makeClip('c2', { timeline_start: 0, timeline_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    const { video_clips } = compileTimeline(tl)
    expect(video_clips[0].asset_id).toBe('asset-c2')
    expect(video_clips[1].asset_id).toBe('asset-c1')
  })

  it('audio_clips sorted by timeline_start ascending', () => {
    const c1 = makeClip('c1', { timeline_start: 20, timeline_end: 30 })
    const c2 = makeClip('c2', { timeline_start: 0, timeline_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.AUDIO, [c1, c2])] })
    const { audio_clips } = compileTimeline(tl)
    expect(audio_clips[0].asset_id).toBe('asset-c2')
    expect(audio_clips[1].asset_id).toBe('asset-c1')
  })

  it('caption_clips sorted by timeline_start ascending', () => {
    const c1 = makeClip('c1', { timeline_start: 15, timeline_end: 20 })
    const c2 = makeClip('c2', { timeline_start: 0, timeline_end: 5 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.CAPTIONS, [c1, c2])] })
    const { caption_clips } = compileTimeline(tl)
    expect(caption_clips[0].asset_id).toBe('asset-c2')
    expect(caption_clips[1].asset_id).toBe('asset-c1')
  })
})

// ── compileTimeline — filter_complex: video stream ────────────────────────────

describe('compileTimeline — filter_complex video stream', () => {
  it('single video clip → trim filter present', () => {
    const clip = makeClip('c1', { source_start: 2, source_end: 12 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('trim=start=2:end=12')
  })

  it('single video clip speed=1 → setpts=PTS-STARTPTS', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('setpts=PTS-STARTPTS')
    expect(compileTimeline(tl).filter_complex).not.toContain('0.500000*(PTS-STARTPTS)')
  })

  it('speed 2× → setpts=0.500000*(PTS-STARTPTS)', () => {
    const clip = makeClip('c1', { speed: 2.0, source_end: 10, timeline_end: 5 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('setpts=0.500000*(PTS-STARTPTS)')
  })

  it('speed 0.5× → setpts=2.000000*(PTS-STARTPTS)', () => {
    const clip = makeClip('c1', { speed: 0.5, source_end: 5, timeline_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('setpts=2.000000*(PTS-STARTPTS)')
  })

  it('single video clip → output_video_label is [vc0]', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).output_video_label).toBe('[vc0]')
  })

  it('two video clips → concat filter present', () => {
    const c1 = makeClip('c1', { timeline_start: 0, timeline_end: 10 })
    const c2 = makeClip('c2', { timeline_start: 10, timeline_end: 20 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    expect(compileTimeline(tl).filter_complex).toContain('concat=n=2:v=1:a=0[vout]')
  })

  it('two video clips → output_video_label is [vout]', () => {
    const c1 = makeClip('c1', { timeline_start: 0, timeline_end: 10 })
    const c2 = makeClip('c2', { timeline_start: 10, timeline_end: 20 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    expect(compileTimeline(tl).output_video_label).toBe('[vout]')
  })

  it('two clips same asset → each uses same input index in filter', () => {
    const c1 = makeClip('c1', { asset_id: 'same', timeline_start: 0, timeline_end: 5 })
    const c2 = makeClip('c2', { asset_id: 'same', source_start: 5, source_end: 15, timeline_start: 5, timeline_end: 15 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    const fc = compileTimeline(tl).filter_complex
    // Both video filters reference [0:v]
    expect(fc.split('[0:v]')).toHaveLength(3) // 2 occurrences → 3 parts when split
  })
})

// ── compileTimeline — filter_complex: audio stream ───────────────────────────

describe('compileTimeline — filter_complex audio stream', () => {
  it('non-muted video clip → atrim filter for audio present', () => {
    const clip = makeClip('c1', { source_start: 0, source_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('atrim=start=0:end=10')
  })

  it('muted video clip → no atrim filter (no audio output)', () => {
    const clip = makeClip('c1', { muted: true })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const plan = compileTimeline(tl)
    expect(plan.filter_complex).not.toContain('atrim')
    expect(plan.output_audio_label).toBe('')
  })

  it('volume 0.5 → volume=0.500000 in audio filter', () => {
    const clip = makeClip('c1', { volume: 0.5 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('volume=0.500000')
  })

  it('speed 2× video clip → atempo=2.000000 in audio filter', () => {
    const clip = makeClip('c1', { speed: 2.0, source_end: 10, timeline_end: 5 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('atempo=2.000000')
  })

  it('audio-only clip → atrim with adelay present', () => {
    const clip = makeClip('c1', { timeline_start: 5, timeline_end: 15 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.AUDIO, [clip])] })
    const fc = compileTimeline(tl).filter_complex
    expect(fc).toContain('atrim')
    expect(fc).toContain('adelay=5000|5000')
  })

  it('audio-only clip at timeline_start=0 → adelay=0|0', () => {
    const clip = makeClip('c1', { timeline_start: 0, timeline_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.AUDIO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('adelay=0|0')
  })

  it('single non-muted video clip → output_audio_label is [vac0]', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    expect(compileTimeline(tl).output_audio_label).toBe('[vac0]')
  })

  it('single audio-only clip → output_audio_label is [aac0d]', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.AUDIO, [clip])] })
    expect(compileTimeline(tl).output_audio_label).toBe('[aac0d]')
  })

  it('two non-muted video clips → video audio concat=n=2', () => {
    const c1 = makeClip('c1', { timeline_start: 0, timeline_end: 10 })
    const c2 = makeClip('c2', { timeline_start: 10, timeline_end: 20 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    expect(compileTimeline(tl).filter_complex).toContain('concat=n=2:v=0:a=1[vout_audio]')
  })

  it('video track + audio track → amix filter combines both streams', () => {
    const vc = makeClip('vc', { asset_id: 'vid', timeline_start: 0, timeline_end: 10 })
    const ac = makeClip('ac', { asset_id: 'aud', timeline_start: 0, timeline_end: 10 })
    const tl = createTimeline({
      tracks: [
        makeTrack('tv', TrackType.VIDEO, [vc]),
        makeTrack('ta', TrackType.AUDIO, [ac]),
      ],
    })
    const plan = compileTimeline(tl)
    expect(plan.filter_complex).toContain('amix=inputs=2:duration=longest[aout]')
    expect(plan.output_audio_label).toBe('[aout]')
  })

  it('muted video clip + non-muted audio clip → output_audio_label is [aac0d]', () => {
    const vc = makeClip('vc', { asset_id: 'vid', muted: true })
    const ac = makeClip('ac', { asset_id: 'aud' })
    const tl = createTimeline({
      tracks: [
        makeTrack('tv', TrackType.VIDEO, [vc]),
        makeTrack('ta', TrackType.AUDIO, [ac]),
      ],
    })
    const plan = compileTimeline(tl)
    // Only audio-only clip contributes → no amix needed
    expect(plan.filter_complex).not.toContain('amix')
    expect(plan.output_audio_label).toBe('[aac0d]')
  })

  it('all clips muted → output_audio_label is empty', () => {
    const c1 = makeClip('c1', { muted: true })
    const c2 = makeClip('c2', { muted: true })
    const tl = createTimeline({
      tracks: [
        makeTrack('tv', TrackType.VIDEO, [c1]),
        makeTrack('ta', TrackType.AUDIO, [c2]),
      ],
    })
    expect(compileTimeline(tl).output_audio_label).toBe('')
  })
})

// ── compileTimeline — ffmpeg_args ─────────────────────────────────────────────

describe('compileTimeline — ffmpeg_args', () => {
  function timelineWithOneVideoClip() {
    const clip = makeClip('c1')
    return createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
  }

  it('empty timeline → empty ffmpeg_args', () => {
    expect(compileTimeline(createTimeline()).ffmpeg_args).toHaveLength(0)
  })

  it('contains -filter_complex flag', () => {
    const args = compileTimeline(timelineWithOneVideoClip()).ffmpeg_args
    expect(args).toContain('-filter_complex')
  })

  it('contains -map for video label', () => {
    const plan = compileTimeline(timelineWithOneVideoClip())
    const mapIdx = plan.ffmpeg_args.indexOf('-map')
    expect(mapIdx).toBeGreaterThanOrEqual(0)
    expect(plan.ffmpeg_args[mapIdx + 1]).toBe(plan.output_video_label)
  })

  it('contains -map for audio label when audio present', () => {
    const plan = compileTimeline(timelineWithOneVideoClip())
    const mapArgs = plan.ffmpeg_args
      .map((a, i) => (a === '-map' ? plan.ffmpeg_args[i + 1] : null))
      .filter(Boolean)
    expect(mapArgs).toContain(plan.output_audio_label)
  })

  it('contains -c:v libx264 for video encoding', () => {
    const args = compileTimeline(timelineWithOneVideoClip()).ffmpeg_args
    expect(args).toContain('-c:v')
    expect(args).toContain('libx264')
  })

  it('contains -c:a aac for audio encoding', () => {
    const args = compileTimeline(timelineWithOneVideoClip()).ffmpeg_args
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
  })

  it('contains -r with fps value', () => {
    const tl = createTimeline({
      global_settings: { fps: 60 },
      tracks: [makeTrack('t1', TrackType.VIDEO, [makeClip('c1')])],
    })
    const args = compileTimeline(tl).ffmpeg_args
    const rIdx = args.indexOf('-r')
    expect(rIdx).toBeGreaterThanOrEqual(0)
    expect(args[rIdx + 1]).toBe('60')
  })

  it('contains -ar with audio_sample_rate value', () => {
    const tl = createTimeline({
      global_settings: { audio_sample_rate: 44100 },
      tracks: [makeTrack('t1', TrackType.VIDEO, [makeClip('c1')])],
    })
    const args = compileTimeline(tl).ffmpeg_args
    const arIdx = args.indexOf('-ar')
    expect(arIdx).toBeGreaterThanOrEqual(0)
    expect(args[arIdx + 1]).toBe('44100')
  })

  it('audio-only timeline → no -c:v in args', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.AUDIO, [clip])] })
    expect(compileTimeline(tl).ffmpeg_args).not.toContain('-c:v')
  })

  it('ffmpeg_args does NOT contain -i flags', () => {
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [makeClip('c1')])] })
    expect(compileTimeline(tl).ffmpeg_args).not.toContain('-i')
  })
})

// ── compileTimeline — immutability ────────────────────────────────────────────

describe('compileTimeline — immutability', () => {
  it('input timeline tracks array is not mutated', () => {
    const clip = makeClip('c1')
    const track = makeTrack('t1', TrackType.VIDEO, [clip])
    const tl = createTimeline({ tracks: [track] })
    const originalTrackCount = tl.tracks.length
    compileTimeline(tl)
    expect(tl.tracks).toHaveLength(originalTrackCount)
  })

  it('input timeline clips are not mutated', () => {
    const clip = makeClip('c1', { timeline_start: 0, timeline_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    compileTimeline(tl)
    expect(tl.tracks[0].clips[0].timeline_start).toBe(0)
    expect(tl.tracks[0].clips[0].timeline_end).toBe(10)
  })

  it('modifying returned video_clips does not affect input timeline', () => {
    const clip = makeClip('c1')
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const plan = compileTimeline(tl)
    plan.video_clips[0].timeline_start = 999
    expect(tl.tracks[0].clips[0].timeline_start).toBe(0)
  })
})

// ── compileTimeline — end-to-end filter_complex verification ──────────────────

describe('compileTimeline — end-to-end filter_complex', () => {
  it('single video clip: exact filter_complex structure', () => {
    const clip = makeClip('c1', {
      asset_id: 'asset-A',
      source_start: 2,
      source_end: 12,
    })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const { filter_complex } = compileTimeline(tl)
    // Video: trim + setpts
    expect(filter_complex).toContain('[0:v]trim=start=2:end=12,setpts=PTS-STARTPTS[vc0]')
    // Audio: atrim + asetpts + volume
    expect(filter_complex).toContain('[0:a]atrim=start=2:end=12,asetpts=PTS-STARTPTS,volume=1.000000[vac0]')
    // No concat (single clip)
    expect(filter_complex).not.toContain('concat')
  })

  it('two video clips different assets: concat present, correct input indices', () => {
    const c1 = makeClip('c1', { asset_id: 'A', timeline_start: 0, timeline_end: 10 })
    const c2 = makeClip('c2', { asset_id: 'B', timeline_start: 10, timeline_end: 20 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [c1, c2])] })
    const { filter_complex } = compileTimeline(tl)
    expect(filter_complex).toContain('[0:v]trim=')
    expect(filter_complex).toContain('[1:v]trim=')
    expect(filter_complex).toContain('[vc0][vc1]concat=n=2:v=1:a=0[vout]')
    expect(filter_complex).toContain('[vc0][vc1]concat=n=2:v=1:a=0[vout]')
  })

  it('speed 2.5× clip: correct video and audio speed filters', () => {
    const clip = makeClip('c1', { speed: 2.5, source_end: 25, timeline_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.VIDEO, [clip])] })
    const { filter_complex } = compileTimeline(tl)
    // setpts factor = 1/2.5 = 0.4
    expect(filter_complex).toContain('setpts=0.400000*(PTS-STARTPTS)')
    // atempo chain for 2.5×
    expect(filter_complex).toContain('atempo=2.000000,atempo=1.250000')
  })

  it('audio track clip at timeline_start=3.5s: correct adelay', () => {
    const clip = makeClip('c1', { timeline_start: 3.5, timeline_end: 10 })
    const tl = createTimeline({ tracks: [makeTrack('t1', TrackType.AUDIO, [clip])] })
    expect(compileTimeline(tl).filter_complex).toContain('adelay=3500|3500')
  })
})
