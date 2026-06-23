'use client'

/**
 * In dev, a cleared `.next` cache or hot reload can leave the browser requesting
 * stale chunk URLs. Reload once when a chunk fails to load.
 */
import { useEffect } from 'react'

const RELOAD_KEY = 'viraedit-chunk-reload'

function isChunkLoadFailure(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : String(reason ?? '')
  return /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(msg)
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const reloadOnce = (reason: unknown) => {
      if (!isChunkLoadFailure(reason)) return
      if (sessionStorage.getItem(RELOAD_KEY)) return
      sessionStorage.setItem(RELOAD_KEY, '1')
      window.location.reload()
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      reloadOnce(event.reason)
    }

    const onError = (event: ErrorEvent) => {
      reloadOnce(event.message)
    }

    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('error', onError)
    return () => {
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('error', onError)
    }
  }, [])

  return null
}
