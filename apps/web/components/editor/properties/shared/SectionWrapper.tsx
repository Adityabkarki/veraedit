'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionWrapperProps {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

export function SectionWrapper({
  title,
  icon,
  defaultOpen = true,
  children,
}: SectionWrapperProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-bg-overlay last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-bg-overlay/40 transition-colors"
      >
        <span className="text-text-secondary w-4 h-4 flex-shrink-0">{icon}</span>
        <span className="flex-1 text-xs font-medium text-text-primary">{title}</span>
        <ChevronRight
          className={cn(
            'w-3 h-3 text-text-disabled transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}
