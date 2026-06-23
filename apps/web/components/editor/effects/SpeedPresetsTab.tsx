'use client'

/**
 * SpeedPresetsTab — playback speed presets with curve visualisation.
 *
 * Shows 6 presets: Normal / 2× Fast / 3× Fast / ½ Slow-mo / ¼ Slow-mo / Ramp
 * Each shows an icon, multiplier, description, and a simple SVG curve preview.
 * Clicking applies the speed to the selected clip.
 */

import { useEffectsStore, SPEED_PRESETS } from '@/stores/effectsStore'
import { useTimelineStore }               from '@/stores/timelineStore'

/** Simple SVG path for each curve type */
function CurveIcon({ curve, color }: { curve: string; color: string }) {
  const paths: Record<string, string> = {
    'linear':    'M4 28 L44 4',
    'ramp-up':   'M4 28 Q20 28 44 4',
    'ramp-down': 'M4 4 Q28 28 44 28',
    'plateau':   'M4 20 Q16 4 24 4 Q32 4 44 20',
  }
  return (
    <svg
      width="48" height="32" viewBox="0 0 48 32"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <rect width="48" height="32" rx="4" fill="rgba(0,0,0,0.2)"/>
      <path
        d={paths[curve] ?? paths['linear']}
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SpeedPresetsTab() {
  const { filteredSpeedPresets, recentlyUsed, applyEffect } = useEffectsStore()
  const { selectedClipIds } = useTimelineStore()
  const presets = filteredSpeedPresets()

  return (
    <div data-testid="speed-presets-tab" className="flex flex-col gap-2 p-3">
      {presets.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-8">
          No presets match your search.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {presets.map((p) => {
            const isRecent = recentlyUsed.includes(p.id)
            return (
              <button
                key={p.id}
                data-testid={`speed-preset-tile-${p.id}`}
                onClick={() => applyEffect(p.id)}
                title={p.description}
                aria-label={`Apply ${p.name} speed preset`}
                className="flex items-center gap-3 p-3 rounded-xl border-2 border-transparent
                           hover:border-accent bg-bg-elevated hover:bg-bg-overlay
                           transition-all group text-left"
              >
                {/* Icon + curve */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-xl leading-none">{p.icon}</span>
                  <CurveIcon curve={p.curve} color={p.color} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-sm font-semibold text-text-primary group-hover:text-white">
                      {p.name}
                    </span>
                    {isRecent && (
                      <span className="text-[9px] text-accent font-bold">★</span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary leading-snug">{p.description}</p>
                  {p.multiplier !== 1 && (
                    <span
                      data-testid={`speed-multiplier-${p.id}`}
                      className="inline-block mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${p.color}30`, color: p.color }}
                    >
                      {p.multiplier}×
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedClipIds.length === 0 && (
        <p className="text-[11px] text-text-disabled text-center mt-2">
          Select a clip on the timeline to apply a speed preset.
        </p>
      )}
    </div>
  )
}
