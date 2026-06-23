/**
 * Tests for stores/visualLibraryStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useVisualLibraryStore,
  VISUAL_TEMPLATES,
  TEMPLATE_CATEGORIES,
  DEFAULT_BRAND_KIT,
} from '@/stores/visualLibraryStore'
import { useTimelineStore, INITIAL_TRACKS } from '@/stores/timelineStore'

beforeEach(() => {
  useTimelineStore.setState({
    tracks: INITIAL_TRACKS.map((t) => ({ ...t })),
    clips: [],
    playheadTime: 5,
    selectedClipIds: [],
  })
  useVisualLibraryStore.setState({
    activeTab:        'templates',
    activeCategory:   'all',
    contentLanguage:  'en',
    searchQuery:      '',
    brandKit:         { ...DEFAULT_BRAND_KIT },
    brandApplied:     false,
    placedOverlays:   [],
    editingOverlayId: null,
  })
  localStorage.clear()
})

// ── Catalogue validation ──────────────────────────────────────────────────────

describe('visualLibraryStore — catalogue', () => {
  it('has 19 templates', () => {
    expect(VISUAL_TEMPLATES).toHaveLength(19)
  })
  it('all templates have unique IDs', () => {
    const ids = VISUAL_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('all templates have English text', () => {
    VISUAL_TEMPLATES.forEach((t) => {
      expect(t.textEn.length).toBeGreaterThan(0)
    })
  })
  it('all templates have Nepali text', () => {
    VISUAL_TEMPLATES.forEach((t) => {
      expect(t.textNe.length).toBeGreaterThan(0)
    })
  })
  it('all templates have Nepali name', () => {
    VISUAL_TEMPLATES.forEach((t) => {
      expect(t.nameNe.length).toBeGreaterThan(0)
    })
  })
  it('covers all 6 template categories', () => {
    const cats = new Set(VISUAL_TEMPLATES.map((t) => t.category))
    expect(cats.has('chart')).toBe(true)
    expect(cats.has('stat')).toBe(true)
    expect(cats.has('quote')).toBe(true)
    expect(cats.has('list')).toBe(true)
    expect(cats.has('lower-third')).toBe(true)
    expect(cats.has('title')).toBe(true)
  })
  it('TEMPLATE_CATEGORIES has 7 entries (all + 6 types)', () => {
    expect(TEMPLATE_CATEGORIES).toHaveLength(7)
  })
})

// ── Initial state ─────────────────────────────────────────────────────────────

describe('visualLibraryStore — initial state', () => {
  it('activeTab is templates', () => {
    expect(useVisualLibraryStore.getState().activeTab).toBe('templates')
  })
  it('activeCategory is all', () => {
    expect(useVisualLibraryStore.getState().activeCategory).toBe('all')
  })
  it('contentLanguage is en', () => {
    expect(useVisualLibraryStore.getState().contentLanguage).toBe('en')
  })
  it('brandKit defaults to crimson primary', () => {
    expect(useVisualLibraryStore.getState().brandKit.primaryColor).toBe('#C41E3A')
  })
  it('no placed overlays initially', () => {
    expect(useVisualLibraryStore.getState().placedOverlays).toHaveLength(0)
  })
})

// ── Tab / category / language ─────────────────────────────────────────────────

describe('visualLibraryStore — navigation', () => {
  it('setActiveTab changes tab', () => {
    useVisualLibraryStore.getState().setActiveTab('brand')
    expect(useVisualLibraryStore.getState().activeTab).toBe('brand')
  })
  it('setActiveCategory filters correctly', () => {
    useVisualLibraryStore.getState().setActiveCategory('chart')
    expect(useVisualLibraryStore.getState().activeCategory).toBe('chart')
    const filtered = useVisualLibraryStore.getState().filteredTemplates()
    filtered.forEach((t) => expect(t.category).toBe('chart'))
  })
  it('filteredTemplates returns all with category=all', () => {
    expect(useVisualLibraryStore.getState().filteredTemplates()).toHaveLength(VISUAL_TEMPLATES.length)
  })
  it('setContentLanguage toggles between en and ne', () => {
    useVisualLibraryStore.getState().setContentLanguage('ne')
    expect(useVisualLibraryStore.getState().contentLanguage).toBe('ne')
  })
})

// ── Search ────────────────────────────────────────────────────────────────────

describe('visualLibraryStore — search', () => {
  it('filters by English name', () => {
    useVisualLibraryStore.getState().setSearchQuery('bar chart')
    const results = useVisualLibraryStore.getState().filteredTemplates()
    expect(results.length).toBeGreaterThan(0)
    results.forEach((t) => expect(t.name.toLowerCase()).toContain('bar'))
  })
  it('filters by Nepali text', () => {
    useVisualLibraryStore.getState().setSearchQuery('नमस्ते')
    // No templates contain 'नमस्ते' — should return empty
    expect(useVisualLibraryStore.getState().filteredTemplates()).toHaveLength(0)
  })
  it('empty query returns all', () => {
    useVisualLibraryStore.getState().setSearchQuery('')
    expect(useVisualLibraryStore.getState().filteredTemplates()).toHaveLength(VISUAL_TEMPLATES.length)
  })
})

// ── Insert / remove overlays ──────────────────────────────────────────────────

describe('visualLibraryStore — insertTemplate', () => {
  it('adds a placed overlay and timeline clip', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 5)
    expect(useVisualLibraryStore.getState().placedOverlays).toHaveLength(1)
    expect(useTimelineStore.getState().clips.filter((c) => c.trackId === 'overlay')).toHaveLength(1)
  })
  it('inserted overlay has correct startTime', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 10)
    expect(useVisualLibraryStore.getState().placedOverlays[0].startTime).toBe(10)
  })
  it('inserted overlay has template default duration', () => {
    const template = VISUAL_TEMPLATES.find((t) => t.id === 'ch-bar')!
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    expect(useVisualLibraryStore.getState().placedOverlays[0].duration).toBe(template.defaultDuration)
  })
  it('inserted overlay text is English when contentLanguage=en', () => {
    const template = VISUAL_TEMPLATES.find((t) => t.id === 'ch-bar')!
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    expect(useVisualLibraryStore.getState().placedOverlays[0].text).toBe(template.textEn)
  })
  it('inserted overlay text is Nepali when contentLanguage=ne', () => {
    const template = VISUAL_TEMPLATES.find((t) => t.id === 'ch-bar')!
    useVisualLibraryStore.getState().setContentLanguage('ne')
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    expect(useVisualLibraryStore.getState().placedOverlays[0].text).toBe(template.textNe)
  })
  it('ignores unknown templateId', () => {
    useVisualLibraryStore.getState().insertTemplate('no-such-id', 0)
    expect(useVisualLibraryStore.getState().placedOverlays).toHaveLength(0)
  })
  it('removeOverlay deletes the overlay', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    const id = useVisualLibraryStore.getState().placedOverlays[0].id
    useVisualLibraryStore.getState().removeOverlay(id)
    expect(useVisualLibraryStore.getState().placedOverlays).toHaveLength(0)
  })
  it('updateOverlay changes overlay text', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    const id = useVisualLibraryStore.getState().placedOverlays[0].id
    useVisualLibraryStore.getState().updateOverlay(id, { text: 'Custom text' })
    expect(useVisualLibraryStore.getState().placedOverlays[0].text).toBe('Custom text')
  })
  it('resetOverlays clears all overlays', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    useVisualLibraryStore.getState().insertTemplate('st-big', 5)
    useVisualLibraryStore.getState().resetOverlays()
    expect(useVisualLibraryStore.getState().placedOverlays).toHaveLength(0)
  })
})

// ── Brand kit ─────────────────────────────────────────────────────────────────

describe('visualLibraryStore — brand kit', () => {
  it('setBrandKit updates primaryColor', () => {
    useVisualLibraryStore.getState().setBrandKit({ primaryColor: '#FF0000' })
    expect(useVisualLibraryStore.getState().brandKit.primaryColor).toBe('#FF0000')
  })
  it('setBrandKit is a partial update', () => {
    useVisualLibraryStore.getState().setBrandKit({ primaryColor: '#FF0000' })
    expect(useVisualLibraryStore.getState().brandKit.secondaryColor).toBe(DEFAULT_BRAND_KIT.secondaryColor)
  })
  it('applyBrandToAll sets brandApplied to true', () => {
    useVisualLibraryStore.getState().applyBrandToAll()
    expect(useVisualLibraryStore.getState().brandApplied).toBe(true)
  })
  it('applyBrandToAll re-colours placed overlays', () => {
    useVisualLibraryStore.getState().insertTemplate('ch-bar', 0)
    useVisualLibraryStore.getState().setBrandKit({ primaryColor: '#00FF00' })
    useVisualLibraryStore.getState().applyBrandToAll()
    expect(useVisualLibraryStore.getState().placedOverlays[0].color).toBe('#00FF00')
  })
  it('fontStyle can be set to nepali', () => {
    useVisualLibraryStore.getState().setBrandKit({ fontStyle: 'nepali' })
    expect(useVisualLibraryStore.getState().brandKit.fontStyle).toBe('nepali')
  })
})
