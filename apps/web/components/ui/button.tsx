import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base — every button has icon+label, visible focus ring, no icon-only
  `inline-flex items-center justify-center gap-2 whitespace-nowrap
   rounded-lg text-sm font-medium transition-all duration-150
   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
   focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base
   disabled:pointer-events-none disabled:opacity-40
   select-none`,
  {
    variants: {
      variant: {
        // Primary action — crimson accent
        default:
          'bg-accent text-white shadow hover:bg-accent-glow active:scale-[0.98]',
        // Secondary / outline
        outline:
          'border border-bg-overlay bg-transparent text-text-primary hover:bg-bg-elevated hover:border-accent/50',
        // Ghost — for icon buttons in toolbars
        ghost:
          'bg-transparent text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
        // Destructive action
        destructive:
          'bg-status-error text-white hover:bg-status-error/90',
        // Muted / secondary
        secondary:
          'bg-bg-elevated text-text-primary hover:bg-bg-overlay',
        // Link-style
        link:
          'text-accent underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-8 rounded-md px-3 text-xs',
        lg:      'h-10 rounded-lg px-6',
        icon:    'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (for router Links, etc.) */
  asChild?: boolean
  /** Show a spinner when true — also disables the button */
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin h-4 w-4 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <circle
                className="opacity-25"
                cx="12" cy="12" r="10"
                stroke="currentColor" strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
