import { useEffect, useMemo, useState } from "react";
import { continueRender, delayRender, useVideoConfig } from "remotion";
import { getAudioData } from "@remotion/media-utils";
import type { AudioAnalysisTrack } from "@types/audio-analysis";
import { buildClientAudioAnalysis } from "@lib/audio/analyzeClient";
import { migrateAudioAnalysis } from "@lib/audio/migrateAudioAnalysis";
import { CLIENT_ANALYSIS_MAX_SECONDS } from "@lib/audio/routing";
import type { MotionPlan, MotionPlanAudio } from "../../types";

function inlineTrack(audio?: MotionPlanAudio): AudioAnalysisTrack | null {
  if (!audio) return null;
  return (
    migrateAudioAnalysis(audio.track) ??
    migrateAudioAnalysis(audio.sidecar)
  );
}

/**
 * Composition mount loader — Path A (getAudioData) or Path B (sidecar fetch).
 * Uses delayRender/continueRender so frames never render before analysis is ready.
 */
export function useCompositionAudioAnalysis(
  plan: MotionPlan | undefined,
): AudioAnalysisTrack | null {
  const { fps } = useVideoConfig();
  const audio = plan?.audio;
  const embedded = useMemo(() => inlineTrack(audio), [audio]);

  const [fetched, setFetched] = useState<AudioAnalysisTrack | null>(null);
  const [clientTrack, setClientTrack] = useState<AudioAnalysisTrack | null>(null);

  useEffect(() => {
    if (embedded) return;
    const url = audio?.sidecarUrl;
    if (!url) return;

    const handle = delayRender("Loading audio analysis sidecar");
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`sidecar HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => setFetched(migrateAudioAnalysis(raw)))
      .catch((err) => {
        console.warn("[useCompositionAudioAnalysis] sidecar fetch failed:", err);
      })
      .finally(() => continueRender(handle));
  }, [embedded, audio?.sidecarUrl]);

  useEffect(() => {
    if (embedded || fetched) return;
    const src = audio?.src;
    const duration = audio?.durationSeconds ?? plan?.durationSeconds ?? 0;
    if (!src || duration <= 0) return;
    if (duration > CLIENT_ANALYSIS_MAX_SECONDS) return;

    const handle = delayRender("Decoding audio for reactive motion graphics");
    const bandCount = audio?.bandCount ?? 16;
    const sourceHash = audio?.sourceHash ?? "client";

    getAudioData(src)
      .then((data) =>
        buildClientAudioAnalysis(data, {
          sourceHash,
          fps: audio?.fps ?? fps,
          bandCount,
          durationSeconds: duration,
        }),
      )
      .then(setClientTrack)
      .catch((err) => {
        console.warn("[useCompositionAudioAnalysis] getAudioData failed:", err);
      })
      .finally(() => continueRender(handle));
  }, [embedded, fetched, audio, fps, plan?.durationSeconds]);

  return embedded ?? fetched ?? clientTrack;
}
