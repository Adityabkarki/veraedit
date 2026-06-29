import { describe, it, expect, beforeEach } from 'vitest'
import {
  clipToImageLayer,
  updateImageTransform,
  updateImageAppearance,
} from '@/lib/imageLayer'
import { useTimelineStore } from '@/stores/timelineStore'
import { defaultImageLayer } from '@/types/editor'

beforeEach(() => {
  useTimelineStore.getState().resetTimeline()
})

describe('clipToImageLayer', () => {
  it('maps timeline clip effects to ImageLayer fields', () => {
    const defaults = defaultImageLayer()
    useTimelineStore.setState({
      clips: [
        {
          id: 'img-1',
          trackId: 'images',
          startTime: 2,
          duration: 4,
          label: 'Logo',
          type: 'overlay',
          effects: {
            visualType: 'image_slot',
            mediaUrl: 'https://example.com/logo.png',
            xPct: 30,
            yPct: 40,
            widthPct: 25,
            heightPct: 20,
            rotation: 15,
            scale: 1.2,
            imageOpacity: 80,
            brightness: 110,
          },
        },
      ],
      selectedClipIds: ['img-1'],
    })

    const layer = clipToImageLayer(useTimelineStore.getState().clips[0])
    expect(layer.name).toBe('Logo')
    expect(layer.src).toBe('https://example.com/logo.png')
    expect(layer.transform.x).toBe(30)
    expect(layer.transform.scale).toBe(120)
    expect(layer.timing.startTime).toBe(2)
    expect(layer.timing.endTime).toBe(6)
    expect(layer.appearance.opacity).toBe(80)
    expect(layer.appearance.brightness).toBe(110)
    expect(layer.type).toBe('image')
    expect(defaults.type).toBe('image')
  })
})

describe('image layer updates', () => {
  it('writes transform patches back to clip effects', () => {
    useTimelineStore.setState({
      clips: [
        {
          id: 'img-2',
          trackId: 'images',
          startTime: 0,
          duration: 3,
          label: 'Sticker',
          type: 'overlay',
          effects: { visualType: 'image_sticker', mediaKind: 'image' },
        },
      ],
    })

    updateImageTransform('img-2', { x: 55, width: 30, scale: 150 })
    const clip = useTimelineStore.getState().clips[0]
    expect(clip.effects?.xPct).toBe(55)
    expect(clip.effects?.widthPct).toBe(30)
    expect(clip.effects?.scale).toBe(1.5)
  })

  it('writes appearance patches back to clip effects', () => {
    useTimelineStore.setState({
      clips: [
        {
          id: 'img-3',
          trackId: 'images',
          startTime: 0,
          duration: 3,
          label: 'Photo',
          type: 'overlay',
          effects: { visualType: 'image_slot', mediaKind: 'image' },
        },
      ],
    })

    updateImageAppearance('img-3', { opacity: 50, blur: 4 })
    const clip = useTimelineStore.getState().clips[0]
    expect(clip.effects?.imageOpacity).toBe(50)
    expect(clip.effects?.blurPx).toBe(4)
  })
})
