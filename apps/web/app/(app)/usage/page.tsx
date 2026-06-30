'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { ACTION_LABELS, getWorkspaceSpend, type WorkspaceSpend } from '@/lib/aiSpendApi'

export default function UsagePage() {
  const user = useAuthStore((s) => s.user)
  const [data, setData] = useState<WorkspaceSpend | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    void (async () => {
      const res = await getWorkspaceSpend(user.id, 30)
      if (cancelled) return
      if (res.error || !res.data) {
        setError(res.error ?? 'Could not load usage data.')
        return
      }
      setData(res.data)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return (
    <div className="min-h-screen bg-bg-base">
      <header className="border-b border-bg-overlay px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-xs text-accent hover:underline">
          ← Dashboard
        </Link>
        <h1 className="text-sm font-semibold text-text-primary">AI usage</h1>
      </header>

      <div className="max-w-xl mx-auto py-12 px-4" data-testid="usage-page">
        {!user && <p className="text-sm text-text-secondary">Sign in to view usage.</p>}
        {error && <p className="text-sm text-status-error">{error}</p>}
        {data && (
          <>
            <h2 className="text-xl font-semibold text-text-primary mb-1">
              Last {data.period_days} days
            </h2>
            <p className="text-3xl font-bold text-text-primary mb-6">
              ${data.total_usd.toFixed(2)}
            </p>

            {Object.keys(data.by_provider).length > 0 && (
              <section className="mb-8">
                <h3 className="text-sm font-medium text-text-secondary mb-2">By provider</h3>
                <div className="space-y-2">
                  {Object.entries(data.by_provider).map(([provider, cost]) => (
                    <div
                      key={provider}
                      className="flex justify-between border-b border-border py-2 text-sm"
                    >
                      <span className="capitalize text-text-primary">{provider}</span>
                      <span className="font-medium text-text-primary">${cost.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {Object.keys(data.by_action).length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-text-secondary mb-2">By action</h3>
                <div className="space-y-2">
                  {Object.entries(data.by_action).map(([action, cost]) => (
                    <div
                      key={action}
                      className="flex justify-between border-b border-border py-2 text-sm"
                    >
                      <span className="text-text-secondary">
                        {ACTION_LABELS[action] ?? action}
                      </span>
                      <span className="font-medium text-text-primary">${cost.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="text-xs text-text-disabled mt-6">
              {data.call_count} AI call{data.call_count === 1 ? '' : 's'} in this period
            </p>
          </>
        )}
      </div>
    </div>
  )
}
