'use client'

import { Clock } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { DimensionInput } from '@/components/editor/properties/shared/DimensionInput'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'

export function TimingSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateTiming = useImageLayerStore((s) => s.updateTiming)

  if (!layer) return null
  const ti = layer.timing
  const set = (patch: Partial<typeof ti>) => updateTiming(layerId, patch)

  return (
    <SectionWrapper title="Timing on timeline" icon={<Clock size={14} />}>
      <div className="grid grid-cols-2 gap-2">
        <DimensionInput
          label="Start"
          value={ti.startTime}
          unit="s"
          step={0.1}
          onChange={(startTime) => set({ startTime })}
        />
        <DimensionInput
          label="End"
          value={ti.endTime}
          unit="s"
          step={0.1}
          onChange={(endTime) => set({ endTime })}
        />
        <DimensionInput
          label="Duration"
          value={Math.round((ti.endTime - ti.startTime) * 10) / 10}
          unit="s"
          step={0.1}
          onChange={(dur) => set({ endTime: ti.startTime + dur })}
        />
        <DimensionInput
          label="Layer"
          value={ti.layer}
          unit=""
          step={1}
          onChange={(layerNum) => set({ layer: layerNum })}
        />
      </div>
    </SectionWrapper>
  )
}
