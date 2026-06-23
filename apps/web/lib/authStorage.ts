/**
 * Synchronous auth token storage — shared by api.ts and authStore.
 *
 * Zustand persist writes localStorage asynchronously. Right after login,
 * API calls must read tokens immediately or they go out without Authorization,
 * get 401, fail refresh, and clear the session (logout loop).
 */

export const AUTH_STORAGE_KEY = 'viraedit-auth'

export interface PersistedAuthState {
  user?: {
    id: string
    email: string
    display_name: string
  } | null
  accessToken?: string | null
  refreshToken?: string | null
}

interface PersistedEnvelope {
  state?: PersistedAuthState
  version?: number
}

/** In-memory copy — always updated when tokens change (survives persist lag). */
let memoryTokens: {
  accessToken: string | null
  refreshToken: string | null
} = {
  accessToken: null,
  refreshToken: null,
}

export function readAuthTokens(): {
  accessToken: string | null
  refreshToken: string | null
} {
  if (typeof window === 'undefined') {
    return { accessToken: null, refreshToken: null }
  }
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as PersistedEnvelope
      const accessToken = parsed?.state?.accessToken ?? null
      const refreshToken = parsed?.state?.refreshToken ?? null
      memoryTokens = { accessToken, refreshToken }
      return { accessToken, refreshToken }
    }
  } catch {
    // fall through to memory cache
  }
  return { ...memoryTokens }
}

export function readAuthPersist(): PersistedAuthState {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as PersistedEnvelope
    return parsed?.state ?? {}
  } catch {
    return {}
  }
}

/** Write tokens (and optional user) to localStorage + memory immediately. */
export function writeAuthPersist(partial: PersistedAuthState): void {
  if (partial.accessToken !== undefined) {
    memoryTokens.accessToken = partial.accessToken
  }
  if (partial.refreshToken !== undefined) {
    memoryTokens.refreshToken = partial.refreshToken
  }

  if (typeof window === 'undefined') return
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    const parsed: PersistedEnvelope = stored
      ? (JSON.parse(stored) as PersistedEnvelope)
      : { state: {}, version: 0 }
    parsed.state = { ...parsed.state, ...partial }
    parsed.version = parsed.version ?? 0
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore quota / private mode
  }
}

export function clearAuthPersist(): void {
  memoryTokens = { accessToken: null, refreshToken: null }
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** After Zustand rehydrate, ensure store matches localStorage (fixes stale empty state). */
export function syncAuthStoreFromPersist(): void {
  if (typeof window === 'undefined') return
  const persisted = readAuthPersist()
  const { accessToken, refreshToken } = readAuthTokens()
  if (!accessToken && !refreshToken) return

  void import('@/stores/authStore').then(({ useAuthStore }) => {
    const current = useAuthStore.getState()
    if (current.accessToken && current.refreshToken) return
    useAuthStore.setState({
      accessToken: accessToken ?? current.accessToken,
      refreshToken: refreshToken ?? current.refreshToken,
      user: current.user ?? persisted.user ?? null,
    })
  })
}
