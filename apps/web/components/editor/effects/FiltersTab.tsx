'use client'

/**
 * FiltersTab — color grade filter presets.
 *
 * Each filter shows a coloured tile with a CSS filter applied (simulating
 * the real effect). Clicking applies the filter to the selected clip.
 */

import { useEffectsStore } from '@/stores/effectsStore'

export function FiltersTab() {
  const { filteredFilters, recentlyUsed, applyEffect } = useEffectsStore()
  const filters = filteredFilters()

  return (
    <div data-testid="filters-tab" className="flex flex-col gap-2 p-3">
      <div className="grid grid-cols-4 gap-3">
        {filters.map((f) => {
          const isRecent = recentlyUsed.includes(f.id)
          return (
            <button
              key={f.id}
              data-testid={`filter-tile-${f.id}`}
              onClick={() => applyEffect(f.id)}
              title={f.description}
              aria-label={`Apply ${f.name} filter`}
              className="flex flex-col items-center gap-1.5 group"
            >
              {/* Preview swatch */}
              <div
                className="w-full aspect-video rounded-lg border-2 border-transparent
                           group-hover:border-accent transition-colors relative overflow-hidden"
                style={{ background: f.previewColor, filter: f.cssFilter !== 'none' ? f.cssFilter : undefined }}
              >
                {isRecent && (
                  <span className="absolute top-1 left-1 text-[9px] text-accent font-bold">★</span>
                )}
              </div>
              <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors text-center">
                {f.name}
              </span>
            </button>
          )
        })}
      </div>

      {filters.length === 0 && (
        <p className="text-sm text-text-secondary text-center py-8">
          No filters match your search.
        </p>
      )}
    </div>
  )
}
