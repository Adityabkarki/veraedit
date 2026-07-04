import { describe, expect, it } from 'vitest'
import { getPreviewBrandTheme, setPreviewBrandTheme } from '@/lib/brandPreviewTheme'

describe('brandPreviewTheme', () => {
  it('setPreviewBrandTheme updates live preview colors', () => {
    setPreviewBrandTheme({
      primary: '#FF0000',
      accent: '#00FF00',
      secondary: '#0000FF',
    })
    expect(getPreviewBrandTheme()).toEqual({
      primary: '#FF0000',
      accent: '#00FF00',
      secondary: '#0000FF',
    })
  })
})
