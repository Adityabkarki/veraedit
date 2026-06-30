'use client'

import Link from 'next/link'
import { AISpendBadge } from '@/components/shared/AISpendBadge'

interface CloneStyleShellProps {
  projectId: string
  children: React.ReactNode
}

export function CloneStyleShell({ projectId, children }: CloneStyleShellProps) {
  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-overlay px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/projects/${projectId}`}
            className="text-xs text-accent hover:underline flex-shrink-0"
          >
            ← Back
          </Link>
          <h1 className="text-sm font-semibold text-text-primary truncate">Clone a style</h1>
        </div>
        <AISpendBadge projectId={projectId} />
      </header>
      {children}
    </div>
  )
}
