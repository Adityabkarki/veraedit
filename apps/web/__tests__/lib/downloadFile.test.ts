/**
 * Tests for lib/downloadFile.ts
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { downloadRemoteFile } from '@/lib/downloadFile'

describe('downloadRemoteFile', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns ok when fetch succeeds', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' })
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      blob: async () => blob,
    } as Response)

    const click = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      click,
      href: '',
      download: '',
      rel: '',
    } as unknown as HTMLAnchorElement)
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body)
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.body)

    const result = await downloadRemoteFile('http://example.com/video.mp4', 'test.mp4')
    expect(result.ok).toBe(true)
    expect(click).toHaveBeenCalled()
  })

  it('falls back to window.open when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('CORS'))
    const open = vi.fn()
    vi.stubGlobal('open', open)

    const result = await downloadRemoteFile('http://example.com/video.mp4', 'test.mp4')
    expect(result.ok).toBe(true)
    expect(open).toHaveBeenCalledWith('http://example.com/video.mp4', '_blank', 'noopener,noreferrer')
  })
})
