'use client'

import { cn } from '@/lib/utils'

interface Option<T extends string> {
  value: T
  label: string
}

interface BadgePickerProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
}

export function BadgePicker<T extends string>({
  options,
  value,
  onChange,
}: BadgePickerProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'text-xs px-2.5 py-1 rounded-full border transition-all',
            value === opt.value
              ? 'bg-accent/10 text-accent border-accent/30 font-medium'
              : 'border-bg-overlay text-text-secondary hover:border-bg-elevated hover:text-text-primary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
