import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes — combines clsx conditional logic with
 * tailwind-merge deduplication so conflicting utilities are resolved.
 *
 * Usage: className={cn('px-4 py-2', isActive && 'bg-accent', className)}
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
