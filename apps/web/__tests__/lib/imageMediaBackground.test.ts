import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTimelineStore } from '@/stores/timelineStore'
import { removeBackgroundFromImageClip } from '@/lib/imageMedia'

const removeImageBackgroundMock = vi.fn()

vi.mock('@/lib/backgroundRemoval', () => ({
  removeImageBackground: (...args: unknown[]) => removeImageBackgroundMock(...args),
}))

beforeEach(() => {
  useTimelineStore.getState().resetTimeline()
  removeImageBackgroundMock.mockReset()
  removeImageBackgroundMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/nobg')
  URL.revokeObjectURL = vi.fn()
})

describe('removeBackgroundFromImageClip', () => {
  it('swaps clip media to a transparent PNG blob URL', async () => {
    useTimelineStore.setState({
      clips: [
        {
          id: 'img-1',
          trackId: 'images',
          startTime: 0,
          duration: 3,
          label: 'Portrait',
          type: 'overlay',
          effects: {
            visualType: 'image_slot',
            mediaUrl: 'blob:http://localhost/original',
            mediaKind: 'image',
            mediaFileName: 'portrait.jpg',
          },
        },
      ],
    })

    await removeBackgroundFromImageClip('img-1')

    const clip = useTimelineStore.getState().clips[0]
    expect(clip.effects?.mediaUrl).toBe('blob:http://localhost/nobg')
    expect(clip.effects?.backgroundRemoved).toBe(true)
    expect(clip.effects?.mediaFileName).toBe('portrait-nobg.png')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/original')
  })

  it('throws when clip has no image', async () => {
    useTimelineStore.setState({
      clips: [
        {
          id: 'img-2',
          trackId: 'images',
          startTime: 0,
          duration: 3,
          label: 'Empty',
          type: 'overlay',
          effects: { visualType: 'image_slot', mediaKind: 'image', isPlaceholder: true },
        },
      ],
    })

    await expect(removeBackgroundFromImageClip('img-2')).rejects.toThrow('Add an image')
  })
})
