'use client'

/**
 * ShortOverlayLayer — template/effect overlays scoped to a short preview only.
 */

import { resolveShortBrandKit, type ShortOverlay, type ShortStyling } from '@/lib/shortStyling'

interface ShortOverlayLayerProps {
  styling:    ShortStyling
  localTime:  number
}

function OverlayChip({
  overlay,
  primary,
  accent,
}: {
  overlay: ShortOverlay
  primary: string
  accent: string
}) {
  const vt = overlay.visualType

  if (vt === 'key_term' || vt === 'lower_third') {
    return (
      <div className="absolute bottom-12 left-2 right-2 pointer-events-none">
        <div
          className="inline-flex px-3 py-1.5 rounded-r-lg text-[10px] font-semibold text-white"
          style={{ background: `linear-gradient(90deg, ${primary}, ${primary}cc)`, borderLeft: '3px solid white' }}
          data-testid={`short-overlay-${overlay.id}`}
        >
          {overlay.text}
        </div>
      </div>
    )
  }

  if (vt === 'hook_rewrite' || vt === 'title') {
    return (
      <div className="absolute inset-x-2 top-8 flex justify-center pointer-events-none">
        <p
          className="text-sm font-black text-white text-center leading-tight px-2"
          style={{ textShadow: `0 2px 12px ${primary}` }}
          data-testid={`short-overlay-${overlay.id}`}
        >
          {overlay.text}
        </p>
      </div>
    )
  }

  if (vt === 'large_number' || vt === 'statistic') {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-xl px-4 py-3 text-center"
          style={{ background: `${primary}dd` }}
          data-testid={`short-overlay-${overlay.id}`}
        >
          <span className="text-2xl font-black text-white block">{overlay.text}</span>
          {overlay.secondaryText && (
            <span className="text-[10px] text-white/80">{overlay.secondaryText}</span>
          )}
        </div>
      </div>
    )
  }

  if (vt === 'cta') {
    return (
      <div className="absolute bottom-16 inset-x-0 flex justify-center pointer-events-none">
        <span
          className="px-4 py-1.5 rounded-full text-[10px] font-bold text-black"
          style={{ background: accent }}
          data-testid={`short-overlay-${overlay.id}`}
        >
          {overlay.text}
        </span>
      </div>
    )
  }

  return (
    <div className="absolute bottom-20 inset-x-2 pointer-events-none">
      <div
        className="rounded-lg px-3 py-2 bg-black/70 backdrop-blur-sm border border-white/10"
        data-testid={`short-overlay-${overlay.id}`}
      >
        <p className="text-[10px] text-white font-medium">{overlay.text}</p>
      </div>
    </div>
  )
}

export function ShortOverlayLayer({ styling, localTime }: ShortOverlayLayerProps) {
  const brand = resolveShortBrandKit(styling)
  const primary = brand.primaryColor
  const accent = brand.accentColor

  const visible = styling.overlays.filter(
    (o) => localTime >= o.offset && localTime < o.offset + o.duration,
  )

  if (visible.length === 0) return null

  return (
    <div className="absolute inset-0 z-[5] overflow-hidden" data-testid="short-overlay-layer">
      {visible.map((o) => (
        <OverlayChip key={o.id} overlay={o} primary={primary} accent={accent} />
      ))}
    </div>
  )
}
