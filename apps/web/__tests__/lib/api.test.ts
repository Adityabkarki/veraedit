/**
 * Tests for lib/api.ts
 *
 * Verifies plain-English error translation, token injection,
 * and network-error handling.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { clearAuthPersist } from '@/lib/authStorage'
import { apiRequest, api } from '@/lib/api'

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  )
}

function mockFetchNetworkError() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
  )
}

beforeEach(() => {
  localStorage.clear()
  clearAuthPersist()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('apiRequest — success', () => {
  it('returns data on 200 response', async () => {
    mockFetch(200, { id: 'abc', name: 'Test' })
    const { data, error } = await apiRequest<{ id: string }>('/test')
    expect(data).toEqual({ id: 'abc', name: 'Test' })
    expect(error).toBeNull()
  })

  it('returns status code on success', async () => {
    mockFetch(201, { created: true })
    const { status } = await apiRequest('/test')
    expect(status).toBe(201)
  })

  it('includes Content-Type: application/json header', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await apiRequest('/test')

    const calledHeaders = fetchSpy.mock.calls[0][1].headers
    expect(calledHeaders['Content-Type']).toBe('application/json')
  })

  it('injects Authorization header when localStorage token present', async () => {
    localStorage.setItem(
      'viraedit-auth',
      JSON.stringify({ state: { accessToken: 'my.token' } })
    )
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await apiRequest('/test')

    const calledHeaders = fetchSpy.mock.calls[0][1].headers
    expect(calledHeaders['Authorization']).toBe('Bearer my.token')
  })

  it('no Authorization header when no token stored', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await apiRequest('/test')

    const calledHeaders = fetchSpy.mock.calls[0][1].headers
    expect(calledHeaders['Authorization']).toBeUndefined()
  })
})

describe('apiRequest — error translation', () => {
  it('401 wrong password → friendly message', async () => {
    mockFetch(401, { detail: 'Incorrect password' })
    const { error } = await apiRequest('/auth/login')
    expect(error).toContain('password')
    expect(error).not.toContain('401')
  })

  it('401 no account → "No account found" message', async () => {
    mockFetch(401, { detail: 'No user found' })
    const { error } = await apiRequest('/auth/login')
    expect(error).toContain('No account found')
  })

  it('401 expired token → "session expired" message', async () => {
    mockFetch(401, { detail: 'Token expired' })
    const { error } = await apiRequest('/api/projects')
    expect(error).toContain('session expired')
  })

  it('409 duplicate email → actionable message', async () => {
    mockFetch(409, { detail: 'email already exists' })
    const { error } = await apiRequest('/auth/register')
    expect(error).toContain('email already exists')
    expect(error).toContain('Log in instead')
  })

  it('422 validation error → "check your input" message', async () => {
    mockFetch(422, { detail: 'Validation failed' })
    const { error } = await apiRequest('/test')
    expect(error).toContain('check your input')
  })

  it('429 rate limit → "wait a moment" message', async () => {
    mockFetch(429, {})
    const { error } = await apiRequest('/test')
    expect(error).toContain('wait a moment')
  })

  it('500 server error → human-readable message', async () => {
    mockFetch(500, {})
    const { error } = await apiRequest('/test')
    expect(error).toContain('server')
    expect(error).not.toContain('500')
  })

  it('returns null data on error', async () => {
    mockFetch(404, { detail: 'not found' })
    const { data } = await apiRequest('/missing')
    expect(data).toBeNull()
  })

  it('400 regeneration confirmation → JSON detail for dialog', async () => {
    mockFetch(400, {
      error: 'HTTP_400',
      message: 'Chapters already exist.',
      detail: {
        message: 'Chapters already exist.',
        requires_confirmation: true,
        confirmation_phrase: 'regenerate chapters',
        estimated_cost_usd: 0.05,
      },
    })
    const { error } = await apiRequest('/analyze')
    const parsed = JSON.parse(error!)
    expect(parsed.requires_confirmation).toBe(true)
    expect(parsed.confirmation_phrase).toBe('regenerate chapters')
  })
})

describe('apiRequest — network errors', () => {
  it('fetch TypeError → Docker running hint', async () => {
    mockFetchNetworkError()
    const { error, status } = await apiRequest('/test')
    expect(error).toContain('Docker')
    expect(status).toBeNull()
  })

  it('network error returns null data', async () => {
    mockFetchNetworkError()
    const { data } = await apiRequest('/test')
    expect(data).toBeNull()
  })
})

describe('api convenience methods', () => {
  it('api.post sends method=POST with JSON body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await api.post('/test', { name: 'hello' })

    expect(fetchSpy.mock.calls[0][1].method).toBe('POST')
    expect(fetchSpy.mock.calls[0][1].body).toBe('{"name":"hello"}')
  })

  it('api.get sends method=GET', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({}),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await api.get('/test')

    expect(fetchSpy.mock.calls[0][1].method).toBe('GET')
  })
})
