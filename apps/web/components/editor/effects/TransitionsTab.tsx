'use client'

/**
 * TransitionsTab — grid of transition effects with hover previews.
 *
 * Shows transitions grouped by category (Cut / Smooth / Dynamic).
 * Clicking applies the transition at the current playhead position.
 * Hovering shows an animated preview in the tile.
 */

import { useEffectsStore, TRANSITIONS } from '@/stores/effectsStore'
import { useTimelineStore }              from '@/stores/timelineStore'

const CATEGORY_LABELS: Record<string, string> = {
  cut:     'Cut',
  smooth:  'Smooth',
  dynamic: 'Dynamic',
}

const CATEGORY_ORDER = ['cut', 'smooth', 'dynamic']

export function TransitionsTab() {
  const { filteredTransitions, recentlyUsed, applyEffect } = useEffectsStore()
  const { selectedClipIds } = useTimelineStore()

  const filtered = filteredTransitions()

  // Group by category
  const grouped: Record<string, typeof filtered> = {}
  for (const t of filtered) {
    if (!grouped[t.category]) grouped[t.category] = []
    grouped[t.category].push(t)
  }

  // Recently used
  const recent = recentlyUsed
    .map((id) => TRANSITIONS.find((t) => t.id === id))
    .filter(Boolean) as typeof TRANSITIONS

  const renderTile = (t: typeof TRANSITIONS[0], key: string) => {
    const isRecent = recentlyUsed.includes(t.id)
    return (
      <button
        key={key}
        data-testid={`transition-tile-${t.id}`}
        onClick={() => applyEffect(t.id)}
        title={`${t.name} — ${t.description}${t.duration > 0 ? ` (${t.duration}s)` : ''}`}
        aria-label={`Apply ${t.name} transition`}
        className="flex flex-col items-center gap-1.5 group"
      >
        {/* Preview tile */}
        <div
          className="w-full aspect-video rounded-lg overflow-hidden relative
                     border-2 border-transparent group-hover:border-accent transition-colors"
          style={{ background: t.previewColor }}
        >
          {/* Transition visual hint */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-0.5 h-full opacity-60 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(255,255,255,0.6)' }}
            />
          </div>
          {/* Left half */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1/2"
            style={{ background: `${t.previewColor}cc` }}
          />
          {/* Duration chip */}
          {t.duration > 0 && (
            <span className="absolute bottom-1 right-1 text-[9px] font-mono text-white/70 bg-black/40 px-1 rounded">
              {t.duration}s
            </span>
          )}
          {isRecent && (
            <span className="absolute top-1 left-1 text-[9px] text-accent font-bold">★</span>
          )}
        </div>
        <span className="text-[11px] text-text-secondary group-hover:text-text-primary transition-colors text-center leading-tight">
          {t.name}
        </span>
      </button>
    )
  }

  return (
    <div data-testid="transitions-tab" className="flex flex-col gap-4 p-3">
      {/* Recently used */}
      {recent.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-2">
            Recently used
          </p>
          <div className="grid grid-cols-5 gap-2">
            {recent.slice(0, 5).map((t) => renderTile(t, `recent-${t.id}`))}
          </div>
        </div>
      )}

      {/* By category */}
      {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
        <div key={cat}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-2">
            {CATEGORY_LABELS[cat]}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {grouped[cat].map((t) => renderTile(t, t.id))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-sm text-text-secondary text-center py-8">
          No transitions match your search.
        </p>
      )}

      {selectedClipIds.length === 0 && (
        <p className="text-[11px] text-text-disabled text-center pb-2">
          Select a clip on the timeline to apply a transition.
        </p>
      )}
    </div>
  )
}
