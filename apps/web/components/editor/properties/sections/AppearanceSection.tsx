'use client'

import { SlidersHorizontal } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { SliderRow } from '@/components/editor/properties/shared/SliderRow'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'

export function AppearanceSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateAppearance = useImageLayerStore((s) => s.updateAppearance)

  if (!layer) return null
  const a = layer.appearance
  const set = (patch: Partial<typeof a>) => updateAppearance(layerId, patch)

  const sliders = [
    { label: 'Opacity', key: 'opacity' as const, min: 0, max: 100, unit: '%' },
    { label: 'Brightness', key: 'brightness' as const, min: 0, max: 200, unit: '%' },
    { label: 'Contrast', key: 'contrast' as const, min: 0, max: 200, unit: '%' },
    { label: 'Saturation', key: 'saturation' as const, min: 0, max: 200, unit: '%' },
    { label: 'Sharpness', key: 'sharpness' as const, min: 0, max: 100, unit: '%' },
    { label: 'Blur', key: 'blur' as const, min: 0, max: 20, unit: 'px' },
    { label: 'Corner radius', key: 'cornerRadius' as const, min: 0, max: 200, unit: 'px' },
  ]

  return (
    <SectionWrapper title="Appearance" icon={<SlidersHorizontal size={14} />}>
      <div className="space-y-2.5">
        {sliders.map(({ label, key, min, max, unit }) => (
          <SliderRow
            key={key}
            label={label}
            value={a[key]}
            min={min}
            max={max}
            unit={unit}
            onChange={(v) => set({ [key]: v })}
          />
        ))}
      </div>
    </SectionWrapper>
  )
}
