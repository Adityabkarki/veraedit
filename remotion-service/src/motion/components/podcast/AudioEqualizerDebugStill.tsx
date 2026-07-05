/**
 * Debug still — bucketed/smoothed bar heights vs raw waveform envelope.
 * Use: remotion still AudioEqualizerDebugStill --frame=90
 */

import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { MediaUtilsAudioData } from "@remotion/media-utils";
import { DEFAULT_THEME } from "@types/theme-tokens";
import { ThemeProvider } from "@components/theme/ThemeProvider";
import { buildClientAudioAnalysis } from "@lib/audio/analyzeClient";
import { visualizeAudio } from "@remotion/media-utils";
import { bucketRawBins, smoothedVisualizeAudio } from "@lib/audio/bucketBands";

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
    resultId: "debug",
    isRemote: false,
  };
}

const AUDIO = makeSpeechLikeAudio(10);

export const AudioEqualizerDebugStill: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const track = useMemo(
    () =>
      buildClientAudioAnalysis(AUDIO, {
        sourceHash: "debug",
        fps,
        bandCount: 16,
        durationSeconds: 10,
      }),
    [fps],
  );

  const rawBins = visualizeAudio({
    audioData: AUDIO,
    frame,
    fps,
    numberOfSamples: 256,
    smoothing: false,
  });
  const smoothed = smoothedVisualizeAudio(AUDIO, frame, fps, 256, 2);
  const naiveBands = bucketRawBins(rawBins, 16);
  const analysisFrame = track.frames[frame] ?? track.frames[0];

  const barStyle = (h: number, color: string): React.CSSProperties => ({
    width: 12,
    height: Math.max(4, h * 120),
    background: color,
    borderRadius: 4,
    alignSelf: "flex-end",
  });

  return (
    <ThemeProvider theme={DEFAULT_THEME}>
      <AbsoluteFill
        style={{
          backgroundColor: DEFAULT_THEME.colors.background,
          color: DEFAULT_THEME.colors.onSurface,
          fontFamily: DEFAULT_THEME.typography.bodyFont,
          padding: 40,
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700 }}>Audio Analysis Debug — frame {frame}</div>
        <div style={{ display: "flex", gap: 40, flex: 1 }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 8, opacity: 0.7 }}>Raw FFT (no smoothing)</div>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 140 }}>
              {naiveBands.map((v, i) => (
                <div key={i} style={barStyle(v, "#64748B")} />
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 8, opacity: 0.7 }}>Smoothed + log-bucketed + curve</div>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 140 }}>
              {analysisFrame.bands.map((v, i) => (
                <div key={i} style={barStyle(v, DEFAULT_THEME.colors.accent)} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 14, opacity: 0.6 }}>
          smoothed peak bin avg: {(smoothed.reduce((a, b) => a + b, 0) / smoothed.length).toFixed(3)}
          {" · "}
          isTransient: {analysisFrame.isTransient ? "yes" : "no"}
        </div>
      </AbsoluteFill>
    </ThemeProvider>
  );
};
