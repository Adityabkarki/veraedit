'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

/**
 * React Query provider — creates a QueryClient per browser session.
 * DevTools are rendered only in development.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: 30 seconds — avoid refetching too aggressively
            staleTime: 30_000,
            // Show cached data immediately while revalidating
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Don't retry auth errors
              if (error instanceof Error && error.message.includes('401')) return false
              return failureCount < 2
            },
          },
          mutations: {
            // Don't retry mutations by default — they're not idempotent
            retry: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
