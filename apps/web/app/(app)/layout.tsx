'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { readAuthTokens } from '@/lib/authStorage'
import { useAuthStore } from '@/stores/authStore'
import { useAuthHydrated } from '@/hooks/useAuthHydrated'

/**
 * App layout — wraps all protected routes.
 * Redirects to /login if the user is not authenticated.
 *
 * Waits for Zustand persist hydration before checking auth — otherwise every
 * reload briefly looks logged-out and redirects to /login.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, accessToken } = useAuthStore()
  const hydrated = useAuthHydrated()
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isAuthenticated = Boolean(
    accessToken || user || (hydrated && readAuthTokens().accessToken),
  )

  useEffect(() => {
    if (!hydrated) return

    if (isAuthenticated) {
      if (redirectTimer.current) {
        clearTimeout(redirectTimer.current)
        redirectTimer.current = null
      }
      return
    }

    // Brief delay avoids redirect during login token handoff
    redirectTimer.current = setTimeout(() => {
      const tokens = readAuthTokens()
      if (!tokens.accessToken && !useAuthStore.getState().accessToken) {
        router.replace('/login')
      }
    }, 400)

    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [hydrated, isAuthenticated, router])

  if (!hydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      {children}
    </div>
  )
}
