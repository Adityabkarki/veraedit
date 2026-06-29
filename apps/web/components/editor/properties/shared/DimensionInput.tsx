'use client'

interface DimensionInputProps {
  label: string
  value: number
  unit?: string
  onChange: (value: number) => void
  step?: number
  testId?: string
}

export function DimensionInput({
  label,
  value,
  unit = 'px',
  onChange,
  step = 1,
  testId,
}: DimensionInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-text-disabled uppercase tracking-wide">{label}</span>
      <div className="flex items-center border border-bg-overlay rounded-md overflow-hidden">
        <input
          type="number"
          data-testid={testId}
          value={Math.round(value * 10) / 10}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-2 py-1.5 text-xs bg-bg-overlay/30 text-text-primary outline-none
                     [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                     [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="text-[10px] text-text-disabled px-1.5 bg-bg-overlay/50 border-l border-bg-overlay py-1.5">
          {unit}
        </span>
      </div>
    </div>
  )
}
