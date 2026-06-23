/**
 * Tests for stores/playerStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  usePlayerStore,
  initialPlayerState,
  PLAYBACK_RATES,
} from '@/stores/playerStore'

beforeEach(() => {
  usePlayerStore.setState({ ...initialPlayerState })
})

describe('playerStore — initial state', () => {
  it('starts not playing', () => {
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })
  it('starts at time 0', () => {
    expect(usePlayerStore.getState().currentTime).toBe(0)
  })
  it('starts with volume 1', () => {
    expect(usePlayerStore.getState().volume).toBe(1)
  })
  it('starts unmuted', () => {
    expect(usePlayerStore.getState().muted).toBe(false)
  })
  it('starts at 1× speed', () => {
    expect(usePlayerStore.getState().playbackRate).toBe(1)
  })
  it('starts with no caption', () => {
    expect(usePlayerStore.getState().activeCaptionText).toBeNull()
  })
})

describe('playerStore — play / pause / togglePlay', () => {
  it('play sets isPlaying to true', () => {
    usePlayerStore.getState().play()
    expect(usePlayerStore.getState().isPlaying).toBe(true)
  })
  it('pause sets isPlaying to false', () => {
    usePlayerStore.getState().play()
    usePlayerStore.getState().pause()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })
  it('togglePlay flips isPlaying', () => {
    usePlayerStore.getState().togglePlay()
    expect(usePlayerStore.getState().isPlaying).toBe(true)
    usePlayerStore.getState().togglePlay()
    expect(usePlayerStore.getState().isPlaying).toBe(false)
  })
})

describe('playerStore — seek / setCurrentTime', () => {
  it('seek updates currentTime', () => {
    usePlayerStore.getState().seek(10)
    expect(usePlayerStore.getState().currentTime).toBe(10)
  })
  it('seek clamps to 0 for negative values', () => {
    usePlayerStore.getState().seek(-5)
    expect(usePlayerStore.getState().currentTime).toBe(0)
  })
  it('setCurrentTime updates currentTime', () => {
    usePlayerStore.getState().setCurrentTime(7.5)
    expect(usePlayerStore.getState().currentTime).toBe(7.5)
  })
})

describe('playerStore — volume / mute', () => {
  it('setVolume updates volume', () => {
    usePlayerStore.getState().setVolume(0.5)
    expect(usePlayerStore.getState().volume).toBe(0.5)
  })
  it('setVolume clamps to [0, 1]', () => {
    usePlayerStore.getState().setVolume(2)
    expect(usePlayerStore.getState().volume).toBe(1)
    usePlayerStore.getState().setVolume(-1)
    expect(usePlayerStore.getState().volume).toBe(0)
  })
  it('setVolume(0) sets muted to true', () => {
    usePlayerStore.getState().setVolume(0)
    expect(usePlayerStore.getState().muted).toBe(true)
  })
  it('toggleMute flips muted', () => {
    usePlayerStore.getState().toggleMute()
    expect(usePlayerStore.getState().muted).toBe(true)
    usePlayerStore.getState().toggleMute()
    expect(usePlayerStore.getState().muted).toBe(false)
  })
})

describe('playerStore — playback rate', () => {
  it('setPlaybackRate updates rate', () => {
    usePlayerStore.getState().setPlaybackRate(1.5)
    expect(usePlayerStore.getState().playbackRate).toBe(1.5)
  })
  it('all PLAYBACK_RATES can be set', () => {
    PLAYBACK_RATES.forEach((r) => {
      usePlayerStore.getState().setPlaybackRate(r)
      expect(usePlayerStore.getState().playbackRate).toBe(r)
    })
  })
})

describe('playerStore — captions', () => {
  it('setActiveCaptionText sets the caption', () => {
    usePlayerStore.getState().setActiveCaptionText('नमस्ते साथीहरू!')
    expect(usePlayerStore.getState().activeCaptionText).toBe('नमस्ते साथीहरू!')
  })
  it('setActiveCaptionText(null) clears caption', () => {
    usePlayerStore.getState().setActiveCaptionText('test')
    usePlayerStore.getState().setActiveCaptionText(null)
    expect(usePlayerStore.getState().activeCaptionText).toBeNull()
  })
})

describe('playerStore — duration', () => {
  it('setDuration sets duration', () => {
    usePlayerStore.getState().setDuration(120)
    expect(usePlayerStore.getState().duration).toBe(120)
  })
  it('setDuration clamps to 0', () => {
    usePlayerStore.getState().setDuration(-10)
    expect(usePlayerStore.getState().duration).toBe(0)
  })
})
