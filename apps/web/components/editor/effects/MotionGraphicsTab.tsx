'use client'

/**
 * MotionGraphicsTab — browse and insert pro motion graphics at the playhead.
 */

import { useCallback, useState } from 'react'
import { useTimelineStore, type Clip } from '@/stores/timelineStore'
import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import {
  MOTION_GRAPHICS_LIBRARY,
  buildMotionGraphicClipEffects,
  type MotionGraphicComponentDef,
} from '@/lib/motionGraphicsLibrary'
import { openMotionGraphicEditor } from '@/components/editor/motion/MotionGraphicsEditPanel'
import { allocateDedicatedTrack, offsetEffectsForLane, OVERLAY_FAMILY } from '@/lib/timelineLayers'

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'titles', label: 'Titles' },
  { id: 'typography', label: 'Typography' },
  { id: 'lower_thirds', label: 'Lower thirds' },
  { id: 'data', label: 'Data' },
  { id: 'cta', label: 'CTA' },
  { id: 'effects', label: 'Effects' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'callouts', label: 'Callouts' },
]

export function MotionGraphicsTab() {
  const playheadTime = useTimelineStore((s) => s.playheadTime)
  const clips = useTimelineStore((s) => s.clips)
  const tracks = useTimelineStore((s) => s.tracks)
  const brandColor = useVisualLibraryStore((s) => s.brandKit.primaryColor) || '#3B82F6'
  const [category, setCategory] = useState('all')
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const insertMotionGraphic = useCallback(
    (def: MotionGraphicComponentDef) => {
      const id = `mg-${Date.now().toString(36)}`
      const effects = buildMotionGraphicClipEffects(def.type, brandColor) as Clip['effects']
      const alloc = allocateDedicatedTrack(tracks, clips, OVERLAY_FAMILY)
      const trackId = alloc.trackId
      const laneEffects = offsetEffectsForLane(effects ?? {}, trackId, OVERLAY_FAMILY.prefix)

      const clip: Clip = {
        id,
        trackId,
        startTime: playheadTime,
        duration: def.duration,
        label: def.label,
        type: 'overlay',
        effects: laneEffects as Clip['effects'],
      }

      useTimelineStore.setState({
        tracks: alloc.tracks,
        clips: [...clips, clip],
        selectedClipIds: [id],
        lastEditAction: `Added ${def.label}`,
      })
      openMotionGraphicEditor(id)
      setLastAdded(def.label)
      setTimeout(() => setLastAdded(null), 2000)
    },
    [brandColor, clips, playheadTime, tracks],
  )

  const filtered =
    category === 'all'
      ? MOTION_GRAPHICS_LIBRARY
      : MOTION_GRAPHICS_LIBRARY.filter((c) => c.category === category)

  return (
    <div data-testid="motion-graphics-tab" className="flex flex-col h-full overflow-hidden">
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <p className="text-xs font-semibold text-text-primary">Motion graphics</p>
        <p className="text-[10px] text-text-disabled mt-0.5">
          Click to add at playhead · edit text on the preview canvas
        </p>
        {lastAdded && (
          <p className="text-[10px] text-status-success mt-1">✓ Added {lastAdded}</p>
        )}
      </div>

      <div className="flex gap-1 px-3 pb-2 flex-wrap flex-shrink-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            data-testid={`mg-category-${cat.id}`}
            onClick={() => setCategory(cat.id)}
            className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
              category === cat.id
                ? 'bg-accent/20 border-accent text-accent'
                : 'border-bg-overlay text-text-disabled hover:text-text-secondary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 grid grid-cols-2 gap-2 content-start">
        {filtered.map((def) => (
          <button
            key={def.type}
            type="button"
            data-testid={`mg-item-${def.type}`}
            onClick={() => insertMotionGraphic(def)}
            title={def.description}
            className="flex flex-col items-start gap-1 p-3 rounded-xl bg-bg-elevated border-2 border-transparent hover:border-accent transition-colors text-left group"
          >
            <span className="text-xl leading-none">{def.icon}</span>
            <span className="text-xs font-semibold text-text-primary group-hover:text-accent">
              {def.label}
            </span>
            <span className="text-[9px] text-text-disabled line-clamp-2">{def.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
