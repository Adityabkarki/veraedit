import { describe, it, expect, beforeEach } from 'vitest'
import {
  cameraZoomDuration,
  cameraZoomLabel,
  isCameraZoomClip,
  migrateCameraZoomClips,
} from '@/lib/cameraZoom'
import type { Clip } from '@/stores/timelineStore'
import { INITIAL_TRACKS, useTimelineStore } from '@/stores/timelineStore'
import { insertStyleToolAt } from '@/lib/styleToolboxSync'
import { resolveZoomScaleAt } from '@/lib/effectKeyframes'

describe('cameraZoom', () => {
  beforeEach(() => {
    useTimelineStore.getState().resetTimeline()
  })

  it('detects camera zoom clips by track and tool id', () => {
    const clip: Clip = {
      id: 'z1',
      trackId: 'camera',
      startTime: 0,
      duration: 2,
      label: 'Zoom',
      type: 'effect',
      effects: { styleToolId: 'digital_zoom_punch', effectType: 'transform' },
    }
    expect(isCameraZoomClip(clip)).toBe(true)
  })

  it('spans ken burns to end of parent video clip', () => {
    const parent: Clip = {
      id: 'v1',
      trackId: 'video',
      startTime: 0,
      duration: 6,
      label: 'Clip',
      type: 'video',
    }
    const dur = cameraZoomDuration('ken_burns', 4, 2, parent)
    expect(dur).toBe(4)
  })

  it('migrates legacy zoom clips from effects to camera track', () => {
    const tracks = INITIAL_TRACKS.filter((t) => t.id !== 'camera')
    const clips: Clip[] = [
      {
        id: 'fx1',
        trackId: 'effects',
        startTime: 1,
        duration: 1,
        label: 'Zoom',
        type: 'effect',
        effects: { effectPresetId: 'digital_zoom_punch', keyframes: [{ offset: 0, value: 1 }] },
      },
    ]
    const { tracks: nextTracks, clips: nextClips } = migrateCameraZoomClips(tracks, clips)
    expect(nextTracks.some((t) => t.id === 'camera')).toBe(true)
    expect(nextClips[0].trackId).toBe('camera')
  })

  it('preview scale increases when playhead is inside camera clip', () => {
    useTimelineStore.setState({ playheadTime: 1 })
    insertStyleToolAt('digital_zoom_punch', 'Zoom punch', 1)
    const { clips } = useTimelineStore.getState()
    const video = clips.find((c) => c.trackId === 'video')
    const scale = resolveZoomScaleAt(clips, 1.4, video)
    expect(scale).toBeGreaterThan(1)
  })

  it('labels zoom tools with readable names', () => {
    const clip: Clip = {
      id: 'z1',
      trackId: 'camera',
      startTime: 0,
      duration: 1,
      label: 'x',
      type: 'effect',
      effects: { styleToolId: 'zoom_step_115' },
    }
    expect(cameraZoomLabel(clip)).toBe('Zoom +15%')
  })
})
