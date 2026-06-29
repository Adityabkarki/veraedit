'use client'

import { Layers } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { BadgePicker } from '@/components/editor/properties/shared/BadgePicker'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'
import type { BlendMode } from '@/types/editor'

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-burn', label: 'Color burn' },
  { value: 'color-dodge', label: 'Color dodge' },
  { value: 'soft-light', label: 'Soft light' },
]

export function BlendModeSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateLayer = useImageLayerStore((s) => s.updateLayer)

  if (!layer) return null

  return (
    <SectionWrapper title="Blend mode" icon={<Layers size={14} />} defaultOpen={false}>
      <BadgePicker
        options={BLEND_MODES}
        value={layer.blendMode}
        onChange={(blendMode) => updateLayer(layerId, { blendMode })}
      />
    </SectionWrapper>
  )
}
