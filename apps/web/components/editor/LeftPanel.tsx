'use client'

/**
 * LeftPanel — media, script, and brand kit.
 */

import { useEditorStore, type LeftTab } from '@/stores/editorStore'
import { PanelTooltip } from '@/components/editor/PanelTooltip'
import { TranscriptEditor } from '@/components/editor/TranscriptEditor'
import { VisualLibraryPanel } from '@/components/editor/VisualLibraryPanel'
import { MediaPanel } from '@/components/editor/MediaPanel'

interface Tab {
  id: LeftTab
  label: string
  short: string
  badge?: number
  icon: React.ReactNode
}

const FilmIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="1.5" y="3.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1.25"/>
    <path d="M5.5 3.5V12.5M10.5 3.5V12.5" stroke="currentColor" strokeWidth="1.25"/>
  </svg>
)

const ScriptIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 3h8v10H4z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
    <path d="M6 6h4M6 8.5h4M6 11h2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
  </svg>
)

const BrandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.25"/>
    <circle cx="8" cy="8" r="2" fill="currentColor"/>
  </svg>
)

interface LeftPanelProps {
  projectId?: string
}

export function LeftPanel({ projectId }: LeftPanelProps = {}) {
  const { activeLeftTab, setActiveLeftTab } = useEditorStore()

  const TABS: Tab[] = [
    { id: 'media', label: 'Media', short: 'Media', icon: <FilmIcon /> },
    { id: 'transcript', label: 'Script', short: 'Script', icon: <ScriptIcon /> },
    { id: 'brand', label: 'Brand', short: 'Brand', icon: <BrandIcon /> },
  ]

  return (
    <div
      data-testid="left-panel"
      className="flex flex-col h-full min-h-0 min-w-0 bg-bg-surface border-r border-bg-overlay overflow-hidden relative"
    >
      <PanelTooltip
        panelKey="left"
        title="Project panels"
        description="Media, script, and brand overlays."
        placement="right"
      />

      <div
        role="tablist"
        aria-label="Left panel tabs"
        className="flex flex-shrink-0 border-b border-bg-overlay overflow-x-auto overscroll-x-contain"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeLeftTab === tab.id}
            aria-controls={`left-panel-${tab.id}`}
            data-testid={`left-tab-${tab.id}`}
            title={tab.label}
            onClick={() => setActiveLeftTab(tab.id)}
            className={[
              'relative flex flex-col items-center justify-center gap-0.5 min-w-[3.25rem] max-w-[4.5rem] shrink-0 px-1 py-2 text-[10px] font-medium transition-colors border-b-2',
              activeLeftTab === tab.id
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
            ].join(' ')}
          >
            {tab.icon}
            <span className="truncate w-full text-center leading-tight">{tab.short}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                data-testid={`tab-badge-${tab.id}`}
                className="absolute top-0.5 right-0 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-accent text-white text-[8px] font-bold px-0.5"
              >
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div
        id={`left-panel-${activeLeftTab}`}
        role="tabpanel"
        data-testid={`left-panel-content-${activeLeftTab}`}
        className="flex-1 min-h-0 overflow-hidden "
      >
        {activeLeftTab === 'media' && <MediaPanel projectId={projectId} />}
        {activeLeftTab === 'transcript' && <TranscriptEditor projectId={projectId} />}
        {activeLeftTab === 'brand' && <VisualLibraryPanel projectId={projectId} />}
      </div>
    </div>
  )
}
