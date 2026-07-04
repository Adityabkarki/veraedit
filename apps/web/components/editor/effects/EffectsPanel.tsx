'use client'

import { useEffect, useRef, useState } from 'react'
import { useEffectsStore } from '@/stores/effectsStore'
import { openStyleTransfer } from '@/lib/openStyleTransfer'
import { EditToolboxTab } from '@/components/editor/effects/EditToolboxTab'
import { ElementsTab } from '@/components/editor/visual/ElementsTab'
import { MotionGraphicsTab } from '@/components/editor/effects/MotionGraphicsTab'

type SubTab = 'effects' | 'elements' | 'motion'

export interface EffectsPanelProps {
  projectId?: string
  onClose?: () => void
  showHeader?: boolean
}

export function EffectsPanel({ projectId, onClose, showHeader = true }: EffectsPanelProps) {
  const { searchQuery, lastApplied, setSearchQuery, clearLastApplied } = useEffectsStore()
  const searchRef = useRef<HTMLInputElement>(null)
  const [subTab, setSubTab] = useState<SubTab>('effects')

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!lastApplied) return
    const timer = setTimeout(() => clearLastApplied(), 2000)
    return () => clearTimeout(timer)
  }, [lastApplied, clearLastApplied])

  return (
    <div
      data-testid="effects-panel"
      className="flex flex-col h-full bg-bg-surface overflow-hidden"
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-bg-overlay flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-text-primary">Effects &amp; elements</p>
            <p className="text-[10px] text-text-disabled">
              Click to add at playhead · edit timing on the timeline
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastApplied && (
              <span
                data-testid="effect-applied-toast"
                className="text-xs text-status-success font-medium px-2 py-1 rounded bg-status-success/10"
              >
                ✓ Applied!
              </span>
            )}
            {onClose && (
              <button
                type="button"
                data-testid="effects-drawer-close"
                onClick={onClose}
                aria-label="Close effects panel"
                className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-overlay"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sub-tabs: Effects | Elements */}
      <div
        role="tablist"
        aria-label="Effects and elements tabs"
        className="flex border-b border-bg-overlay flex-shrink-0"
      >
        {(['effects', 'elements', 'motion'] as SubTab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={subTab === tab}
            data-testid={`effects-subtab-${tab}`}
            onClick={() => setSubTab(tab)}
            className={[
              'flex-1 py-2 text-xs font-medium transition-colors border-b-2',
              subTab === tab
                ? 'border-accent text-accent'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-overlay',
            ].join(' ')}
          >
            {tab === 'effects' ? 'Effects' : tab === 'elements' ? 'Elements' : 'Motion'}
          </button>
        ))}
      </div>

      {subTab === 'effects' && (
        <>
          <div className="px-3 py-2 border-b border-bg-overlay flex-shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-bg-overlay">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-disabled flex-shrink-0" aria-hidden="true">
                <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M8 8L10.5 10.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <input
                ref={searchRef}
                data-testid="effects-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transitions, images, SFX…"
                aria-label="Search effects"
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-disabled outline-none min-w-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="text-text-disabled hover:text-text-secondary text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="px-3 py-2 border-b border-bg-overlay flex-shrink-0">
            <button
              type="button"
              data-testid="effects-open-style-transfer"
              onClick={() => {
                onClose?.()
                openStyleTransfer()
              }}
              className="w-full flex items-center gap-2 text-[11px] text-violet-300 hover:text-violet-200 py-1"
            >
              <span aria-hidden="true">✨</span>
              <span className="flex-1 text-left">Style tab — extract templates from reference videos</span>
              <span>→</span>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
            <EditToolboxTab projectId={projectId} unified />
          </div>
        </>
      )}

      {subTab === 'elements' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ElementsTab />
        </div>
      )}

      {subTab === 'motion' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <MotionGraphicsTab />
        </div>
      )}
    </div>
  )
}
