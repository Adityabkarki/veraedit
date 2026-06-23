/**
 * Tests for lib/upload.ts
 *
 * Verifies chunked upload helpers, formatting utilities,
 * and abort/error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatFileSize,
  formatSpeed,
  estimateTimeRemaining,
  uploadChunks,
  CHUNK_SIZE,
} from '@/lib/upload'

// ── formatFileSize ────────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('formats exactly 1 KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formats gigabytes', () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2.00 GB')
  })

  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })
})

// ── formatSpeed ───────────────────────────────────────────────────────────────

describe('formatSpeed', () => {
  it('appends /s suffix', () => {
    expect(formatSpeed(1024)).toContain('/s')
  })

  it('shows MB/s for typical upload speeds', () => {
    expect(formatSpeed(5 * 1024 * 1024)).toBe('5.0 MB/s')
  })

  it('shows KB/s for slow connections', () => {
    expect(formatSpeed(512 * 1024)).toBe('512.0 KB/s')
  })
})

// ── estimateTimeRemaining ─────────────────────────────────────────────────────

describe('estimateTimeRemaining', () => {
  it('returns — for zero speed', () => {
    expect(estimateTimeRemaining(10_000, 0)).toBe('—')
  })

  it('returns — for negative speed', () => {
    expect(estimateTimeRemaining(10_000, -500)).toBe('—')
  })

  it('returns seconds-based estimate for small remainder', () => {
    const result = estimateTimeRemaining(5000, 1000)
    expect(result).toMatch(/~\d+s left/)
  })

  it('returns minutes-based estimate for large remainder', () => {
    const oneMb = 1024 * 1024
    const result = estimateTimeRemaining(60 * oneMb, oneMb)
    expect(result).toContain('m')
  })
})

// ── CHUNK_SIZE constant ───────────────────────────────────────────────────────

describe('CHUNK_SIZE', () => {
  it('is 5 MB', () => {
    expect(CHUNK_SIZE).toBe(5 * 1024 * 1024)
  })
})

// ── uploadChunks ──────────────────────────────────────────────────────────────

describe('uploadChunks', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a PUT request for each presigned URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['a'.repeat(100)], 'test.mp4', { type: 'video/mp4' })
    const urls = ['https://s3.example.com/chunk1', 'https://s3.example.com/chunk2']

    await uploadChunks(file, urls)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  })

  it('sends each URL to the correct endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['x'.repeat(10)], 'v.mp4', { type: 'video/mp4' })
    const urls = ['https://example.com/a', 'https://example.com/b']

    await uploadChunks(file, urls)

    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/a')
    expect(fetchMock.mock.calls[1][0]).toBe('https://example.com/b')
  })

  it('returns true when all chunks succeed', async () => {
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' })
    const result = await uploadChunks(file, ['https://example.com/chunk'])
    expect(result).toBe(true)
  })

  it('returns false when a chunk upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' })
    const result = await uploadChunks(file, ['https://example.com/chunk'])
    expect(result).toBe(false)
  })

  it('stops after the first failed chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' })
    const urls = ['https://example.com/chunk1', 'https://example.com/chunk2']

    await uploadChunks(file, urls)

    // Only the first chunk was attempted
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('calls onProgress after each successful chunk', async () => {
    const onProgress = vi.fn()
    const file = new File(['a'.repeat(100)], 'test.mp4', { type: 'video/mp4' })
    await uploadChunks(file, ['https://example.com/c1'], { onProgress })
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress.mock.calls[0][0].percentage).toBe(100)
  })

  it('onProgress reports correct chunkIndex', async () => {
    const onProgress = vi.fn()
    const file = new File(['a'.repeat(100)], 'test.mp4', { type: 'video/mp4' })
    await uploadChunks(
      file,
      ['https://example.com/c1', 'https://example.com/c2'],
      { onProgress }
    )
    expect(onProgress.mock.calls[0][0].chunkIndex).toBe(1)
    expect(onProgress.mock.calls[1][0].chunkIndex).toBe(2)
  })

  it('returns false immediately when signal is already aborted', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    controller.abort()

    const file = new File(['test'], 'test.mp4', { type: 'video/mp4' })
    const result = await uploadChunks(
      file,
      ['https://example.com/chunk'],
      { signal: controller.signal }
    )

    expect(result).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
