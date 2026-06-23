/**
 * ViraEdit API Client
 *
 * Thin wrapper around fetch that:
 *   1. Adds the Authorization header automatically from localStorage
 *   2. Refreshes expired access tokens once and retries (POST /auth/refresh)
 *   3. Returns { data, error } — never throws
 *   4. Translates HTTP status codes into plain-English error messages
 *
 * All error messages follow Law 4 (Errors Speak Human):
 *   "Couldn't reach the server. Make sure Docker is running."
 *   "Incorrect password. Try again or reset your password."
 *   — NOT: "Error 401: Unauthorized"
 */

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:8000'

import {
  AUTH_STORAGE_KEY,
  clearAuthPersist,
  readAuthTokens,
  writeAuthPersist,
} from '@/lib/authStorage'

/**
 * Backend versioned API prefix. The FastAPI app mounts every application
 * router under /api/v1 (auth, projects, assets, timeline, renders, …).
 * Only infra endpoints like /health live at the root.
 *
 * The `api.*` convenience methods prepend this automatically, so callers
 * use clean paths like api.post('/auth/login', …) or api.get('/projects').
 * Use apiRequest() directly for unprefixed paths (e.g. '/health').
 */
export const API_PREFIX = '/api/v1'

export interface ApiResult<T> {
  data: T | null
  error: string | null
  status: number | null
}

function readStoredAuth(): { accessToken: string | null; refreshToken: string | null } {
  return readAuthTokens()
}

function writeAccessToken(accessToken: string, refreshToken?: string | null) {
  writeAuthPersist({
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
  })

  void import('@/stores/authStore').then(({ useAuthStore }) => {
    useAuthStore.setState((s) => ({
      accessToken,
      refreshToken: refreshToken ?? s.refreshToken,
    }))
  })
}

function clearStoredAuth() {
  clearAuthPersist()
  void import('@/stores/authStore').then(({ useAuthStore, initialAuthState }) => {
    useAuthStore.setState({ ...initialAuthState })
  })
}

export type RefreshResult =
  | { ok: true }
  | { ok: false; reason: 'no_refresh_token' | 'unauthorized' | 'network' | 'invalid_response' }

let refreshInFlight: Promise<RefreshResult> | null = null

async function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async (): Promise<RefreshResult> => {
    const { refreshToken } = readStoredAuth()
    if (!refreshToken) {
      return { ok: false, reason: 'no_refresh_token' }
    }

    try {
      const response = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (response.status === 401 || response.status === 403) {
        return { ok: false, reason: 'unauthorized' }
      }

      if (!response.ok) {
        return { ok: false, reason: 'network' }
      }

      const body = (await response.json()) as {
        access_token?: string
        refresh_token?: string
      }
      if (!body.access_token) {
        return { ok: false, reason: 'invalid_response' }
      }

      writeAccessToken(body.access_token, body.refresh_token ?? refreshToken)
      return { ok: true }
    } catch {
      return { ok: false, reason: 'network' }
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

// ── Friendly error messages ───────────────────────────────────────────────────

function friendlyError(status: number, body: Record<string, unknown>): string {
  // The ViraEdit backend returns errors as { error, message, request_id, detail }.
  // `message` is already human-readable English (Law 4), so prefer it.
  // Fall back to FastAPI's default `detail` shape, then status-based messages.
  const message = (body?.message as string) || ''
  const rawDetail = body?.detail
  if (rawDetail && typeof rawDetail === 'object' && !Array.isArray(rawDetail)) {
    const d = rawDetail as Record<string, unknown>
    if (d.requires_confirmation) {
      return JSON.stringify(d)
    }
  }

  let detail = message
  if (!detail) {
    if (typeof rawDetail === 'string') {
      detail = rawDetail
    } else if (rawDetail && typeof rawDetail === 'object' && !Array.isArray(rawDetail)) {
      const d = rawDetail as Record<string, unknown>
      if (typeof d.message === 'string') {
        detail = d.message
      }
    }
  }

  if (message) return message

  if (status === 422) {
    const details = body?.details as { errors?: { loc?: unknown[]; msg?: string }[] } | undefined
    const first = details?.errors?.[0]
    if (first?.msg) {
      const field = Array.isArray(first.loc)
        ? first.loc.filter((x) => typeof x === 'string' && x !== 'body').join(' → ')
        : ''
      return field
        ? `Timeline validation failed at ${field}: ${first.msg}`
        : `Timeline validation failed: ${first.msg}`
    }
    // Generic validation — use plain English, not raw server detail strings
    return 'Invalid request. Please check your input.'
  }

  switch (status) {
    case 400:
      return detail || 'Invalid request. Please check your input.'
    case 401: {
      const d = detail.toLowerCase()
      if (d.includes('password') || d.includes('incorrect'))
        return 'Incorrect password. Try again or reset your password.'
      if (d.includes('not found') || d.includes('no user'))
        return 'No account found with this email. Sign up instead?'
      if (d.includes('expired') || d.includes('invalid token'))
        return 'Your session expired. Please log in again.'
      return 'Authentication failed. Please log in again.'
    }
    case 403:
      return "You don't have permission to do that."
    case 404:
      return detail || 'Not found. The project may have been deleted.'
    case 409:
      return detail.includes('email')
        ? 'An account with this email already exists. Log in instead?'
        : 'A conflict occurred. Please try again.'
    case 429:
      return 'Too many attempts. Please wait a moment and try again.'
    case 500:
    case 502:
    case 503:
      return 'The server ran into a problem. Please try again in a moment.'
    default:
      return detail || 'Something went wrong. Please try again.'
  }
}

// ── Core request function ─────────────────────────────────────────────────────

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<ApiResult<T>> {
  const { accessToken, refreshToken: storedRefresh } = readStoredAuth()
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData

  const headers: HeadersInit = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(options.headers ?? {}),
  }

  const isAuthRoute =
    path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/refresh')

  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers })

    let body: Record<string, unknown> = {}
    try {
      body = (await response.json()) as Record<string, unknown>
    } catch {
      // Non-JSON response (e.g. 204 No Content)
    }

    if (response.status === 401 && !retried && !isAuthRoute) {
      const hadToken = Boolean(accessToken || storedRefresh)
      if (hadToken) {
        const refresh = await refreshAccessToken()
        if (refresh.ok) {
          return apiRequest<T>(path, options, true)
        }
        // Only sign out when the server rejects the refresh token — not when API is down
        if (refresh.reason === 'unauthorized') {
          clearStoredAuth()
        }
      }
    }

    if (!response.ok) {
      return {
        data: null,
        error: friendlyError(response.status, body),
        status: response.status,
      }
    }

    return { data: body as T, error: null, status: response.status }
  } catch (err) {
    // Network-level error (server down, no internet)
    const msg =
      err instanceof TypeError && err.message.toLowerCase().includes('fetch')
        ? "Couldn't reach the server. Make sure Docker is running and try again."
        : 'An unexpected error occurred. Please try again.'

    return { data: null, error: msg, status: null }
  }
}

// ── Typed convenience methods ─────────────────────────────────────────────────

/** Prepend the /api/v1 prefix unless the path is already absolute-to-root. */
function withPrefix(path: string): string {
  if (path.startsWith(API_PREFIX)) return path
  if (path.startsWith('/health')) return path
  return `${API_PREFIX}${path.startsWith('/') ? '' : '/'}${path}`
}

export const api = {
  get: <T>(path: string) =>
    apiRequest<T>(withPrefix(path), { method: 'GET' }),

  post: <T>(path: string, body: unknown) =>
    apiRequest<T>(withPrefix(path), {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  postForm: <T>(path: string, formData: FormData) =>
    apiRequest<T>(withPrefix(path), {
      method: 'POST',
      body: formData,
      headers: {},
    }),

  put: <T>(path: string, body: unknown) =>
    apiRequest<T>(withPrefix(path), {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(withPrefix(path), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string) =>
    apiRequest<T>(withPrefix(path), { method: 'DELETE' }),
}
