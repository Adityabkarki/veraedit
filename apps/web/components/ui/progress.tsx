import { cn } from '@/lib/utils'

interface ProgressProps {
  /** 0–100 */
  value: number
  className?: string
  barClassName?: string
}

/**
 * Progress bar.
 * Renders an accessible progressbar with ARIA attributes.
 */
export function Progress({ value, className, barClassName }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('w-full rounded-full bg-bg-overlay h-1.5', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-accent transition-all duration-300',
          barClassName
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
