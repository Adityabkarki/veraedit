'use client'

/**
 * StylePicker — 4 caption style presets + custom overrides.
 *
 * Presets:
 *   🇳🇵 Nepali Bold   — large Devanagari, dark bg, bottom
 *   Subtitle          — standard white text, dark shadow
 *   TikTok            — bold yellow centred, high contrast
 *   Bilingual         — Nepali + English, dark bg
 *
 * After picking a preset, the user can adjust:
 *   size, color, position, bold toggle
 */

import { useCaptionsStore, CAPTION_PRESETS } from '@/stores/captionsStore'
import type { CaptionPreset, FontSize, Position } from '@/stores/captionsStore'

const SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small',  label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large',  label: 'L' },
  { value: 'xl',     label: 'XL' },
]

const POSITION_OPTIONS: { value: Position; label: string; icon: string }[] = [
  { value: 'top',    label: 'Top',    icon: '⬆' },
  { value: 'center', label: 'Center', icon: '↔' },
  { value: 'bottom', label: 'Bottom', icon: '⬇' },
]

export function StylePicker() {
  const { globalStyle, applyPreset, setStyleProp } = useCaptionsStore()

  return (
    <div data-testid="style-picker" className="px-3 py-3 border-b border-bg-overlay">
      {/* Preset chips */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled mb-2">
        Style preset
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.keys(CAPTION_PRESETS) as CaptionPreset[]).map((key) => {
          const preset = CAPTION_PRESETS[key]
          const active = globalStyle.preset === key
          return (
            <button
              key={key}
              data-testid={`style-preset-${key}`}
              onClick={() => applyPreset(key)}
              aria-pressed={active}
              title={preset.description}
              className={[
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                active
                  ? 'bg-accent text-white'
                  : 'bg-bg-overlay text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
              ].join(' ')}
            >
              {key === 'nepali-bold' && <span className="text-[10px]">🇳🇵</span>}
              {preset.label}
            </button>
          )
        })}
      </div>

      {/* Size + position row */}
      <div className="flex items-center gap-4">
        {/* Font size */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-disabled mr-1">Size</span>
          <div className="flex gap-0.5" role="group" aria-label="Font size">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-testid={`size-${opt.value}`}
                onClick={() => setStyleProp('fontSize', opt.value)}
                aria-pressed={globalStyle.fontSize === opt.value}
                className={[
                  'w-7 h-7 rounded text-xs font-medium transition-colors',
                  globalStyle.fontSize === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Position */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-disabled mr-1">Position</span>
          <div className="flex gap-0.5" role="group" aria-label="Caption position">
            {POSITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                data-testid={`position-${opt.value}`}
                onClick={() => setStyleProp('position', opt.value)}
                aria-pressed={globalStyle.position === opt.value}
                title={opt.label}
                className={[
                  'w-7 h-7 rounded text-xs transition-colors',
                  globalStyle.position === opt.value
                    ? 'bg-accent text-white'
                    : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
                ].join(' ')}
              >
                {opt.icon}
              </button>
            ))}
          </div>
        </div>

        {/* Bold toggle */}
        <button
          data-testid="style-bold"
          onClick={() => setStyleProp('bold', !globalStyle.bold)}
          aria-pressed={globalStyle.bold}
          className={[
            'w-7 h-7 rounded font-bold text-sm transition-colors',
            globalStyle.bold
              ? 'bg-accent text-white'
              : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          B
        </button>

        {/* Nepali font toggle */}
        <button
          data-testid="style-nepali-font"
          onClick={() => setStyleProp('useNepaliFont', !globalStyle.useNepaliFont)}
          aria-pressed={globalStyle.useNepaliFont}
          title="Use Noto Sans Devanagari for Nepali captions"
          className={[
            'flex items-center gap-1 px-2 h-7 rounded text-xs transition-colors',
            globalStyle.useNepaliFont
              ? 'bg-accent text-white'
              : 'bg-bg-overlay text-text-secondary hover:text-text-primary',
          ].join(' ')}
        >
          <span className="text-[10px]">🇳🇵</span> Ne
        </button>
      </div>
    </div>
  )
}
