'use client'

/**
 * ShortEnhancePanel — brand, templates, effects, and style presets for one short.
 * Changes stay in shortsStore only — never touches the main timeline.
 */

import { useCallback, useEffect, useState } from 'react'
import { useShortsStore, type Short } from '@/stores/shortsStore'
import { useVisualLibraryStore, DEFAULT_BRAND_KIT } from '@/stores/visualLibraryStore'
import {
  COLOR_FILTERS,
  SPEED_PRESETS,
  TEXT_TEMPLATES,
} from '@/stores/effectsStore'
import { fetchStyleLibrary, type StylePreset } from '@/lib/styleTransfer'
import {
  SHORT_TEMPLATE_IDS,
  SHORT_FILTER_IDS,
  SHORT_SPEED_IDS,
  SHORT_TEXT_EFFECT_IDS,
  shortTemplateById,
} from '@/lib/shortStyling'

type EnhanceTab = 'brand' | 'templates' | 'effects' | 'styles'

interface ShortEnhancePanelProps {
  short:      Short
  projectId?: string
}

const TABS: { id: EnhanceTab; label: string }[] = [
  { id: 'brand',     label: 'Brand' },
  { id: 'templates', label: 'Templates' },
  { id: 'effects',   label: 'Effects' },
  { id: 'styles',    label: 'Styles' },
]

export function ShortEnhancePanel({ short, projectId }: ShortEnhancePanelProps) {
  const [tab, setTab] = useState<EnhanceTab>('templates')
  const [stylePresets, setStylePresets] = useState<StylePreset[]>([])
  const [stylesLoading, setStylesLoading] = useState(false)

  const {
    applyShortBrandFromProject,
    applyShortFilter,
    applyShortSpeed,
    addShortTemplate,
    addShortTextEffect,
    removeShortOverlay,
    applyShortStylePreset,
    clearShortStyling,
  } = useShortsStore()

  const projectBrand = useVisualLibraryStore((s) => s.brandKit)
  const styling = short.styling

  useEffect(() => {
    if (tab !== 'styles' || !projectId) return
    let cancelled = false
    setStylesLoading(true)
    void fetchStyleLibrary(projectId).then((res) => {
      if (cancelled) return
      setStylePresets(res.data?.presets ?? [])
      setStylesLoading(false)
    })
    return () => { cancelled = true }
  }, [tab, projectId])

  const handleApplyBrand = useCallback(() => {
    applyShortBrandFromProject(short.id, { ...projectBrand })
  }, [short.id, projectBrand, applyShortBrandFromProject])

  return (
    <div
      data-testid={`short-enhance-${short.id}`}
      className="rounded-lg bg-bg-elevated p-2 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
          Short styling
        </p>
        {(styling.filterId || styling.overlays.length > 0 || styling.brandApplied || styling.stylePresetId) && (
          <button
            type="button"
            onClick={() => clearShortStyling(short.id)}
            className="text-[10px] text-text-disabled hover:text-status-error"
            data-testid={`short-clear-styling-${short.id}`}
          >
            Clear all
          </button>
        )}
      </div>

      <p className="text-[10px] text-text-disabled leading-snug">
        Brand, templates, and effects apply only to this short — not the main editor timeline.
      </p>

      <div className="flex gap-0.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`short-enhance-tab-${t.id}-${short.id}`}
            onClick={() => setTab(t.id)}
            className={[
              'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
              tab === t.id
                ? 'bg-accent/20 text-accent'
                : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'brand' && (
        <div className="space-y-2" data-testid={`short-brand-panel-${short.id}`}>
          <div
            className="rounded-lg overflow-hidden border border-bg-overlay"
            style={{
              aspectRatio: '9/16',
              maxHeight: 80,
              background: styling.brandApplied && styling.brandKit
                ? styling.brandKit.secondaryColor
                : DEFAULT_BRAND_KIT.secondaryColor,
            }}
          >
            <div className="w-full h-full flex flex-col items-center justify-center gap-1">
              <div
                className="px-3 py-1 rounded-full text-[10px] font-bold text-white"
                style={{
                  background: styling.brandApplied && styling.brandKit
                    ? styling.brandKit.primaryColor
                    : projectBrand.primaryColor,
                }}
              >
                {(styling.brandKit?.logoText || projectBrand.logoText) || 'Brand'}
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid={`short-apply-brand-${short.id}`}
            onClick={handleApplyBrand}
            className="w-full py-1.5 rounded-lg text-[10px] font-medium bg-accent/10 text-accent hover:bg-accent/20"
          >
            Apply project brand to this short
          </button>
          {styling.brandApplied && (
            <p className="text-[10px] text-status-success">Brand applied to this short only</p>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid grid-cols-3 gap-1" data-testid={`short-templates-panel-${short.id}`}>
          {SHORT_TEMPLATE_IDS.map((id) => {
            const tpl = shortTemplateById(id)
            if (!tpl) return null
            return (
              <button
                key={id}
                type="button"
                data-testid={`short-add-template-${id}-${short.id}`}
                onClick={() => addShortTemplate(short.id, id)}
                className="rounded p-1.5 text-left border border-bg-overlay hover:border-accent/40 transition-colors"
                style={{ background: tpl.previewBg }}
                title={tpl.name}
              >
                <span className="text-[9px] text-white/90 font-medium line-clamp-2">{tpl.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {tab === 'effects' && (
        <div className="space-y-2" data-testid={`short-effects-panel-${short.id}`}>
          <div>
            <p className="text-[9px] text-text-disabled mb-1">Color filters</p>
            <div className="flex flex-wrap gap-1">
              {SHORT_FILTER_IDS.map((id) => {
                const f = COLOR_FILTERS.find((x) => x.id === id)
                if (!f) return null
                const active = styling.filterId === id
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`short-filter-${id}-${short.id}`}
                    onClick={() => applyShortFilter(short.id, id)}
                    className={[
                      'px-2 py-0.5 rounded text-[9px] font-medium border transition-colors',
                      active ? 'border-accent text-accent bg-accent/10' : 'border-bg-overlay text-text-secondary',
                    ].join(' ')}
                  >
                    {f.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[9px] text-text-disabled mb-1">Speed</p>
            <div className="flex flex-wrap gap-1">
              {SHORT_SPEED_IDS.map((id) => {
                const p = SPEED_PRESETS.find((x) => x.id === id)
                if (!p) return null
                const active = styling.speedId === id
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`short-speed-${id}-${short.id}`}
                    onClick={() => applyShortSpeed(short.id, id)}
                    className={[
                      'px-2 py-0.5 rounded text-[9px] font-medium border transition-colors',
                      active ? 'border-accent text-accent bg-accent/10' : 'border-bg-overlay text-text-secondary',
                    ].join(' ')}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[9px] text-text-disabled mb-1">Text overlays</p>
            <div className="flex flex-wrap gap-1">
              {SHORT_TEXT_EFFECT_IDS.map((id) => {
                const t = TEXT_TEMPLATES.find((x) => x.id === id)
                if (!t) return null
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`short-text-${id}-${short.id}`}
                    onClick={() => addShortTextEffect(short.id, id)}
                    className="px-2 py-0.5 rounded text-[9px] font-medium border border-bg-overlay text-text-secondary hover:border-accent/40"
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'styles' && (
        <div className="space-y-1 max-h-32 overflow-y-auto" data-testid={`short-styles-panel-${short.id}`}>
          {stylesLoading && (
            <p className="text-[10px] text-text-disabled">Loading style library…</p>
          )}
          {!stylesLoading && stylePresets.length === 0 && (
            <p className="text-[10px] text-text-disabled">
              No saved styles yet. Extract one from Style Transfer in the editor.
            </p>
          )}
          {stylePresets.map((preset) => {
            const active = styling.stylePresetId === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`short-style-${preset.id}-${short.id}`}
                onClick={() => applyShortStylePreset(short.id, preset.id, preset.name ?? 'Style')}
                className={[
                  'w-full text-left px-2 py-1.5 rounded text-[10px] border transition-colors',
                  active ? 'border-accent bg-accent/10 text-accent' : 'border-bg-overlay text-text-secondary hover:border-accent/30',
                ].join(' ')}
              >
                {preset.name}
                {active && <span className="ml-1 opacity-70">· applied</span>}
              </button>
            )
          })}
        </div>
      )}

      {styling.overlays.length > 0 && (
        <div className="border-t border-bg-overlay pt-2 space-y-1">
          <p className="text-[9px] text-text-disabled">Overlays on this short</p>
          {styling.overlays.map((o) => (
            <div key={o.id} className="flex items-center gap-1">
              <span className="flex-1 text-[10px] text-text-secondary truncate">{o.text.slice(0, 28)}</span>
              <button
                type="button"
                data-testid={`short-remove-overlay-${o.id}`}
                onClick={() => removeShortOverlay(short.id, o.id)}
                className="text-[10px] text-text-disabled hover:text-status-error px-1"
                aria-label="Remove overlay"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
