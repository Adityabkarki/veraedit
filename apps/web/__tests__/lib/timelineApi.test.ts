/**
 * Tests for lib/timelineApi.ts
 */

import { describe, it, expect } from 'vitest'
import {
  apiTimelineToStore,
  storeToApiTimeline,
  apiTimelineHasVideo,
  isPersistedTimelineResponse,
  isTimelineStaleForAsset,
  timelinePrimaryAssetId,
  upgradeTimelinePrimaryAsset,
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

describe('timelineApi — timelinePrimaryAssetId', () => {
  it('reads asset_id from first video clip', () => {
    expect(timelinePrimaryAssetId(SAMPLE)).toBe('asset-abc')
  })

  it('returns null when no video clips', () => {
    expect(
      timelinePrimaryAssetId({
        schema_version: 1,
        tracks: [{ id: 'track-audio-1', type: 'audio', clips: [] }],
        global_settings: { duration: 0 },
      }),
    ).toBeNull()
  })
})

describe('timelineApi — isTimelineStaleForAsset', () => {
  it('detects mismatch with current asset', () => {
    expect(isTimelineStaleForAsset(SAMPLE, 'asset-new')).toBe(true)
  })

  it('returns false when asset matches', () => {
    expect(isTimelineStaleForAsset(SAMPLE, 'asset-abc')).toBe(false)
  })
})

describe('timelineApi — upgradeTimelinePrimaryAsset', () => {
  it('replaces main video but keeps B-roll overlay clips', () => {
    const withBroll: ApiTimelineData = {
      schema_version: 1,
      global_settings: { duration: 12 },
      tracks: [
        {
          id: 'track-video-1',
          type: 'video',
          clips: [{
            id: 'clip-old',
            asset_id: 'asset-old',
            source_start: 0,
            source_end: 12,
            timeline_start: 0,
            timeline_end: 12,
            label: 'Old video',
          }],
        },
        {
          id: 'track-broll-1',
          type: 'overlay',
          clips: [{
            id: 'broll-1',
            asset_id: 'broll-asset',
            source_start: 0,
            source_end: 4,
            timeline_start: 2,
            timeline_end: 6,
            label: 'AI B-roll',
            effects: [{
              type: 'visual_overlay',
              params: {
                visual_type: 'broll_overlay',
                media_url: 'http://example.com/broll.mp4',
                broll_type: 'ai_generated',
              },
            }],
          }],
        },
      ],
    }

    const upgraded = upgradeTimelinePrimaryAsset(withBroll, {
      id: 'asset-new',
      filename: 'New upload.mp4',
      durationSeconds: 20,
    })
    expect(timelinePrimaryAssetId(upgraded)).toBe('asset-new')

    const { clips } = apiTimelineToStore(upgraded)
    expect(clips.some((c) => c.trackId === 'broll' && c.effects?.visualType === 'broll_overlay')).toBe(true)
    expect(clips.some((c) => c.trackId === 'video' && c.label === 'New upload.mp4')).toBe(true)
  })
})

describe('timelineApi — backend B-roll round-trip', () => {
  it('maps track-broll-1 overlay clips onto the broll lane', () => {
    const api: ApiTimelineData = {
      schema_version: 1,
      global_settings: { duration: 30 },
      tracks: [
        {
          id: 'track-video-1',
          type: 'video',
          clips: [{
            id: 'clip-main',
            asset_id: 'asset-main',
            source_start: 0,
            source_end: 30,
            timeline_start: 0,
            timeline_end: 30,
            label: 'Main',
          }],
        },
        {
          id: 'track-broll-1',
          type: 'overlay',
          clips: [{
            id: 'broll-x',
            asset_id: 'broll-asset',
            source_start: 0,
            source_end: 4,
            timeline_start: 5,
            timeline_end: 9,
            label: 'Stock B-roll',
            effects: [{
              type: 'visual_overlay',
              params: {
                visual_type: 'broll_overlay',
                media_url: 'http://example.com/stock.mp4',
                broll_type: 'stock',
              },
            }],
          }],
        },
      ],
    }

    const { clips } = apiTimelineToStore(api)
    const broll = clips.find((c) => c.id === 'broll-x')
    expect(broll?.trackId).toBe('broll')
    expect(broll?.effects?.mediaUrl).toContain('stock.mp4')
  })
})

describe('timelineApi — empty project', () => {
  it('storeToApiTimeline works with default tracks and no clips', () => {
    const api = storeToApiTimeline(INITIAL_TRACKS.map((t) => ({ ...t })), [], 'asset-x', 0)
    expect(api.tracks.every((t) => t.clips.length === 0)).toBe(true)
  })
})

describe('isPersistedTimelineResponse', () => {
  it('returns false for synthetic GET /timeline default (id null)', () => {
    expect(
      isPersistedTimelineResponse({
        id: null,
        version: 0,
        data: {
          schema_version: 1,
          tracks: [
            { id: 'track-video-1', type: 'video', name: 'Main Video', clips: [] },
          ],
          global_settings: { duration: 0, resolution: '1920x1080', fps: 30 },
        },
      }),
    ).toBe(false)
  })

  it('returns true when timeline row exists in DB', () => {
    expect(
      isPersistedTimelineResponse({
        id: 'tl-uuid',
        version: 2,
        data: SAMPLE,
      }),
    ).toBe(true)
  })
})
