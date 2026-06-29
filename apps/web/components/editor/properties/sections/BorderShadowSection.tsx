'use client'

import { Square } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { SliderRow } from '@/components/editor/properties/shared/SliderRow'
import { ColorPicker } from '@/components/editor/properties/shared/ColorPicker'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'

export function BorderShadowSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateBorder = useImageLayerStore((s) => s.updateBorder)

  if (!layer) return null
  const b = layer.border
  const set = (patch: Partial<typeof b>) => updateBorder(layerId, patch)

  return (
    <SectionWrapper title="Border & shadow" icon={<Square size={14} />} defaultOpen={false}>
      <SliderRow
        label="Border width"
        value={b.width}
        min={0}
        max={20}
        unit="px"
        onChange={(width) => set({ width })}
      />

      {b.width > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-secondary w-24 flex-shrink-0">Border color</span>
          <ColorPicker value={b.color} onChange={(color) => set({ color })} />
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-text-secondary">Drop shadow</span>
        <button
          type="button"
          onClick={() => set({ shadowEnabled: !b.shadowEnabled })}
          aria-pressed={b.shadowEnabled}
          className={`w-8 h-4 rounded-full transition-colors relative ${
            b.shadowEnabled ? 'bg-accent' : 'bg-bg-overlay'
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
              b.shadowEnabled ? 'left-4' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {b.shadowEnabled && (
        <div className="space-y-2.5 pt-1">
          <SliderRow
            label="Blur"
            value={b.shadowBlur}
            min={0}
            max={40}
            unit="px"
            onChange={(shadowBlur) => set({ shadowBlur })}
          />
          <SliderRow
            label="Offset X"
            value={b.shadowOffsetX}
            min={0}
            max={30}
            unit="px"
            onChange={(shadowOffsetX) => set({ shadowOffsetX })}
          />
          <SliderRow
            label="Offset Y"
            value={b.shadowOffsetY}
            min={0}
            max={30}
            unit="px"
            onChange={(shadowOffsetY) => set({ shadowOffsetY })}
          />
          <SliderRow
            label="Opacity"
            value={b.shadowOpacity}
            min={0}
            max={100}
            unit="%"
            onChange={(shadowOpacity) => set({ shadowOpacity })}
          />
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-secondary w-24 flex-shrink-0">Shadow color</span>
            <ColorPicker value={b.shadowColor} onChange={(shadowColor) => set({ shadowColor })} />
          </div>
        </div>
      )}
    </SectionWrapper>
  )
}
