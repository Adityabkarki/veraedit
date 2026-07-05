import React, { createContext, useContext } from "react";
import type { AudioAnalysisTrack } from "@types/audio-analysis";

const AudioAnalysisContext = createContext<AudioAnalysisTrack | null>(null);

export const AudioAnalysisProvider: React.FC<{
  track: AudioAnalysisTrack | null;
  children: React.ReactNode;
}> = ({ track, children }) => (
  <AudioAnalysisContext.Provider value={track}>
    {children}
  </AudioAnalysisContext.Provider>
);

/** Shared track from composition-level Path A/B loader — element props take precedence. */
export function useSharedAudioAnalysis(): AudioAnalysisTrack | null {
  return useContext(AudioAnalysisContext);
}
