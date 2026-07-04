/**
 * Live Brand Kit colors for motion graphic **preview** rendering.
 * Editor preview always reads current brand kit — not stale clip.effects.brandColor.
 */

export interface BrandPreviewTheme {
  primary: string
  accent: string
  secondary: string
}

const DEFAULT: BrandPreviewTheme = {
  primary: '#C41E3A',
  accent: '#F59E0B',
  secondary: '#111113',
}

let current: BrandPreviewTheme = { ...DEFAULT }

export function setPreviewBrandTheme(theme: BrandPreviewTheme): void {
  current = theme
}

export function getPreviewBrandTheme(): BrandPreviewTheme {
  return current
}
