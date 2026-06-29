'use client'

import { Zap } from 'lucide-react'
import { SectionWrapper } from '@/components/editor/properties/shared/SectionWrapper'
import { BadgePicker } from '@/components/editor/properties/shared/BadgePicker'
import { SliderRow } from '@/components/editor/properties/shared/SliderRow'
import { useImageLayer } from '@/stores/imageLayerStore'
import { useImageLayerStore } from '@/stores/imageLayerStore'
import type { AnimationEffect, ExitEffect } from '@/types/editor'

const ENTRANCE: { value: AnimationEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade_in', label: 'Fade in' },
  { value: 'slide_up', label: 'Slide up' },
  { value: 'slide_left', label: 'Slide left' },
  { value: 'zoom_in', label: 'Zoom in' },
  { value: 'bounce', label: 'Bounce' },
  { value: 'ken_burns', label: 'Ken Burns' },
]

const EXIT: { value: ExitEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade_out', label: 'Fade out' },
  { value: 'slide_down', label: 'Slide down' },
  { value: 'zoom_out', label: 'Zoom out' },
]

export function AnimationSection({ layerId }: { layerId: string }) {
  const layer = useImageLayer(layerId)
  const updateAnimation = useImageLayerStore((s) => s.updateAnimation)

  if (!layer) return null
  const an = layer.animation
  const set = (patch: Partial<typeof an>) => updateAnimation(layerId, patch)

  return (
    <SectionWrapper title="Animation" icon={<Zap size={14} />} defaultOpen={false}>
      <p className="text-[10px] uppercase tracking-wide text-text-disabled font-medium mb-1">
        Entrance
      </p>
      <BadgePicker options={ENTRANCE} value={an.entrance} onChange={(entrance) => set({ entrance })} />
      {an.entrance !== 'none' && (
        <SliderRow
          label="Duration"
          value={an.entranceDuration}
          min={0.1}
          max={3}
          step={0.1}
          unit="s"
          onChange={(entranceDuration) => set({ entranceDuration })}
        />
      )}

      <p className="text-[10px] uppercase tracking-wide text-text-disabled font-medium mt-3 mb-1">
        Exit
      </p>
      <BadgePicker options={EXIT} value={an.exit} onChange={(exit) => set({ exit })} />
      {an.exit !== 'none' && (
        <SliderRow
          label="Duration"
          value={an.exitDuration}
          min={0.1}
          max={3}
          step={0.1}
          unit="s"
          onChange={(exitDuration) => set({ exitDuration })}
        />
      )}
    </SectionWrapper>
  )
}
