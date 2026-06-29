'use client'

import { Crop } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { BadgePicker } from '@/components/editor/properties/shared/BadgePicker'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'
import type { CropAspect, MaskShape } from '@/types/editor'

const CROP_ASPECTS: { value: CropAspect; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:5', label: '4:5' },
]

const MASK_SHAPES: { value: MaskShape; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'rect', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'star', label: 'Star' },
  { value: 'custom', label: 'Custom' },
]

export function CropMaskSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateLayer = useImageLayerStore((s) => s.updateLayer)

  if (!layer) return null

  return (
    <SectionWrapper title="Crop & mask" icon={<Crop size={14} />} defaultOpen={false}>
      <p className="text-[10px] uppercase tracking-wide text-text-disabled font-medium mb-1">
        Crop ratio
      </p>
      <BadgePicker
        options={CROP_ASPECTS}
        value={layer.cropAspect}
        onChange={(cropAspect) => updateLayer(layerId, { cropAspect })}
      />

      <p className="text-[10px] uppercase tracking-wide text-text-disabled font-medium mt-3 mb-1">
        Mask shape
      </p>
      <BadgePicker
        options={MASK_SHAPES}
        value={layer.maskShape}
        onChange={(maskShape) => updateLayer(layerId, { maskShape })}
      />
    </SectionWrapper>
  )
}
