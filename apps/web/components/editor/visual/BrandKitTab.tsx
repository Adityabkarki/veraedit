'use client'

/**
 * BrandKitTab — set brand colours, font, and apply to all templates.
 *
 * Fields:
 *   Primary color   — main brand colour (default: crimson)
 *   Secondary color — background / dark colour
 *   Accent color    — CTA / highlight colour
 *   Font style      — Default or Nepali (Noto Sans Devanagari)
 *   Logo text       — Short initials / name shown in previews
 *
 * "Apply brand" re-colours all placed overlays to use brand primary.
 */

import { useVisualLibraryStore, DEFAULT_BRAND_KIT } from '@/stores/visualLibraryStore'

export function BrandKitTab() {
  const { brandKit, brandApplied, setBrandKit, applyBrandToAll, resetOverlays } = useVisualLibraryStore()

  return (
    <div data-testid="brand-kit-tab" className="flex flex-col gap-4 p-4 overflow-y-auto h-full">

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Brand Kit</h3>
        {brandApplied && (
          <span className="text-[10px] text-status-success bg-status-success/10 px-1.5 py-0.5 rounded">
            ✓ Applied
          </span>
        )}
      </div>

      {/* Color inputs */}
      <div className="space-y-3">
        {/* Primary */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-text-secondary w-20 flex-shrink-0">Primary</label>
          <div className="flex items-center gap-2 flex-1">
            <input
              data-testid="brand-primary-color"
              type="color"
              value={brandKit.primaryColor}
              onChange={(e) => setBrandKit({ primaryColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-bg-overlay"
            />
            <input
              type="text"
              value={brandKit.primaryColor}
              onChange={(e) => setBrandKit({ primaryColor: e.target.value })}
              placeholder="#C41E3A"
              className="flex-1 bg-bg-overlay rounded px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Secondary */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-text-secondary w-20 flex-shrink-0">Secondary</label>
          <div className="flex items-center gap-2 flex-1">
            <input
              data-testid="brand-secondary-color"
              type="color"
              value={brandKit.secondaryColor}
              onChange={(e) => setBrandKit({ secondaryColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-bg-overlay"
            />
            <input
              type="text"
              value={brandKit.secondaryColor}
              onChange={(e) => setBrandKit({ secondaryColor: e.target.value })}
              placeholder="#111113"
              className="flex-1 bg-bg-overlay rounded px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Accent */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-text-secondary w-20 flex-shrink-0">Accent</label>
          <div className="flex items-center gap-2 flex-1">
            <input
              data-testid="brand-accent-color"
              type="color"
              value={brandKit.accentColor}
              onChange={(e) => setBrandKit({ accentColor: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-bg-overlay"
            />
            <input
              type="text"
              value={brandKit.accentColor}
              onChange={(e) => setBrandKit({ accentColor: e.target.value })}
              placeholder="#F59E0B"
              className="flex-1 bg-bg-overlay rounded px-2 py-1.5 text-xs font-mono text-text-primary outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {/* Font preference */}
      <div>
        <p className="text-xs text-text-secondary mb-2">Font style</p>
        <div className="flex gap-2">
          <button
            data-testid="font-default"
            onClick={() => setBrandKit({ fontStyle: 'default' })}
            aria-pressed={brandKit.fontStyle === 'default'}
            className={[
              'flex-1 py-2 rounded-lg text-xs font-medium transition-colors border',
              brandKit.fontStyle === 'default'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-bg-overlay text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            Default
          </button>
          <button
            data-testid="font-nepali"
            onClick={() => setBrandKit({ fontStyle: 'nepali' })}
            aria-pressed={brandKit.fontStyle === 'nepali'}
            className={[
              'flex-1 py-2 rounded-lg text-xs font-medium transition-colors border',
              brandKit.fontStyle === 'nepali'
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-bg-overlay text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            🇳🇵 Nepali
          </button>
        </div>
      </div>

      {/* Logo text */}
      <div>
        <p className="text-xs text-text-secondary mb-2">Logo / Channel name</p>
        <input
          data-testid="brand-logo-text"
          type="text"
          value={brandKit.logoText}
          onChange={(e) => setBrandKit({ logoText: e.target.value })}
          placeholder="VE"
          maxLength={20}
          className="w-full bg-bg-overlay rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Preview swatch */}
      <div
        data-testid="brand-preview"
        className="rounded-xl overflow-hidden border border-bg-overlay"
        style={{ aspectRatio: '16/9', background: brandKit.secondaryColor }}
      >
        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
          <div
            className="px-4 py-1.5 rounded-full text-sm font-bold"
            style={{ background: brandKit.primaryColor, color: '#fff' }}
          >
            {brandKit.logoText || 'Brand'}
          </div>
          <div
            className="w-16 h-0.5 rounded"
            style={{ background: brandKit.accentColor }}
          />
        </div>
      </div>

      {/* Apply button */}
      <button
        data-testid="apply-brand"
        onClick={applyBrandToAll}
        className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold
                   hover:bg-accent-glow transition-colors"
      >
        Apply brand to all templates
      </button>

      {/* Reset */}
      <button
        data-testid="reset-brand"
        onClick={() => {
          useVisualLibraryStore.getState().setBrandKit({ ...DEFAULT_BRAND_KIT })
        }}
        className="w-full py-2 rounded-xl text-xs text-text-disabled
                   hover:text-text-secondary hover:bg-bg-overlay transition-colors"
      >
        Reset to defaults
      </button>
    </div>
  )
}
