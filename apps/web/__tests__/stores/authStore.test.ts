/**
 * Tests for stores/authStore.ts
 *
 * Verifies that the auth store correctly:
 *   - Manages user / token state against the REAL backend contract
 *     · login  → { access_token, refresh_token }, then GET /me → user
 *     · register → { user, access_token, refresh_token }
 *     · backend `username` is mapped to frontend `display_name`
 *   - Produces plain-English error messages
 *   - Returns true/false from login/register
 *   - Clears state on logout
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAuthStore, initialAuthState } from '@/stores/authStore'

// ── Mock the api module ───────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

// Import the mocked api so we can configure it in each test
import { api } from '@/lib/api'

const mockPost = api.post as ReturnType<typeof vi.fn>
const mockGet = api.get as ReturnType<typeof vi.fn>

// ── Helpers ───────────────────────────────────────────────────────────────────

// Backend returns `username`; the store maps it to `display_name`.
const backendUser = { id: 'u1', email: 'test@example.com', username: 'Test User' }
const mappedUser = { id: 'u1', email: 'test@example.com', display_name: 'Test User' }
const fakeToken = 'fake.access.token'
const fakeRefresh = 'fake.refresh.token'

/** Configure mocks for a successful login (POST /auth/login + GET /auth/me). */
function mockLoginSuccess() {
  mockPost.mockResolvedValueOnce({
    data: { access_token: fakeToken, refresh_token: fakeRefresh },
    error: null,
    status: 200,
  })
  mockGet.mockResolvedValueOnce({ data: backendUser, error: null, status: 200 })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useAuthStore.setState({ ...initialAuthState })
  vi.clearAllMocks()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authStore — initial state', () => {
  it('starts with null user', () => {
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('starts with null accessToken', () => {
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('starts with null refreshToken', () => {
    expect(useAuthStore.getState().refreshToken).toBeNull()
  })

  it('starts with isLoading=false', () => {
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('starts with null error', () => {
    expect(useAuthStore.getState().error).toBeNull()
  })
})

describe('authStore — login', () => {
  it('returns true and sets mapped user + tokens on success', async () => {
    mockLoginSuccess()

    const ok = await useAuthStore.getState().login('test@example.com', 'password')

    expect(ok).toBe(true)
    expect(useAuthStore.getState().user).toEqual(mappedUser)
    expect(useAuthStore.getState().accessToken).toBe(fakeToken)
    expect(useAuthStore.getState().refreshToken).toBe(fakeRefresh)
  })

  it('calls /auth/login then /auth/me', async () => {
    mockLoginSuccess()
    await useAuthStore.getState().login('test@example.com', 'password')
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password',
    })
    expect(mockGet).toHaveBeenCalledWith('/auth/me')
  })

  it('returns false and sets error on bad credentials', async () => {
    mockPost.mockResolvedValueOnce({
      data: null,
      error: 'Incorrect password. Please try again.',
      status: 401,
    })

    const ok = await useAuthStore.getState().login('test@example.com', 'wrong')

    expect(ok).toBe(false)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().error).toContain('password')
    // /me must not be called if login failed
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns false if /me fails after token issue', async () => {
    mockPost.mockResolvedValueOnce({
      data: { access_token: fakeToken, refresh_token: fakeRefresh },
      error: null,
      status: 200,
    })
    mockGet.mockResolvedValueOnce({ data: null, error: 'Session expired', status: 401 })

    const ok = await useAuthStore.getState().login('test@example.com', 'password')

    expect(ok).toBe(false)
    expect(useAuthStore.getState().error).toBeTruthy()
  })

  it('clears any previous error before attempting login', async () => {
    useAuthStore.setState({ error: 'old error' })
    mockLoginSuccess()

    await useAuthStore.getState().login('test@example.com', 'password')

    expect(useAuthStore.getState().error).toBeNull()
  })

  it('sets isLoading=false after successful login', async () => {
    mockLoginSuccess()
    await useAuthStore.getState().login('test@example.com', 'password')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('sets isLoading=false after failed login', async () => {
    mockPost.mockResolvedValueOnce({ data: null, error: 'Failed', status: 401 })
    await useAuthStore.getState().login('test@example.com', 'wrong')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  it('sets fallback error when api returns null error', async () => {
    mockPost.mockResolvedValueOnce({ data: null, error: null, status: 500 })
    await useAuthStore.getState().login('test@example.com', 'pass')
    expect(useAuthStore.getState().error).toBeTruthy()
    expect(useAuthStore.getState().error).not.toContain('undefined')
  })

  it('network error produces "Docker running" message', async () => {
    mockPost.mockResolvedValueOnce({
      data: null,
      error: "Couldn't reach the server. Make sure Docker is running and try again.",
      status: null,
    })
    await useAuthStore.getState().login('test@example.com', 'password')
    expect(useAuthStore.getState().error).toContain('Docker')
  })
})

describe('authStore — register', () => {
  it('returns true and sets mapped user + tokens on success', async () => {
    mockPost.mockResolvedValueOnce({
      data: { user: backendUser, access_token: fakeToken, refresh_token: fakeRefresh },
      error: null,
      status: 201,
    })

    const ok = await useAuthStore.getState().register(
      'new@example.com', 'password123', 'Test User'
    )

    expect(ok).toBe(true)
    expect(useAuthStore.getState().user).toEqual(mappedUser)
    expect(useAuthStore.getState().accessToken).toBe(fakeToken)
    expect(useAuthStore.getState().refreshToken).toBe(fakeRefresh)
  })

  it('sends username (not display_name) to the backend', async () => {
    mockPost.mockResolvedValueOnce({
      data: { user: backendUser, access_token: fakeToken, refresh_token: fakeRefresh },
      error: null,
      status: 201,
    })
    await useAuthStore.getState().register('new@example.com', 'password123', 'nepali_creator')
    expect(mockPost).toHaveBeenCalledWith('/auth/register', {
      email: 'new@example.com',
      username: 'nepali_creator',
      password: 'password123',
    })
  })

  it('returns false on duplicate email error', async () => {
    mockPost.mockResolvedValueOnce({
      data: null,
      error: 'An account with this email already exists. Log in instead?',
      status: 409,
    })

    const ok = await useAuthStore.getState().register(
      'existing@example.com', 'password123', 'user'
    )

    expect(ok).toBe(false)
    expect(useAuthStore.getState().error).toContain('email already exists')
  })

  it('sets isLoading=false after registration completes', async () => {
    mockPost.mockResolvedValueOnce({ data: null, error: 'Failed', status: 422 })
    await useAuthStore.getState().register('a@b.com', 'pass', 'name')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})

describe('authStore — logout', () => {
  it('clears user and tokens', async () => {
    useAuthStore.setState({ user: mappedUser, accessToken: fakeToken, refreshToken: fakeRefresh })
    mockPost.mockResolvedValueOnce({ data: {}, error: null, status: 200 })

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().refreshToken).toBeNull()
  })

  it('posts the refresh_token to /auth/logout', async () => {
    useAuthStore.setState({ user: mappedUser, accessToken: fakeToken, refreshToken: fakeRefresh })
    mockPost.mockResolvedValueOnce({ data: {}, error: null, status: 200 })

    await useAuthStore.getState().logout()

    expect(mockPost).toHaveBeenCalledWith('/auth/logout', { refresh_token: fakeRefresh })
  })

  it('clears state even when API call fails', async () => {
    useAuthStore.setState({ user: mappedUser, accessToken: fakeToken, refreshToken: fakeRefresh })
    mockPost.mockRejectedValueOnce(new Error('network error'))

    await expect(useAuthStore.getState().logout()).resolves.not.toThrow()
    expect(useAuthStore.getState().user).toBeNull()
  })
})

describe('authStore — clearError', () => {
  it('sets error to null', () => {
    useAuthStore.setState({ error: 'something went wrong' })
    useAuthStore.getState().clearError()
    expect(useAuthStore.getState().error).toBeNull()
  })

  it('no-ops when error is already null', () => {
    useAuthStore.setState({ error: null })
    expect(() => useAuthStore.getState().clearError()).not.toThrow()
  })
})
