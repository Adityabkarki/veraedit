import type {
  AudioClipEntry,
  DirectorTimeline,
  DirectorTimelineInput,
  GraphicsDensity,
} from "@types/timeline";
import type { DirectorSignals } from "@lib/director/signalTypes";
import {
  buildDuckingWindows,
  duckingSourcesFromDialogue,
  duckingSourcesFromSfx,
} from "@lib/audio/resolveDucking";
import { proposeSfxFromTriggers, resolveSfxEntries } from "@lib/audio/resolveSfx";
import { resolveMulticamEntries } from "@lib/director/resolveMulticam";

export interface ApplyAudioMulticamOptions {
  signals: DirectorSignals;
  density?: GraphicsDensity;
  cameraFeeds?: DirectorTimelineInput["cameraFeeds"];
  musicBedAssetId?: string;
}

function dialogueSegments(signals: DirectorSignals): { start: number; end: number }[] {
  if (signals.sustainedSpeech.length) {
    return signals.sustainedSpeech.map((s) => ({ start: s.start, end: s.end }));
  }
  if (signals.words.length) {
    return [{ start: signals.words[0]!.start, end: signals.words.at(-1)!.end }];
  }
  return [{ start: 0, end: signals.durationSeconds }];
}

/** Apply SFX, ducking, and multicam to a resolved Director timeline. */
export function applyAudioMulticamToTimeline(
  timeline: DirectorTimeline,
  options: ApplyAudioMulticamOptions,
): DirectorTimeline {
  const { signals, density = "balanced", cameraFeeds, musicBedAssetId } = options;
  const fps = timeline.fps;

  const sfxProposals = proposeSfxFromTriggers(
    timeline.triggers,
    timeline.tracks.transitions,
    timeline.contentType,
    fps,
  );
  const { sfx } = resolveSfxEntries(sfxProposals, density);

  const musicTrackId = "music-bed";
  let audio: AudioClipEntry[] = [...timeline.tracks.audio];

  if (musicBedAssetId) {
    const existing = audio.find((a) => a.id === musicTrackId);
    if (!existing) {
      audio.push({
        id: musicTrackId,
        assetId: musicBedAssetId,
        startFrame: 0,
        durationInFrames: timeline.durationInFrames,
        sourceStartSeconds: 0,
        sourceEndSeconds: timeline.durationInFrames / fps,
        volume: 0.35,
        duckUnderDialogue: true,
        label: "Music bed",
      });
    }
  }

  const dialogue = dialogueSegments(signals);
  const duckSources = [
    ...duckingSourcesFromDialogue(dialogue, fps),
    ...duckingSourcesFromSfx(sfx, fps),
  ];

  audio = audio.map((track) => {
    if (!track.duckUnderDialogue && track.id !== musicTrackId) return track;
    const windows = buildDuckingWindows(track.id, duckSources);
    return { ...track, duckingWindows: windows };
  });

  const multicam = resolveMulticamEntries(
    timeline,
    signals,
    cameraFeeds,
    timeline.pacingProfile ?? "balanced",
  );

  return {
    ...timeline,
    tracks: {
      ...timeline.tracks,
      audio,
      sfx,
      multicam,
    },
  };
}
