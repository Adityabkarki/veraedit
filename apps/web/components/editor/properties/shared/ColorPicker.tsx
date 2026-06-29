'use client'

import { cn } from '@/lib/utils'

const PRESET_COLORS = [
  { label: 'None', value: 'none' },
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
  { label: 'Yellow', value: '#f5c518' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Green', value: '#22c55e' },
]

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
  allowNone?: boolean
}

export function ColorPicker({ value, onChange, allowNone = false }: ColorPickerProps) {
  const presets = allowNone ? PRESET_COLORS : PRESET_COLORS.slice(1)

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {presets.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          onClick={() => onChange(c.value)}
          className={cn(
            'w-5 h-5 rounded-full border transition-all hover:scale-110 relative',
            value === c.value ? 'ring-2 ring-accent ring-offset-1' : 'border-bg-overlay',
            c.value === 'none' && 'bg-bg-overlay',
          )}
          style={c.value !== 'none' ? { background: c.value } : {}}
        >
          {c.value === 'none' && (
            <span className="absolute inset-0 flex items-center justify-center text-[8px] text-text-disabled">
              ✕
            </span>
          )}
        </button>
      ))}
      <input
        type="color"
        value={value === 'none' ? '#ffffff' : value}
        onChange={(e) => onChange(e.target.value)}
        className="w-5 h-5 rounded-full border border-bg-overlay cursor-pointer p-0 overflow-hidden"
        title="Custom color"
      />
    </div>
  )
}
