'use client'

import { useEffect, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { DirectorRenderComposition } from '@viraedit/remotion/DirectorRenderComposition'
import type { DirectorRenderPropsResponse } from '@/lib/directorApi'
import { usePlayerStore } from '@/stores/playerStore'

interface DirectorRemotionPlayerProps {
  resolved: DirectorRenderPropsResponse
}

export default function DirectorRemotionPlayer({ resolved }: DirectorRemotionPlayerProps) {
  const playerRef = useRef<PlayerRef>(null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const { fps, durationInFrames, width, height, inputProps } = resolved

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const frame = Math.round(currentTime * fps)
    player.seekTo(Math.max(0, Math.min(durationInFrames - 1, frame)))
  }, [currentTime, fps, durationInFrames])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (isPlaying) player.play()
    else player.pause()
  }, [isPlaying])

  return (
    <Player
      ref={playerRef}
      component={DirectorRenderComposition}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={width}
      compositionHeight={height}
      style={{ width: '100%', height: '100%' }}
      controls={false}
      clickToPlay={false}
      spaceKeyToPlayOrPause={false}
      acknowledgeRemotionLicense
    />
  )
}
