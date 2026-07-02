/**
 * Tests for lib/timelineApi.ts
 */

import { describe, it, expect } from 'vitest'
import {
  apiTimelineToStore,
  storeToApiTimeline,
  apiTimelineHasVideo,
  normalizePrimaryTrackId,
  type ApiTimelineData,
} from '@/lib/timelineApi'
import { INITIAL_TRACKS } from '@/stores/timelineStore'

const SAMPLE: ApiTimelineData = {
  schema_version: 1,
  tracks: [
    {
      id: 'track-video-1',
      type: 'video',
      name: 'Main Video',
      clips: [
        {
          id: 'clip-1',
          asset_id: 'asset-abc',
          source_start: 0,
          source_end: 12,
          timeline_start: 0,
          timeline_end: 12,
          label: 'Intro',
        },
      ],
    },
    { id: 'track-audio-1', type: 'audio', name: 'Audio', clips: [] },
  ],
  global_settings: { duration: 12, resolution: '1920x1080', fps: 30 },
  metadata: {},
}

describe('timelineApi — normalizePrimaryTrackId', () => {
  it('preserves numbered overlay and image lane ids from API', () => {
    expect(normalizePrimaryTrackId('track-overlay-8-1', 'overlay')).toBe('overlay-8')
    expect(normalizePrimaryTrackId('track-images-2-1', 'overlay')).toBe('images-2')
    expect(normalizePrimaryTrackId('track-overlay-1', 'overlay')).toBe('overlay')
  })
})

describe('timelineApi — apiTimelineToStore', () => {
  it('maps video clip to frontend store', () => {
    const { clips } = apiTimelineToStore(SAMPLE)
    expect(clips).toHaveLength(1)
    expect(clips[0].trackId).toBe('video')
    expect(clips[0].duration).toBeCloseTo(12)
    expect(clips[0].label).toBe('Intro')
  })

  it('preserves default editor tracks', () => {
    const { tracks } = apiTimelineToStore(SAMPLE)
    expect(tracks.length).toBeGreaterThanOrEqual(4)
    expect(tracks[0].id).toBe('video')
  })
})

describe('timelineApi — storeToApiTimeline', () => {
  it('round-trips clip count and duration', () => {
    const { tracks, clips } = apiTimelineToStore(SAMPLE)
    const api = storeToApiTimeline(tracks, clips, 'asset-abc', 12)
    const videoTrack = api.tracks.find((t) => t.type === 'video')
    expect(videoTrack?.clips).toHaveLength(1)
    expect(videoTrack?.clips[0].asset_id).toBe('asset-abc')
    expect(videoTrack?.clips[0].timeline_end).toBeCloseTo(12)
  })

  it('persists color filter and transition effects', () => {
    const { tracks, clips } = apiTimelineToStore(SAMPLE)
    const withFx = clips.map((c) =>
      c.id === 'clip-1'
        ? {
            ...c,
            speed: 2,
            effects: {
              colorFilterId: 'warm',
              colorFilterCss: 'sepia(30%)',
              transitionOut: 'dissolve',
              transitionDuration: 0.5,
            },
          }
        : c,
    )
    const api = storeToApiTimeline(tracks, withFx, 'asset-abc', 12)
    const clip = api.tracks.find((t) => t.type === 'video')?.clips[0]
    expect(clip?.speed).toBe(2)
    expect(clip?.effects?.some((e) => e.type === 'color_filter')).toBe(true)
    expect(clip?.effects?.some((e) => e.type === 'transition_out')).toBe(true)

    const { clips: restored } = apiTimelineToStore(api)
    expect(restored[0].effects?.colorFilterId).toBe('warm')
    expect(restored[0].effects?.transitionOut).toBe('dissolve')
    expect(restored[0].speed).toBe(2)
  })

  it('round-trips dedicated element lanes without collapsing to overlay', () => {
    const tracks = INITIAL_TRACKS.map((t) => ({ ...t }))
    const clips = [
      { id: 'e1', trackId: 'overlay', startTime: 0, duration: 2, label: 'Title', type: 'overlay' as const },
      { id: 'e5', trackId: 'overlay-5', startTime: 0, duration: 2, label: 'Card', type: 'overlay' as const, effects: { visualType: 'data_card' } },
      { id: 'i2', trackId: 'images-2', startTime: 0, duration: 3, label: 'Photo', type: 'overlay' as const, effects: { visualType: 'image_slot', mediaKind: 'image' as const } },
    ]
    const api = storeToApiTimeline(tracks, clips, 'asset-abc', 12)
    const { clips: restored } = apiTimelineToStore(api)
    expect(restored.find((c) => c.id === 'e5')?.trackId).toBe('overlay-5')
    expect(restored.find((c) => c.id === 'i2')?.trackId).toBe('images-2')
  })

  it('persists storage key and per-clip asset id for broll', () => {
    const { tracks } = apiTimelineToStore(SAMPLE)
    const clips = [{
      id: 'broll-1',
      trackId: 'broll' as const,
      startTime: 2,
      duration: 4,
      label: 'B-Roll',
      type: 'overlay' as const,
      effects: {
        visualType: 'broll_overlay',
        overlayMode: 'fullscreen' as const,
        mediaAssetId: 'media-99',
        storageKey: 'projects/p1/media/clip.mp4',
        mediaUrl: 'https://example.com/clip.mp4',
      },
    }]
    const api = storeToApiTimeline(tracks, clips, 'asset-abc', 12)
    const brollTrack = api.tracks.find((t) => t.type === 'overlay')
    const clip = brollTrack?.clips[0]
    expect(clip?.asset_id).toBe('media-99')
    const overlayFx = clip?.effects?.find((e) => e.type === 'visual_overlay')
    expect(overlayFx?.params?.storage_key).toBe('projects/p1/media/clip.mp4')
  })

  it('persists sfx slug and volume on audio lane', () => {
    const { tracks } = apiTimelineToStore(SAMPLE)
    const clips = [{
      id: 'sfx-1',
      trackId: 'sfx' as const,
      startTime: 1,
      duration: 0.35,
      label: 'SFX: Whoosh',
      type: 'audio' as const,
      effects: { sfxSlug: 'whoosh', sfxType: 'whoosh', sfxVolume: 0.4 },
    }]
    const api = storeToApiTimeline(tracks, clips, 'asset-abc', 12)
    const audioTrack = api.tracks.find((t) => t.type === 'audio' && t.clips.length > 0)
    const clip = audioTrack?.clips[0]
    expect(clip?.volume).toBe(0.4)
    const sfxFx = clip?.effects?.find((e) => e.type === 'sfx_slot')
    expect(sfxFx?.params?.sfx_slug).toBe('whoosh')
  })

  it('persists caption clip text', () => {
    const { tracks } = apiTimelineToStore(SAMPLE)
    const clips = [{
      id: 'cap-1',
      trackId: 'captions' as const,
      startTime: 1,
      duration: 2.5,
      label: 'नमस्ते',
      type: 'caption' as const,
      effects: { displayValue: 'नमस्ते साथीहरू', captionIndex: 1 },
    }]
    const api = storeToApiTimeline(tracks, clips, 'asset-abc', 12)
    const capTrack = api.tracks.find((t) => t.type === 'captions')
    const fx = capTrack?.clips[0]?.effects?.find((e) => e.type === 'caption')
    expect(fx?.params?.text).toBe('नमस्ते साथीहरू')

    const { clips: restored } = apiTimelineToStore(api)
    const cap = restored.find((c) => c.trackId === 'captions')
    expect(cap?.effects?.displayValue).toBe('नमस्ते साथीहरू')
  })
})

describe('timelineApi — style transfer effects', () => {
  it('maps color_grade and transitions from style apply', () => {
    const styled: ApiTimelineData = {
      ...SAMPLE,
      metadata: {
        pacing_target: { avg_cut_duration_ms: 3000, cuts_per_minute: 20, rhythm: 'variable' },
      },
      tracks: [
        {
          id: 'track-video-1',
          type: 'video',
          clips: [
            {
              id: 'clip-1',
              asset_id: 'asset-abc',
              source_start: 0,
              source_end: 12,
              timeline_start: 0,
              timeline_end: 12,
              effects: [
                {
                  type: 'color_grade',
                  params: { brightness: -0.3, contrast: 0.1, saturation: 0, temperature: 0 },
                },
              ],
              transitions: { out: { type: 'dissolve', duration: 0.5 } },
            },
          ],
        },
      ],
    }
    const { clips } = apiTimelineToStore(styled)
    expect(clips[0].effects?.colorFilterId).toBe('style-transfer')
    expect(clips[0].effects?.colorFilterCss).toContain('brightness')
    expect(clips[0].effects?.transitionOut).toBe('dissolve')
    expect(clips[0].effects?.styleTransfer).toBe(true)
  })
})

describe('timelineApi — apiTimelineHasVideo', () => {
  it('returns true when video clips exist', () => {
    expect(apiTimelineHasVideo(SAMPLE)).toBe(true)
  })

  it('returns false for empty tracks', () => {
    expect(apiTimelineHasVideo({ schema_version: 1, tracks: [], global_settings: { duration: 0 } })).toBe(false)
  })
})

describe('timelineApi — empty project', () => {
  it('storeToApiTimeline works with default tracks and no clips', () => {
    const api = storeToApiTimeline(INITIAL_TRACKS.map((t) => ({ ...t })), [], 'asset-x', 0)
    expect(api.tracks.every((t) => t.clips.length === 0)).toBe(true)
  })
})
