'use client'

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  formatValue?: (v: number) => string
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  formatValue,
}: SliderRowProps) {
  const display = formatValue ? formatValue(value) : `${value}${unit}`

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-24 flex-shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-accent cursor-pointer"
      />
      <span className="text-xs font-medium text-text-primary w-12 text-right tabular-nums">
        {display}
      </span>
    </div>
  )
}
