/**
 * Tests for stores/effectsStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  useEffectsStore,
  TRANSITIONS,
  COLOR_FILTERS,
  TEXT_TEMPLATES,
  SPEED_PRESETS,
} from '@/stores/effectsStore'
import { useUIStore, initialUIState } from '@/stores/uiStore'

beforeEach(() => {
  useEffectsStore.setState({
    isOpen: false, activeTab: 'tools', searchQuery: '',
    recentlyUsed: [], lastApplied: null,
    effectRangeIn: null, effectRangeOut: null, editingEffectClipId: null,
  })
  useUIStore.setState({ ...initialUIState })
})

describe('effectsStore — initial state', () => {
  it('drawer is closed initially', () => {
    expect(useEffectsStore.getState().isOpen).toBe(false)
  })
  it('active tab is edit elements', () => {
    expect(useEffectsStore.getState().activeTab).toBe('tools')
  })
  it('no recently used initially', () => {
    expect(useEffectsStore.getState().recentlyUsed).toHaveLength(0)
  })
  it('lastApplied is null initially', () => {
    expect(useEffectsStore.getState().lastApplied).toBeNull()
  })
})

describe('effectsStore — drawer open/close', () => {
  it('openDrawer sets isOpen and switches right panel to effects', () => {
    useEffectsStore.getState().openDrawer()
    expect(useEffectsStore.getState().isOpen).toBe(true)
    expect(useUIStore.getState().rightPanelMode).toBe('effects')
    expect(useUIStore.getState().aiPanelOpen).toBe(true)
  })
  it('closeDrawer sets isOpen to false', () => {
    useEffectsStore.getState().openDrawer()
    useEffectsStore.getState().closeDrawer()
    expect(useEffectsStore.getState().isOpen).toBe(false)
  })
  it('closeDrawer clears searchQuery', () => {
    useEffectsStore.getState().setSearchQuery('test')
    useEffectsStore.getState().closeDrawer()
    expect(useEffectsStore.getState().searchQuery).toBe('')
  })
  it('toggleDrawer flips isOpen', () => {
    useEffectsStore.getState().toggleDrawer()
    expect(useEffectsStore.getState().isOpen).toBe(true)
    useEffectsStore.getState().toggleDrawer()
    expect(useEffectsStore.getState().isOpen).toBe(false)
  })
})

describe('effectsStore — tab switching', () => {
  it('setActiveTab changes tab', () => {
    useEffectsStore.getState().setActiveTab('filters')
    expect(useEffectsStore.getState().activeTab).toBe('filters')
  })
  it('setActiveTab clears searchQuery', () => {
    useEffectsStore.getState().setSearchQuery('test')
    useEffectsStore.getState().setActiveTab('text')
    expect(useEffectsStore.getState().searchQuery).toBe('')
  })
})

describe('effectsStore — applyEffect', () => {
  it('adds effect to recentlyUsed', () => {
    useEffectsStore.getState().applyEffect('dissolve')
    expect(useEffectsStore.getState().recentlyUsed).toContain('dissolve')
  })
  it('sets lastApplied', () => {
    useEffectsStore.getState().applyEffect('fade-black')
    expect(useEffectsStore.getState().lastApplied).toBe('fade-black')
  })
  it('moves existing effect to front if applied again', () => {
    useEffectsStore.getState().applyEffect('cut')
    useEffectsStore.getState().applyEffect('dissolve')
    useEffectsStore.getState().applyEffect('cut')
    expect(useEffectsStore.getState().recentlyUsed[0]).toBe('cut')
  })
  it('does not add duplicates', () => {
    useEffectsStore.getState().applyEffect('cut')
    useEffectsStore.getState().applyEffect('cut')
    const count = useEffectsStore.getState().recentlyUsed.filter((id) => id === 'cut').length
    expect(count).toBe(1)
  })
  it('caps recentlyUsed at 8', () => {
    const effects = ['a','b','c','d','e','f','g','h','i','j']
    effects.forEach((id) => useEffectsStore.getState().applyEffect(id))
    expect(useEffectsStore.getState().recentlyUsed).toHaveLength(8)
  })
  it('clearLastApplied sets lastApplied to null', () => {
    useEffectsStore.getState().applyEffect('cut')
    useEffectsStore.getState().clearLastApplied()
    expect(useEffectsStore.getState().lastApplied).toBeNull()
  })
})

describe('effectsStore — search filtering', () => {
  it('filteredTransitions returns all when no search', () => {
    expect(useEffectsStore.getState().filteredTransitions()).toHaveLength(TRANSITIONS.length)
  })
  it('filteredTransitions filters by name', () => {
    useEffectsStore.getState().setSearchQuery('zoom')
    const results = useEffectsStore.getState().filteredTransitions()
    results.forEach((t) => expect(t.name.toLowerCase()).toContain('zoom'))
  })
  it('filteredFilters returns all when no search', () => {
    expect(useEffectsStore.getState().filteredFilters()).toHaveLength(COLOR_FILTERS.length)
  })
  it('filteredFilters filters by name', () => {
    useEffectsStore.getState().setSearchQuery('warm')
    const results = useEffectsStore.getState().filteredFilters()
    expect(results.length).toBeGreaterThan(0)
    results.forEach((f) => expect(f.name.toLowerCase()).toContain('warm'))
  })
  it('filteredTextTemplates returns all when no search', () => {
    expect(useEffectsStore.getState().filteredTextTemplates()).toHaveLength(TEXT_TEMPLATES.length)
  })
  it('filteredTextTemplates filters by name', () => {
    useEffectsStore.getState().setSearchQuery('bold')
    const results = useEffectsStore.getState().filteredTextTemplates()
    expect(results.length).toBeGreaterThan(0)
  })
  it('filteredSpeedPresets returns all when no search', () => {
    expect(useEffectsStore.getState().filteredSpeedPresets()).toHaveLength(SPEED_PRESETS.length)
  })
  it('filteredSpeedPresets filters by name or description', () => {
    useEffectsStore.getState().setSearchQuery('slow')
    const results = useEffectsStore.getState().filteredSpeedPresets()
    expect(results.length).toBeGreaterThan(0)
    // Each result must match on name OR description
    results.forEach((p) => {
      const matchesName = p.name.toLowerCase().includes('slow')
      const matchesDesc = p.description.toLowerCase().includes('slow')
      expect(matchesName || matchesDesc).toBe(true)
    })
  })
  it('search returns empty array when no match', () => {
    useEffectsStore.getState().setSearchQuery('xyzxyz-no-match')
    expect(useEffectsStore.getState().filteredTransitions()).toHaveLength(0)
    expect(useEffectsStore.getState().filteredFilters()).toHaveLength(0)
    expect(useEffectsStore.getState().filteredTextTemplates()).toHaveLength(0)
    expect(useEffectsStore.getState().filteredSpeedPresets()).toHaveLength(0)
  })
})

describe('effectsStore — catalogue validation', () => {
  it('TRANSITIONS has 12 items', () => {
    expect(TRANSITIONS).toHaveLength(12)
  })
  it('COLOR_FILTERS has 8 items', () => {
    expect(COLOR_FILTERS).toHaveLength(8)
  })
  it('TEXT_TEMPLATES has 16 items', () => {
    expect(TEXT_TEMPLATES).toHaveLength(16)
  })
  it('SPEED_PRESETS has 6 items', () => {
    expect(SPEED_PRESETS).toHaveLength(6)
  })
  it('all TEXT_TEMPLATES have nepaliReady flag', () => {
    TEXT_TEMPLATES.forEach((t) => {
      expect(typeof t.nepaliReady).toBe('boolean')
    })
  })
  it('at least half of TEXT_TEMPLATES are nepaliReady', () => {
    const count = TEXT_TEMPLATES.filter((t) => t.nepaliReady).length
    expect(count).toBeGreaterThanOrEqual(TEXT_TEMPLATES.length / 2)
  })
  it('all transitions have unique IDs', () => {
    const ids = TRANSITIONS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('all color filters have unique IDs', () => {
    const ids = COLOR_FILTERS.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('speed presets have valid multipliers', () => {
    SPEED_PRESETS.forEach((p) => {
      expect(p.multiplier).toBeGreaterThan(0)
    })
  })
})
