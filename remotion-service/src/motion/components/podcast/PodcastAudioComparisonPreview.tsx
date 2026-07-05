/**
 * Side-by-side — mock sin-loop equalizer vs real analysis on the same synthetic clip.
 * Use: remotion still PodcastAudioComparisonPreview --frame=90
 */

import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { DEFAULT_THEME } from "@types/theme-tokens";
import { ThemeProvider } from "@components/theme/ThemeProvider";
import { buildClientAudioAnalysis } from "@lib/audio/analyzeClient";
import { SymmetricAudioStrip } from "./SymmetricAudioStrip";
import { CircularOrbitEqualizer } from "./CircularOrbitEqualizer";

function makeSpeechLikeAudio(
  durationSeconds = 10,
  sampleRate = 44100,
): MediaUtilsAudioData {
  const totalSamples = Math.floor(durationSeconds * sampleRate);
  const waveform = new Float32Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const envelope = 0.2 + 0.8 * Math.max(0, Math.sin(t * Math.PI * 1.6));
    waveform[i] = envelope * Math.sin(2 * Math.PI * 180 * t) * 0.4;
  }
  return {
    channelWaveforms: [waveform],
    sampleRate,
    durationInSeconds: durationSeconds,
    numberOfChannels: 1,
    resultId: "comparison",
    isRemote: false,
  };
}

const AUDIO = makeSpeechLikeAudio(10);

export const PodcastAudioComparisonPreview: React.FC = () => {
  const { fps } = useVideoConfig();
  const track = useMemo(
    () =>
      buildClientAudioAnalysis(AUDIO, {
        sourceHash: "comparison",
        fps,
        bandCount: 16,
        durationSeconds: 10,
      }),
    [fps],
  );

  const labelStyle: React.CSSProperties = {
    position: "absolute",
    top: "4%",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 18,
    fontWeight: 700,
    color: DEFAULT_THEME.colors.onSurface,
    opacity: 0.85,
  };

  return (
    <ThemeProvider theme={DEFAULT_THEME}>
      <AbsoluteFill style={{ backgroundColor: DEFAULT_THEME.colors.background }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: "50%", height: "100%" }}>
          <div style={labelStyle}>Mock (Graceful Degradation)</div>
          <SymmetricAudioStrip startSeconds={0} endSeconds={10} seed={4} />
          <CircularOrbitEqualizer
            startSeconds={0}
            endSeconds={10}
            xPct={50}
            yPct={40}
            sizePct={30}
            monogram="M"
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            width: 2,
            height: "100%",
            background: DEFAULT_THEME.colors.onSurface,
            opacity: 0.2,
          }}
        />
        <div style={{ position: "absolute", right: 0, top: 0, width: "50%", height: "100%" }}>
          <div style={labelStyle}>Real (audioAnalysis)</div>
          <SymmetricAudioStrip
            startSeconds={0}
            endSeconds={10}
            audioAnalysis={track}
            isMockData={false}
          />
          <CircularOrbitEqualizer
            startSeconds={0}
            endSeconds={10}
            xPct={50}
            yPct={40}
            sizePct={30}
            monogram="R"
            audioAnalysis={track}
            isMockData={false}
          />
        </div>
      </AbsoluteFill>
    </ThemeProvider>
  );
};
