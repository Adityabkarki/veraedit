'use client'

import { Palette } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { BadgePicker } from '@/components/editor/properties/shared/BadgePicker'
import { SliderRow } from '@/components/editor/properties/shared/SliderRow'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'
import type { FilterPreset } from '@/types/editor'

const FILTER_PRESETS: { value: FilterPreset; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'cinematic_warm', label: 'Warm' },
  { value: 'cinematic_cold', label: 'Cold' },
  { value: 'vintage_film', label: 'Vintage' },
  { value: 'corporate_clean', label: 'Clean' },
  { value: 'dark_moody', label: 'Moody' },
  { value: 'bright_airy', label: 'Airy' },
  { value: 'bw', label: 'B&W' },
]

export function FiltersSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateLayer = useImageLayerStore((s) => s.updateLayer)

  if (!layer) return null

  return (
    <SectionWrapper title="Filters & color grading" icon={<Palette size={14} />} defaultOpen={false}>
      <BadgePicker
        options={FILTER_PRESETS}
        value={layer.filter}
        onChange={(filter) => updateLayer(layerId, { filter })}
      />
      {layer.filter !== 'none' && (
        <SliderRow
          label="Intensity"
          value={layer.filterIntensity}
          min={0}
          max={100}
          unit="%"
          onChange={(filterIntensity) => updateLayer(layerId, { filterIntensity })}
        />
      )}
    </SectionWrapper>
  )
}
