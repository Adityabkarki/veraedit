/**
 * Tests for lib/sfxLibrary.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resolveSfxSlug, sfxPublicUrl } from '@/lib/sfxLibrary'

describe('resolveSfxSlug', () => {
  it('maps legacy click to shutter_click', () => {
    expect(resolveSfxSlug('click')).toBe('shutter_click')
  })

  it('maps toolbox tool ids', () => {
    expect(resolveSfxSlug('whoosh', 'sfx_shutter_click')).toBe('shutter_click')
    expect(resolveSfxSlug('x', 'sfx_sub_bass_thud')).toBe('sub_bass')
  })

  it('returns slug for direct catalog ids', () => {
    expect(resolveSfxSlug('glitch')).toBe('glitch')
  })
})

describe('sfxPublicUrl', () => {
  it('builds public mp3 path', () => {
    expect(sfxPublicUrl('whoosh')).toBe('/sfx/whoosh.mp3')
  })
})
