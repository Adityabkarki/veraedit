'use client'

import { Move } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { DimensionInput } from '@/components/editor/properties/shared/DimensionInput'
import { useImageLayer, useImageLayerStore } from '@/stores/imageLayerStore'

export function TransformSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateTransform = useImageLayerStore((s) => s.updateTransform)

  if (!layer) return null
  const t = layer.transform

  const set = (patch: Partial<typeof t>) => updateTransform(layerId, patch)

  const handleWidthChange = (width: number) => {
    if (t.lockAspectRatio && t.height > 0) {
      const ratio = t.width / t.height
      set({ width, height: Math.round(width / ratio) })
    } else {
      set({ width })
    }
  }

  const handleHeightChange = (height: number) => {
    if (t.lockAspectRatio && t.width > 0) {
      const ratio = t.width / t.height
      set({ height, width: Math.round(height * ratio) })
    } else {
      set({ height })
    }
  }

  return (
    <SectionWrapper title="Transform" icon={<Move size={14} />}>
      <div className="grid grid-cols-2 gap-2">
        <DimensionInput label="X" value={t.x} unit="%" onChange={(x) => set({ x })} />
        <DimensionInput label="Y" value={t.y} unit="%" onChange={(y) => set({ y })} />
        <DimensionInput label="Width" value={t.width} unit="%" testId="image-transform-width" onChange={handleWidthChange} />
        <DimensionInput label="Height" value={t.height} unit="%" onChange={handleHeightChange} />
        <DimensionInput
          label="Rotation"
          value={t.rotation}
          unit="°"
          step={0.5}
          onChange={(rotation) => set({ rotation })}
        />
        <DimensionInput label="Scale" value={t.scale} unit="%" onChange={(scale) => set({ scale })} />
      </div>

      <div className="space-y-2 pt-1">
        {(
          [
            { label: 'Lock aspect ratio', key: 'lockAspectRatio' as const },
            { label: 'Flip horizontal', key: 'flipX' as const },
            { label: 'Flip vertical', key: 'flipY' as const },
          ] as const
        ).map(({ label, key }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">{label}</span>
            <button
              type="button"
              onClick={() => set({ [key]: !t[key] })}
              aria-pressed={t[key]}
              className={`w-8 h-4 rounded-full transition-colors relative ${
                t[key] ? 'bg-accent' : 'bg-bg-overlay'
              }`}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                  t[key] ? 'left-4' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </SectionWrapper>
  )
}
