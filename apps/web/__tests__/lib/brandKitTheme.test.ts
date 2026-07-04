import { describe, expect, it } from 'vitest'
import { DEFAULT_BRAND_KIT } from '@/stores/visualLibraryStore'
import { brandKitToApiPayload, resolveBrandKitTheme } from '@/lib/brandKitTheme'

describe('brandKitTheme', () => {
  it('resolves default brand kit to theme with canonical primary', () => {
    const theme = resolveBrandKitTheme(DEFAULT_BRAND_KIT)
    expect(theme.colors.primary).toBe('#C41E3A')
    expect(theme.colors.accent).toBe('#F59E0B')
    expect(theme.schemaVersion).toBe(1)
  })

  it('maps brand kit to API snake_case payload', () => {
    const payload = brandKitToApiPayload(DEFAULT_BRAND_KIT)
    expect(payload.primary_color).toBe('#C41E3A')
    expect(payload.font_style).toBe('nepali')
  })
})
