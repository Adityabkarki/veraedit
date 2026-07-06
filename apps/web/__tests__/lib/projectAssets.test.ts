import { describe, expect, it } from 'vitest'
import { isSecondaryBrollAsset, pickPrimaryProjectAsset } from '@/lib/projectAssets'

describe('isSecondaryBrollAsset', () => {
  it('detects role=broll metadata', () => {
    expect(
      isSecondaryBrollAsset({
        id: '1',
        original_filename: 'clip.mp4',
        media_metadata: { role: 'broll' },
      }),
    ).toBe(true)
  })

  it('detects stock_pexels source', () => {
    expect(
      isSecondaryBrollAsset({
        id: '1',
        original_filename: 'clip.mp4',
        media_metadata: { source: 'stock_pexels' },
      }),
    ).toBe(true)
  })

  it('detects legacy broll_stock filename', () => {
    expect(
      isSecondaryBrollAsset({
        id: '1',
        original_filename: 'broll_stock_ab12.mp4',
      }),
    ).toBe(true)
  })
})

describe('pickPrimaryProjectAsset', () => {
  const main = {
    id: 'main-id',
    original_filename: 'podcast.mp4',
    media_metadata: { content_type: 'podcast' },
  }
  const stock = {
    id: 'stock-id',
    original_filename: 'broll_stock_xyz.mp4',
    media_metadata: { role: 'broll', source: 'stock_pexels' },
  }

  it('ignores newest broll asset and keeps original upload', () => {
    const picked = pickPrimaryProjectAsset([stock, main])
    expect(picked?.id).toBe('main-id')
  })

  it('prefers newest primary upload when multiple main videos exist', () => {
    const older = {
      id: 'old-id',
      original_filename: 'first.mp4',
    }
    const newer = {
      id: 'new-id',
      original_filename: 'replacement.mp4',
    }
    const picked = pickPrimaryProjectAsset([newer, older])
    expect(picked?.id).toBe('new-id')
  })

  it('keeps current primary asset when still valid', () => {
    const picked = pickPrimaryProjectAsset([stock, main], 'main-id')
    expect(picked?.id).toBe('main-id')
  })
})
