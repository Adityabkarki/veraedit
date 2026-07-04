/**
 * Brand Kit → ThemeToken (client-side).
 * Canonical implementation: remotion-service/src/lib/theme/brandKitToTheme.ts
 */
import type { BrandKit } from '@/stores/visualLibraryStore'

export interface ThemeTokenLike {
  schemaVersion: number
  identity: { brandName: string; logoUrl?: string }
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    surface: string
    onPrimary: string
    onSurface: string
    onBackground: string
  }
  typography: {
    headingFont: string
    bodyFont: string
    devanagariFont: string
    weightScale: { heading: number; body: number }
  }
  motion: { defaultCurve: 'snappy_spring' | 'elegant_glide' | 'elastic_overshoot' }
  glass: { surfaceOpacity: number; borderOpacity: number; blurStrength: 'sm' | 'md' | 'lg' }
  meta: { source: 'manual' | 'scraped'; resolvedAt: string }
}

function normalizeHex(raw: string, fallback: string): string {
  let value = raw.trim()
  if (!value.startsWith('#')) value = `#${value}`
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase()
  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    const c = value.slice(1)
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`.toUpperCase()
  }
  return fallback.toUpperCase()
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function contrastText(bg: string): string {
  const white = '#F8FAFC'
  const black = '#0F172A'
  if (contrastRatio(white, bg) >= 4.5) return white
  if (contrastRatio(black, bg) >= 4.5) return black
  return luminance(bg) < 0.5 ? white : black
}

/** Resolve Brand Kit → ThemeToken JSON (sync, for export + preview). */
export function resolveBrandKitTheme(kit: BrandKit): ThemeTokenLike {
  const primary = normalizeHex(kit.primaryColor, '#C41E3A')
  const secondary = normalizeHex(kit.secondaryColor, '#111113')
  const accent = normalizeHex(kit.accentColor, '#F59E0B')
  const background = secondary
  const surface = secondary
  const isLight = luminance(surface) > 0.5
  const [headingFont, bodyFont] =
    kit.fontStyle === 'nepali' ? ['Montserrat', 'Open Sans'] : ['Inter', 'Inter']

  return {
    schemaVersion: 1,
    identity: { brandName: kit.logoText?.trim() || 'ViraEdit' },
    colors: {
      primary,
      secondary,
      accent,
      background,
      surface,
      onPrimary: contrastText(primary),
      onSurface: contrastText(surface),
      onBackground: contrastText(background),
    },
    typography: {
      headingFont,
      bodyFont,
      devanagariFont: 'Noto Sans Devanagari',
      weightScale: { heading: 700, body: 400 },
    },
    motion: { defaultCurve: 'elegant_glide' },
    glass: {
      surfaceOpacity: isLight ? 0.55 : 0.1,
      borderOpacity: isLight ? 0.35 : 0.2,
      blurStrength: isLight ? 'lg' : 'md',
    },
    meta: { source: 'manual', resolvedAt: new Date().toISOString() },
  }
}

/** Snake_case payload for FastAPI motion-graphics endpoints. */
export function brandKitToApiPayload(kit: BrandKit): Record<string, string> {
  return {
    primary_color: kit.primaryColor,
    secondary_color: kit.secondaryColor,
    accent_color: kit.accentColor,
    font_style: kit.fontStyle,
    logo_text: kit.logoText,
  }
}
