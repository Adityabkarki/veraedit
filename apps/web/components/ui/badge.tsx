import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        success: 'bg-status-success/15 text-status-success',
        warning: 'bg-status-warning/15 text-status-warning',
        error: 'bg-status-error/15 text-status-error',
        info: 'bg-status-info/15 text-status-info',
        default: 'bg-bg-overlay text-text-secondary',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children: React.ReactNode
  className?: string
}

export function Badge({ children, variant, className }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)}>
      {children}
    </span>
  )
}
