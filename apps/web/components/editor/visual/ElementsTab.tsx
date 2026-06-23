'use client'

/**
 * ElementsTab — simple shapes, icons, and dividers to add to the video.
 *
 * Categories: Shapes | Dividers | Arrows | Emojis
 * Click any element to insert it at the playhead as an overlay.
 */

import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import { useTimelineStore }      from '@/stores/timelineStore'

interface Element {
  id:    string
  label: string
  emoji: string
  type:  'shape' | 'divider' | 'arrow' | 'emoji'
}

const ELEMENTS: Element[] = [
  { id: 'el-rect',   label: 'Rectangle', emoji: '▬',  type: 'shape'   },
  { id: 'el-circle', label: 'Circle',    emoji: '●',  type: 'shape'   },
  { id: 'el-line',   label: 'Line',      emoji: '─',  type: 'divider' },
  { id: 'el-wave',   label: 'Wave',      emoji: '〜', type: 'divider' },
  { id: 'el-arr-r',  label: 'Arrow →',   emoji: '→',  type: 'arrow'   },
  { id: 'el-arr-l',  label: 'Arrow ←',   emoji: '←',  type: 'arrow'   },
  { id: 'el-arr-u',  label: 'Arrow ↑',   emoji: '↑',  type: 'arrow'   },
  { id: 'el-arr-d',  label: 'Arrow ↓',   emoji: '↓',  type: 'arrow'   },
  { id: 'el-fire',   label: 'Fire',      emoji: '🔥', type: 'emoji'   },
  { id: 'el-star',   label: 'Star',      emoji: '⭐', type: 'emoji'   },
  { id: 'el-check',  label: 'Check',     emoji: '✅', type: 'emoji'   },
  { id: 'el-warn',   label: 'Warning',   emoji: '⚠️', type: 'emoji'   },
]

export function ElementsTab() {
  const { insertElement } = useVisualLibraryStore()
  const { playheadTime } = useTimelineStore()

  return (
    <div data-testid="elements-tab" className="flex flex-col h-full overflow-y-auto p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-3">
        Shapes, dividers & emoji
      </p>

      <div className="grid grid-cols-4 gap-2">
        {ELEMENTS.map((el) => (
          <button
            key={el.id}
            data-testid={`element-${el.id}`}
            onClick={() => insertElement(el.id, playheadTime)}
            title={el.label}
            aria-label={`Insert ${el.label}`}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-bg-elevated
                       border-2 border-transparent hover:border-accent transition-colors group"
          >
            <span className="text-2xl leading-none">{el.emoji}</span>
            <span className="text-[9px] text-text-disabled group-hover:text-text-secondary transition-colors">
              {el.label}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[10px] text-text-disabled text-center mt-4">
        Drag onto the timeline or click to insert at playhead.
      </p>
    </div>
  )
}
