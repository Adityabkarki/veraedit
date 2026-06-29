'use client'

/**
 * VisualLibraryPanel — Canva-style visual template library in the left panel.
 *
 * Shown when the left panel's "Brand" tab is active.
 *
 * Tabs: [Templates] [Elements] [Brand Kit]
 *
 * Templates: 18 presets across 6 categories with English ↔ Nepali toggle.
 * Elements:  Simple shapes, arrows, emojis.
 * Brand Kit: Set primary/secondary/accent colours + font, apply to all.
 *
 * Placed overlays panel: shows a summary of inserted templates with
 * edit/remove buttons.
 */

import { useVisualLibraryStore } from '@/stores/visualLibraryStore'
import type { VisualTab }        from '@/stores/visualLibraryStore'
import { TemplatesTab } from '@/components/editor/visual/TemplatesTab'
import { ClonedTemplatesSection } from '@/components/editor/ClonedTemplatesSection'
import { BrandKitTab }  from '@/components/editor/visual/BrandKitTab'
import { openStyleTransfer } from '@/lib/openStyleTransfer'
import { OverlayEditPanel } from '@/components/editor/visual/OverlayEditPanel'

interface VisualLibraryPanelProps {
  projectId?: string
}

const TABS: { id: VisualTab; label: string; icon: string }[] = [
  { id: 'templates', label: 'Templates', icon: '⬛' },
  { id: 'brand',     label: 'Brand',     icon: '🎨' },
]

export function VisualLibraryPanel({ projectId = '' }: VisualLibraryPanelProps) {
  const {
    activeTab,
    setActiveTab,
    placedOverlays,
    removeOverlay,
    startEditOverlay,
  } = useVisualLibraryStore()

  return (
    <div
      data-testid="visual-library-panel"
      className="flex flex-col h-full bg-bg-surface overflow-hidden"
    >
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Visual library tabs"
        className="flex border-b border-bg-overlay flex-shrink-0"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            data-testid={`visual-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              activeTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
            ].join(' ')}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        data-testid={`visual-tab-content-${activeTab}`}
        role="tabpanel"
        className="flex-1 overflow-hidden flex flex-col"
      >
        {activeTab === 'templates' && (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <TemplatesTab />
            </div>
            <ClonedTemplatesSection />
          </div>
        )}
        {activeTab === 'brand'     && <BrandKitTab  />}
      </div>

      <div className="flex-shrink-0 px-3 py-2 border-t border-bg-overlay">
        <button
          type="button"
          data-testid="brand-open-style-tab"
          onClick={openStyleTransfer}
          className="w-full text-left text-[10px] text-violet-300 hover:text-violet-200 py-1"
        >
          ✨ Style templates (extract / apply) — open Style tab →
        </button>
      </div>

      {/* Placed overlays mini-list */}
      {placedOverlays.length > 0 && activeTab !== 'brand' && (
        <div
          data-testid="placed-overlays-list"
          className="border-t border-bg-overlay flex-shrink-0 max-h-32 overflow-y-auto"
        >
          <div className="px-3 py-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
              Placed ({placedOverlays.length})
            </p>
          </div>
          {placedOverlays.map((overlay) => (
            <button
              key={overlay.id}
              type="button"
              data-testid={`placed-overlay-${overlay.id}`}
              onClick={() => startEditOverlay(overlay.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-bg-overlay group text-left"
            >
              <div
                className="w-3 h-3 rounded flex-shrink-0"
                style={{ background: overlay.color }}
              />
              <span className="flex-1 text-xs text-text-secondary truncate">
                {overlay.text.slice(0, 20)}
                <span className="text-text-disabled ml-1">
                  · {overlay.duration.toFixed(0)}s
                </span>
              </span>
              <span className="text-[10px] font-mono text-text-disabled flex-shrink-0">
                {overlay.startTime.toFixed(1)}s
              </span>
              <span
                role="button"
                tabIndex={0}
                data-testid={`remove-overlay-${overlay.id}`}
                onClick={(e) => { e.stopPropagation(); removeOverlay(overlay.id) }}
                aria-label="Remove overlay"
                className="opacity-0 group-hover:opacity-100 text-text-disabled hover:text-status-error transition-all text-xs"
              >
                ✕
              </span>
            </button>
          ))}
        </div>
      )}

      <OverlayEditPanel />
    </div>
  )
}
