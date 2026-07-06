/**
 * Mixes dialogue, music bed, and SFX with deterministic ducking envelopes.
 */
import React from "react";
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from "remotion";
import type { DirectorTimeline } from "@types/timeline";
import { duckingVolumeAtFrame } from "@lib/audio/resolveDucking";

export interface DirectorAudioMixerProps {
  timeline: DirectorTimeline;
  assetUrls: Record<string, string>;
  sfxUrls?: Record<string, string>;
  dialogueSrc?: string;
}

export const DirectorAudioMixer: React.FC<DirectorAudioMixerProps> = ({
  timeline,
  assetUrls,
  sfxUrls = {},
  dialogueSrc,
}) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {dialogueSrc ? (
        <Audio src={dialogueSrc} volume={1} />
      ) : null}

      {timeline.tracks.audio.map((clip) => {
        const src = assetUrls[clip.assetId];
        if (!src) return null;

        return (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationInFrames}
            layout="none"
          >
            <Audio
              src={src}
              startFrom={Math.round(clip.sourceStartSeconds * fps)}
              volume={(localFrame) =>
                clip.duckingWindows?.length
                  ? duckingVolumeAtFrame(
                      clip.startFrame + localFrame,
                      clip.volume,
                      clip.duckingWindows,
                    )
                  : clip.volume
              }
            />
          </Sequence>
        );
      })}

      {timeline.tracks.sfx.map((sfx) => {
        const src = sfxUrls[sfx.soundId] ?? assetUrls[sfx.soundId];
        if (!src) return null;
        return (
          <Sequence key={sfx.id} from={sfx.startFrame} durationInFrames={Math.round(0.5 * fps)} layout="none">
            <Audio src={src} volume={sfx.volume} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
