'use client'

import { useJobPoller } from '@/hooks/useJobPoller'

interface JobProgressToastProps {
  jobId: string
  label: string
  onDone: () => void
}

export function JobProgressToast({ jobId, label, onDone }: JobProgressToastProps) {
  const { status, error } = useJobPoller(jobId, () => onDone())

  return (
    <div
      data-testid="image-ai-job-toast"
      className="fixed bottom-24 right-4 z-50 max-w-xs rounded-lg border border-bg-overlay bg-bg-surface shadow-lg px-4 py-3"
      role="status"
    >
      <p className="text-xs font-medium text-text-primary">{label}</p>
      <p className="text-[10px] text-text-secondary mt-0.5 capitalize">{status.replace(/_/g, ' ')}…</p>
      {error && <p className="text-[10px] text-status-error mt-1">{error}</p>}
    </div>
  )
}
