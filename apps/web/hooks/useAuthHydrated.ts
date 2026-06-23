'use client'

import { useEffect, useState } from 'react'
import { syncAuthStoreFromPersist } from '@/lib/authStorage'
import { useAuthStore } from '@/stores/authStore'

/**
 * True after Zustand has rehydrated auth from localStorage.
 * Prevents protected routes from redirecting to /login before tokens load.
 */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const finish = () => {
      syncAuthStoreFromPersist()
      setHydrated(true)
    }

    const store = useAuthStore
    if (store.persist.hasHydrated()) {
      finish()
      return
    }
    return store.persist.onFinishHydration(finish)
  }, [])

  return hydrated
}
