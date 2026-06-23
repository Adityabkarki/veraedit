import { describe, it, expect, beforeEach } from 'vitest'
import {
  insertImageAt,
  attachUrlToImageClip,
  openImageEditor,
  closeImageEditor,
} from '@/lib/imageMedia'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'

beforeEach(() => {
  useTimelineStore.getState().resetTimeline()
  useUIStore.setState({ rightPanelMode: 'ai', aiPanelOpen: false })
})

describe('imageMedia', () => {
  it('inserts on image overlays track (not B-Roll)', () => {
    insertImageAt('image_photo', 'Photo', 2)
    const clip = useTimelineStore.getState().clips.find((c) => c.trackId.startsWith('images'))
    expect(clip?.effects?.overlayMode).toBe('corner')
    expect(clip?.effects?.mediaKind).toBe('image')
    expect(clip?.trackId).not.toBe('broll')
  })

  it('opens image editor panel (not B-Roll)', () => {
    insertImageAt('image_sticker', 'Sticker', 1)
    const id = useTimelineStore.getState().selectedClipIds[0]
    openImageEditor(id)
    expect(useUIStore.getState().rightPanelMode).toBe('image')
  })

  it('closeImageEditor dismisses panel and clears selection', () => {
    insertImageAt('image_photo', 'Photo', 0)
    openImageEditor(useTimelineStore.getState().selectedClipIds[0])
    closeImageEditor()
    expect(useUIStore.getState().rightPanelMode).toBe('ai')
    expect(useTimelineStore.getState().selectedClipIds).toEqual([])
  })

  it('accepts image URLs without blocking on extension', () => {
    insertImageAt('image_photo', 'Photo', 0)
    const id = useTimelineStore.getState().clips[0]?.id
    const ok = attachUrlToImageClip(id, 'https://cdn.example.com/assets/photo')
    expect(ok).toBe(true)
    expect(useTimelineStore.getState().clips[0]?.effects?.mediaUrl).toContain('cdn.example.com')
  })

  it('rejects video URLs for image overlays', () => {
    insertImageAt('image_photo', 'Photo', 0)
    const id = useTimelineStore.getState().clips[0]?.id
    expect(attachUrlToImageClip(id, 'https://example.com/clip.mp4')).toBe(false)
  })
})
