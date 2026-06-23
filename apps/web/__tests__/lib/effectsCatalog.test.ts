import { describe, it, expect } from 'vitest'
import {
  buildUnifiedCatalog,
  normalizeCatalogCategory,
  UNIFIED_CATEGORY_ORDER,
} from '@/lib/effectsCatalog'

describe('effectsCatalog — merged categories', () => {
  it('normalizes duplicate category keys', () => {
    expect(normalizeCatalogCategory('filters')).toBe('color')
    expect(normalizeCatalogCategory('text')).toBe('overlays')
    expect(normalizeCatalogCategory('motion')).toBe('overlays')
    expect(normalizeCatalogCategory('motion', 'motion_data_card')).toBe('overlays')
    expect(normalizeCatalogCategory('speed')).toBe('pacing')
    expect(normalizeCatalogCategory('transitions')).toBe('transitions')
  })

  it('places legacy presets into merged chips only', () => {
    const items = buildUnifiedCatalog([])
    const categories = new Set(items.map((i) => i.category))
    expect(categories.has('filters')).toBe(false)
    expect(categories.has('text')).toBe(false)
    expect(categories.has('speed')).toBe(false)
    expect(categories.has('color')).toBe(true)
    expect(categories.has('overlays')).toBe(true)
    expect(categories.has('pacing')).toBe(true)
  })

  it('does not list removed categories in chip order', () => {
    expect(UNIFIED_CATEGORY_ORDER).not.toContain('filters')
    expect(UNIFIED_CATEGORY_ORDER).not.toContain('text')
    expect(UNIFIED_CATEGORY_ORDER).not.toContain('motion')
    expect(UNIFIED_CATEGORY_ORDER).not.toContain('speed')
    expect(UNIFIED_CATEGORY_ORDER).toContain('charts')
  })
})
