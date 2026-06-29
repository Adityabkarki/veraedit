import type { CSSProperties } from 'react'
import type { Clip } from '@/stores/timelineStore'
import { clipToImageLayer } from '@/lib/imageLayer'
import type { FilterPreset } from '@/types/editor'

const FILTER_CSS: Record<FilterPreset, string> = {
  none: '',
  cinematic_warm: 'sepia(0.25) saturate(1.2) hue-rotate(-8deg)',
  cinematic_cold: 'saturate(0.9) hue-rotate(12deg) brightness(1.05)',
  vintage_film: 'sepia(0.45) contrast(1.1) brightness(0.95)',
  corporate_clean: 'contrast(1.08) saturate(0.95) brightness(1.04)',
  dark_moody: 'brightness(0.82) contrast(1.15) saturate(0.85)',
  bright_airy: 'brightness(1.12) contrast(0.95) saturate(1.05)',
  bw: 'grayscale(1)',
}

function maskClipPath(shape: string): string | undefined {
  switch (shape) {
    case 'circle':
      return 'circle(50% at 50% 50%)'
    case 'star':
      return 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
    case 'rect':
      return 'inset(0 round 4px)'
    default:
      return undefined
  }
}

export function buildImagePreviewStyles(clip: Clip): CSSProperties {
  const layer = clipToImageLayer(clip)
  const a = layer.appearance
  const b = layer.border
  const intensity = layer.filterIntensity / 100

  const filters = [
    `brightness(${a.brightness}%)`,
    `contrast(${a.contrast}%)`,
    `saturate(${a.saturation}%)`,
    `blur(${a.blur}px)`,
  ]

  const preset = FILTER_CSS[layer.filter]
  if (preset && layer.filter !== 'none') {
    filters.push(`opacity(${intensity})`)
    filters.push(preset)
  }

  if (a.sharpness > 0) {
    filters.push(`contrast(${100 + a.sharpness * 0.3}%)`)
  }

  const boxShadow = b.shadowEnabled
    ? `${b.shadowOffsetX}px ${b.shadowOffsetY}px ${b.shadowBlur}px rgba(0,0,0,${b.shadowOpacity / 100})`
    : undefined

  const clipPath = maskClipPath(layer.maskShape)

  return {
    opacity: a.opacity / 100,
    filter: filters.join(' '),
    borderRadius: a.cornerRadius > 0 ? `${a.cornerRadius}px` : undefined,
    border: b.width > 0 ? `${b.width}px solid ${b.color}` : undefined,
    boxShadow,
    mixBlendMode: layer.blendMode === 'normal' ? undefined : layer.blendMode,
    clipPath,
    transform: [
      layer.transform.flipX ? 'scaleX(-1)' : '',
      layer.transform.flipY ? 'scaleY(-1)' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined,
    objectFit: 'contain',
    width: '100%',
    height: '100%',
  }
}
