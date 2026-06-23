import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error message — turns border red and shows screen-reader message */
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, id, ...props }, ref) => {
    const errorId = error && id ? `${id}-error` : undefined

    return (
      <div className="w-full">
        <input
          type={type}
          ref={ref}
          id={id}
          aria-describedby={errorId}
          aria-invalid={!!error}
          className={cn(
            // Base
            `flex h-9 w-full rounded-lg border bg-bg-elevated px-3 py-1
             text-sm text-text-primary placeholder:text-text-disabled
             transition-colors duration-150
             file:border-0 file:bg-transparent file:text-sm file:font-medium
             focus-visible:outline-none focus-visible:ring-2
             disabled:cursor-not-allowed disabled:opacity-40`,
            // Normal border / focus ring
            !error &&
              'border-bg-overlay focus-visible:ring-accent focus-visible:border-accent/50',
            // Error state
            error &&
              'border-status-error focus-visible:ring-status-error',
            className
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-xs text-status-error">
            {error}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
