import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveImageInput } from '@/lib/backgroundRemoval'

const removeBackgroundMock = vi.fn()

vi.mock('@imgly/background-removal', () => ({
  removeBackground: (...args: unknown[]) => removeBackgroundMock(...args),
  preload: vi.fn(),
}))

describe('resolveImageInput', () => {
  it('returns blob URLs unchanged', async () => {
    const url = 'blob:http://localhost/abc'
    await expect(resolveImageInput(url)).resolves.toBe(url)
  })

  it('fetches remote http images into a blob', async () => {
    const blob = new Blob(['fake'], { type: 'image/jpeg' })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) }),
    )

    const result = await resolveImageInput('https://example.com/photo.jpg')
    expect(result).toBe(blob)
  })

  it('throws a readable error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await expect(resolveImageInput('https://example.com/missing.jpg')).rejects.toThrow(
      'Could not load the image',
    )
  })
})

describe('removeImageBackground', () => {
  beforeEach(() => {
    removeBackgroundMock.mockReset()
    removeBackgroundMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  })

  it('calls imgly removeBackground with PNG output config', async () => {
    const { removeImageBackground } = await import('@/lib/backgroundRemoval')
    const blob = await removeImageBackground('blob:http://localhost/test')

    expect(removeBackgroundMock).toHaveBeenCalledTimes(1)
    expect(removeBackgroundMock.mock.calls[0][1]).toMatchObject({
      model: 'isnet_fp16',
      output: { format: 'image/png', type: 'foreground' },
    })
    expect(blob.type).toBe('image/png')
  })

  it('requires a non-empty source', async () => {
    const { removeImageBackground } = await import('@/lib/backgroundRemoval')
    await expect(removeImageBackground('')).rejects.toThrow('Add an image')
  })
})
