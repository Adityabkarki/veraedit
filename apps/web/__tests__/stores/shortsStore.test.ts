/**
 * Tests for stores/shortsStore.ts + scenesStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useShortsStore,
  INITIAL_SHORTS,
  PLATFORM_ORDER,
  mapApiShort,
  resolveShortTimes,
} from '@/stores/shortsStore'
import {
  useScenesStore,
  INITIAL_SCENES,
  INTENT_META,
} from '@/stores/scenesStore'
import { useTimelineStore } from '@/stores/timelineStore'

// ── shortsStore ───────────────────────────────────────────────────────────────

beforeEach(() => {
  useShortsStore.getState().resetShorts()
  useScenesStore.getState().resetScenes()
  useTimelineStore.getState().resetTimeline()
  useShortsStore.getState().loadDemoData()
  useScenesStore.getState().loadDemoData()
})

describe('shortsStore — initial state', () => {
  it('starts empty before demo data is loaded', () => {
    useShortsStore.getState().resetShorts()
    expect(useShortsStore.getState().shorts).toHaveLength(0)
  })

  it('loads INITIAL_SHORTS via loadDemoData', () => {
    expect(useShortsStore.getState().shorts).toHaveLength(INITIAL_SHORTS.length)
  })
  it('all shorts start as pending', () => {
    expect(useShortsStore.getState().shorts.every((s) => s.status === 'pending')).toBe(true)
  })
  it('activePlatform starts as "all"', () => {
    expect(useShortsStore.getState().activePlatform).toBe('all')
  })
})

describe('shortsStore — setActivePlatform', () => {
  it('sets platform to youtube', () => {
    useShortsStore.getState().setActivePlatform('youtube')
    expect(useShortsStore.getState().activePlatform).toBe('youtube')
  })
  it('can reset to "all"', () => {
    useShortsStore.getState().setActivePlatform('tiktok')
    useShortsStore.getState().setActivePlatform('all')
    expect(useShortsStore.getState().activePlatform).toBe('all')
  })
})

describe('shortsStore — filteredShorts', () => {
  it('"all" returns all shorts', () => {
    const result = useShortsStore.getState().filteredShorts()
    expect(result).toHaveLength(INITIAL_SHORTS.length)
  })

  it('platform filter returns all shorts sorted by platform score', () => {
    useShortsStore.getState().setActivePlatform('youtube')
    const sorted = useShortsStore.getState().filteredShorts()
    expect(sorted).toHaveLength(INITIAL_SHORTS.length)
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].platformScores['youtube']).toBeGreaterThanOrEqual(
        sorted[i + 1].platformScores['youtube']
      )
    }
  })

  PLATFORM_ORDER.forEach((p) => {
    it(`sorts correctly for platform: ${p}`, () => {
      useShortsStore.getState().setActivePlatform(p)
      const sorted = useShortsStore.getState().filteredShorts()
      for (let i = 0; i < sorted.length - 1; i++) {
        expect(sorted[i].platformScores[p]).toBeGreaterThanOrEqual(
          sorted[i + 1].platformScores[p]
        )
      }
    })
  })
})

describe('shortsStore — setActiveHook', () => {
  it('changes the active hook text by index', () => {
    const short = INITIAL_SHORTS[0]
    useShortsStore.getState().setActiveHook(short.id, 1)
    const updated = useShortsStore.getState().shorts.find((s) => s.id === short.id)!
    expect(updated.activeHook).toBe(short.hooks[1])
  })
  it('does not change activeHook for invalid index', () => {
    const short = INITIAL_SHORTS[0]
    const original = short.activeHook
    useShortsStore.getState().setActiveHook(short.id, 999)
    const after = useShortsStore.getState().shorts.find((s) => s.id === short.id)!
    expect(after.activeHook).toBe(original)
  })
})

describe('shortsStore — approveShort', () => {
  it('sets status to approved', () => {
    useShortsStore.getState().approveShort('sh1')
    expect(useShortsStore.getState().shorts.find((s) => s.id === 'sh1')!.status).toBe('approved')
  })
  it('does not affect other shorts', () => {
    useShortsStore.getState().approveShort('sh1')
    expect(useShortsStore.getState().shorts.find((s) => s.id === 'sh2')!.status).toBe('pending')
  })
})

describe('shortsStore — exportShort', () => {
  it('sets status to exporting', () => {
    useShortsStore.getState().exportShort('sh2')
    expect(useShortsStore.getState().shorts.find((s) => s.id === 'sh2')!.status).toBe('exporting')
  })
})

describe('shortsStore — resetShorts', () => {
  it('resets all to pending after reload', () => {
    useShortsStore.getState().approveShort('sh1')
    useShortsStore.getState().resetShorts()
    useShortsStore.getState().loadDemoData()
    expect(useShortsStore.getState().shorts.every((s) => s.status === 'pending')).toBe(true)
  })
  it('resets activePlatform to all', () => {
    useShortsStore.getState().setActivePlatform('tiktok')
    useShortsStore.getState().resetShorts()
    expect(useShortsStore.getState().activePlatform).toBe('all')
  })
})

describe('mapApiShort / resolveShortTimes', () => {
  it('resolveShortTimes reads nested action fields', () => {
    const times = resolveShortTimes({
      id: 's1',
      action: { start_time: 12, end_time: 45, duration: 33 },
    })
    expect(times).toEqual({ startTime: 12, endTime: 45, duration: 33 })
  })

  it('loadFromApi maps API shorts without throwing', () => {
    useShortsStore.getState().resetShorts()
    useShortsStore.getState().loadFromApi([
      { id: 'api-1', title: 'Clip A', action: { start_time: 5, end_time: 35 } },
      { id: 'api-2', start_time: 100, end_time: 130 },
    ])
    const shorts = useShortsStore.getState().shorts
    expect(shorts).toHaveLength(2)
    expect(shorts[0].startTime).toBe(5)
    expect(shorts[0].endTime).toBe(35)
    expect(shorts[0].framing.panX).toBe(0.5)
    expect(shorts[1].startTime).toBe(100)
    expect(mapApiShort({ id: 'x', start_time: 1, end_time: 31 }, 0).duration).toBe(30)
  })

  it('mapApiShort reads reframe strategy from action', () => {
    const mapped = mapApiShort(
      {
        id: 'r1',
        action: {
          start_time: 0,
          end_time: 30,
          reframe: { strategy: 'speaker_track', pan_x: 0.5 },
        },
      },
      0,
    )
    expect(mapped.framing.reframeStrategy).toBe('speaker_track')
    expect(mapped.framing.mode).toBe('auto')
  })
})

describe('shortsStore — framing', () => {
  it('setShortFraming updates pan and mode', () => {
    useShortsStore.getState().setShortFraming('sh1', { panX: 0.25, mode: 'manual' })
    const sh = useShortsStore.getState().shorts.find((s) => s.id === 'sh1')!
    expect(sh.framing.panX).toBe(0.25)
    expect(sh.framing.mode).toBe('manual')
  })

  it('resetShortFramingAuto restores center auto framing', () => {
    useShortsStore.getState().setShortFraming('sh3', { panX: 0.9, mode: 'manual' })
    useShortsStore.getState().resetShortFramingAuto('sh3')
    const sh = useShortsStore.getState().shorts.find((s) => s.id === 'sh3')!
    expect(sh.framing.panX).toBe(0.5)
    expect(sh.framing.mode).toBe('auto')
    expect(sh.framing.reframeStrategy).toBe('speaker_track')
  })
})

describe('shortsStore — short-only styling', () => {
  it('applyShortFilter does not change timeline clips', () => {
    const clipCountBefore = useTimelineStore.getState().clips.length
    useShortsStore.getState().applyShortFilter('sh1', 'warm')
    const sh = useShortsStore.getState().shorts.find((s) => s.id === 'sh1')!
    expect(sh.styling.filterId).toBe('warm')
    expect(useTimelineStore.getState().clips.length).toBe(clipCountBefore)
  })

  it('addShortTemplate adds overlay on short only', () => {
    useShortsStore.getState().addShortTemplate('sh2', 'ti-main')
    const sh = useShortsStore.getState().shorts.find((s) => s.id === 'sh2')!
    expect(sh.styling.overlays.length).toBe(1)
    expect(sh.styling.overlays[0].templateId).toBe('ti-main')
  })

  it('clearShortStyling resets short styling', () => {
    useShortsStore.getState().applyShortFilter('sh1', 'dramatic')
    useShortsStore.getState().clearShortStyling('sh1')
    expect(useShortsStore.getState().shorts.find((s) => s.id === 'sh1')!.styling.filterId).toBeNull()
  })
})

// ── scenesStore ───────────────────────────────────────────────────────────────

describe('scenesStore — initial state', () => {
  it('starts empty before demo data is loaded', () => {
    useScenesStore.getState().resetScenes()
    expect(useScenesStore.getState().scenes).toHaveLength(0)
  })

  it('loads INITIAL_SCENES via loadDemoData', () => {
    expect(useScenesStore.getState().scenes).toHaveLength(INITIAL_SCENES.length)
  })
  it('selectedSceneId starts null', () => {
    expect(useScenesStore.getState().selectedSceneId).toBeNull()
  })
})

describe('scenesStore — selectScene', () => {
  it('selects a scene by id', () => {
    useScenesStore.getState().selectScene('sc1')
    expect(useScenesStore.getState().selectedSceneId).toBe('sc1')
  })
  it('selectScene(null) clears selection', () => {
    useScenesStore.getState().selectScene('sc1')
    useScenesStore.getState().selectScene(null)
    expect(useScenesStore.getState().selectedSceneId).toBeNull()
  })
})

describe('scenesStore — INTENT_META', () => {
  it('has metadata for all 6 intent types', () => {
    const intents = ['hook', 'problem', 'story', 'solution', 'context', 'cta'] as const
    intents.forEach((intent) => {
      expect(INTENT_META[intent]).toBeDefined()
      expect(INTENT_META[intent].label).toBeTruthy()
      expect(INTENT_META[intent].color).toMatch(/^#/)
      expect(INTENT_META[intent].emoji).toBeTruthy()
    })
  })
})

describe('scenesStore — resetScenes', () => {
  it('resets scenes to initial', () => {
    useScenesStore.getState().selectScene('sc1')
    useScenesStore.getState().resetScenes()
    expect(useScenesStore.getState().selectedSceneId).toBeNull()
  })
})
