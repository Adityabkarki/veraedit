'use client'

/**
 * ShortsMode — full-screen Opus Clip-style shorts workflow.
 *
 * Layout:
 *   ┌── filter/sort bar ────────────────────────────────────────────────────┐
 *   │  [All] [YouTube] [Facebook] [TikTok] [Instagram]                     │
 *   │  Sort: [🔥 Virality ▼]  5 shorts found  [□ Select all]               │
 *   ├── 3-column grid ──────────────────────────────────────────────────────┤
 *   │  ShortsCard  ShortsCard  ShortsCard                                   │
 *   │  ShortsCard  ShortsCard                                               │
 *   └───────────────────────────────────────────────────────────────────────┘
 *   Each card plays its short segment inline (9:16 video preview).
 *   └── BulkActionBar (when shorts are selected) ────────────────────────── ┘
 */

import { useShortsStore, PLATFORM_ORDER, PLATFORM_LABELS } from '@/stores/shortsStore'
import type { SortBy, Platform }                          from '@/stores/shortsStore'
import { ShortsCard }    from '@/components/editor/shorts/ShortsCard'
import { BulkActionBar } from '@/components/editor/shorts/BulkActionBar'
import { PlatformShortsExtractor } from '@/components/shorts/PlatformShortsExtractor'
import { useAssetStore } from '@/stores/assetStore'

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'virality',  label: '🔥 Virality'  },
  { value: 'duration',  label: '⏱ Duration'  },
  { value: 'created',   label: '📅 Created'   },
]

export function ShortsMode({ projectId }: { projectId?: string }) {
  const {
    activePlatform,
    sortBy,
    selectedShortIds,
    setActivePlatform,
    setSortBy,
    selectAllShorts,
    clearShortSelection,
    filteredShorts,
    shorts,
  } = useShortsStore()

  const asset = useAssetStore((s) => s.asset)
  const visible     = filteredShorts()
  const allSelected = selectedShortIds.length === shorts.length && shorts.length > 0

  return (
    <div
      data-testid="shorts-mode"
      className="flex flex-col h-full bg-bg-base overflow-hidden"
    >
      {/* ── Filter / sort bar ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-bg-overlay flex-shrink-0 bg-bg-surface">
        {/* Platform tabs */}
        <div
          role="tablist"
          aria-label="Platform filter"
          className="flex gap-1"
        >
          <button
            role="tab"
            aria-selected={activePlatform === 'all'}
            data-testid="shorts-mode-platform-all"
            onClick={() => setActivePlatform('all')}
            className={[
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              activePlatform === 'all'
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
            ].join(' ')}
          >
            All
          </button>
          {PLATFORM_ORDER.map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={activePlatform === p}
              data-testid={`shorts-mode-platform-${p}`}
              onClick={() => setActivePlatform(p)}
              className={[
                'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                activePlatform === p
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
              ].join(' ')}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-disabled">Sort:</span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-testid={`shorts-mode-sort-${opt.value}`}
                onClick={() => setSortBy(opt.value)}
                className={[
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  sortBy === opt.value
                    ? 'bg-bg-overlay text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Count + select all */}
        <div className="flex items-center gap-3 text-xs text-text-disabled">
          <span>{visible.length} short{visible.length !== 1 ? 's' : ''}</span>
          <button
            data-testid="shorts-mode-select-all"
            onClick={allSelected ? clearShortSelection : selectAllShorts}
            className="text-accent hover:text-accent-glow transition-colors"
          >
            {allSelected ? '☑ Deselect all' : '☐ Select all'}
          </button>
        </div>
      </div>

      {/* ── Extractor + Grid ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        {projectId && asset?.storageKey && (
          <PlatformShortsExtractor videoKey={asset.storageKey} projectId={projectId} />
        )}
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <p className="text-text-secondary">No shorts found for this platform.</p>
            <button
              onClick={() => setActivePlatform('all')}
              className="text-xs text-accent hover:text-accent-glow transition-colors"
            >
              Show all platforms
            </button>
          </div>
        ) : (
          <div
            data-testid="shorts-grid"
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {visible.map((short) => (
              <ShortsCard
                key={short.id}
                short={short}
                projectId={projectId}
                isSelected={selectedShortIds.includes(short.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar />
    </div>
  )
}
