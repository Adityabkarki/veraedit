'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { AISpendBadge } from '@/components/shared/AISpendBadge'
import { loadEditorProject } from '@/lib/editorData'
import { useAssetStore } from '@/stores/assetStore'

interface ProjectFlowShellProps {
  projectId: string
  title: string
  children: (ctx: { storageKey: string | null; assetId: string | null }) => React.ReactNode
}

export function ProjectFlowShell({ projectId, title, children }: ProjectFlowShellProps) {
  const asset = useAssetStore((s) => s.asset)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const result = await loadEditorProject(projectId, { reloadTimeline: false })
      if (cancelled) return
      setLoading(false)
      setError(result.error)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-overlay px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/projects/${projectId}`} className="text-xs text-accent hover:underline flex-shrink-0">
            ← Back
          </Link>
          <h1 className="text-sm font-semibold text-text-primary truncate">{title}</h1>
        </div>
        <AISpendBadge projectId={projectId} />
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : error ? (
        <p className="text-sm text-status-error px-4 py-8">{error}</p>
      ) : !asset?.storageKey ? (
        <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-3">
          <p className="text-sm text-text-secondary">Upload a video to this project first.</p>
          <Link href="/dashboard" className="text-sm text-accent hover:underline">
            Go to dashboard
          </Link>
        </div>
      ) : (
        children({ storageKey: asset.storageKey, assetId: asset.id })
      )}
    </div>
  )
}
