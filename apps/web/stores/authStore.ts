/**
 * Auth Store — Zustand
 *
 * Manages authentication state: user, access token, refresh token, loading, errors.
 * Persists user + tokens to localStorage so the session survives page reloads.
 *
 * Wired to the real ViraEdit backend (FastAPI, /api/v1/auth/*):
 *   register → { user, access_token, refresh_token }
 *   login    → { access_token, refresh_token }  (then GET /me for the user)
 *   logout   → POST /auth/logout { refresh_token }
 *
 * The backend uses `username`; the UI uses `display_name`, so we map at the
 * boundary (username → display_name) to avoid touching UI components.
 *
 * All error messages are plain English (the backend already returns
 * human-readable `message` strings via the API client).
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { api } from '@/lib/api'
import { clearAuthPersist, writeAuthPersist } from '@/lib/authStorage'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  display_name: string
}

/** Backend user shape (UserResponse) — mapped to AuthUser at the boundary. */
interface BackendUser {
  id: string
  email: string
  username: string
  is_active?: boolean
  is_verified?: boolean
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in?: number
}

interface RegisterResponse extends TokenResponse {
  user: BackendUser
}

function mapUser(u: BackendUser): AuthUser {
  return { id: u.id, email: u.email, display_name: u.username }
}

export interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  isLoading: boolean
  /** Plain-English error message, or null if no error */
  error: string | null

  /** Returns true on success, false on failure */
  login: (email: string, password: string) => Promise<boolean>
  /** Returns true on success, false on failure */
  register: (email: string, password: string, displayName: string) => Promise<boolean>
  logout: () => Promise<void>
  clearError: () => void
}

// ── Initial state (exported for test resets) ──────────────────────────────────

export const initialAuthState = {
  user: null as AuthUser | null,
  accessToken: null as string | null,
  refreshToken: null as string | null,
  isLoading: false,
  error: null as string | null,
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialAuthState,

      login: async (email, password) => {
        set({ isLoading: true, error: null })

        const { data, error } = await api.post<TokenResponse>('/auth/login', {
          email,
          password,
        })

        if (error || !data) {
          set({ isLoading: false, error: error ?? 'Login failed. Please try again.' })
          return false
        }

        // Backend login returns tokens only — fetch the user profile from /me.
        writeAuthPersist({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        })
        set({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        })

        const me = await api.get<BackendUser>('/auth/me')
        if (me.error || !me.data) {
          set({
            isLoading: false,
            error: me.error ?? 'Signed in, but could not load your profile.',
          })
          return false
        }

        const user = mapUser(me.data)
        writeAuthPersist({
          user,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        })
        set({
          isLoading: false,
          user,
          error: null,
        })
        return true
      },

      register: async (email, password, displayName) => {
        set({ isLoading: true, error: null })

        const { data, error } = await api.post<RegisterResponse>('/auth/register', {
          email,
          username: displayName,
          password,
        })

        if (error || !data) {
          set({
            isLoading: false,
            error: error ?? 'Registration failed. Please try again.',
          })
          return false
        }

        const user = mapUser(data.user)
        writeAuthPersist({
          user,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
        })
        set({
          isLoading: false,
          user,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          error: null,
        })
        return true
      },

      logout: async () => {
        set({ isLoading: true })
        const { refreshToken } = get()
        // Best-effort logout — clear local state even if the API call fails
        try {
          if (refreshToken) {
            await api.post('/auth/logout', { refresh_token: refreshToken })
          }
        } catch {
          // ignore
        }
        clearAuthPersist()
        set({ ...initialAuthState, isLoading: false })
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'viraedit-auth',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? localStorage : (null as never)
      ),
      // Persist identity + tokens — never loading/error state
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
)
