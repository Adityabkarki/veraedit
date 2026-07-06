import type { DirectorTimeline, PacingProfileName } from "@types/timeline";
import type { CameraFeedRef, MulticamEntry } from "@types/multicam";
import type { DirectorSignals } from "@lib/director/signalTypes";
import { getPacingProfile } from "@lib/pacing/pacingProfile";

function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

/** Graceful degradation — no-op when fewer than 2 feeds. */
export function resolveMulticamEntries(
  timeline: DirectorTimeline,
  signals: DirectorSignals,
  cameraFeeds: CameraFeedRef[] | undefined,
  pacing: PacingProfileName = "balanced",
): MulticamEntry[] {
  if (!cameraFeeds || cameraFeeds.length < 2) return [];

  const fps = timeline.fps;
  const minHold = getPacingProfile(pacing).minClipDurationFrames;
  const feedBySpeaker = new Map<string, string>();
  for (const feed of cameraFeeds) {
    if (feed.speakerId) feedBySpeaker.set(feed.speakerId, feed.id);
  }

  const entries: MulticamEntry[] = [];
  let lastSwitchFrame = -minHold;
  let prevSpeaker: string | null = null;

  const changes = [...signals.speakerChanges].sort((a, b) => a.start - b.start);

  for (const change of changes) {
    const startFrame = secondsToFrames(change.start, fps);
    const endFrame = secondsToFrames(change.end, fps);
    if (startFrame - lastSwitchFrame < minHold) continue;

    const feedId = feedBySpeaker.get(change.speakerId) ?? cameraFeeds[0]!.id;
    const layoutMode =
      prevSpeaker && prevSpeaker !== change.speakerId && cameraFeeds.length >= 2
        ? ("split_dual" as const)
        : ("single" as const);

    const activeFeedIds =
      layoutMode === "split_dual"
        ? cameraFeeds.slice(0, 2).map((f) => f.id)
        : [feedId];

    entries.push({
      id: `multicam-${change.speakerId}-${startFrame}`,
      startFrame,
      endFrame,
      layoutMode,
      activeFeedIds,
      triggerId: `speaker-${Math.round(change.start * 1000)}`,
    });

    lastSwitchFrame = startFrame;
    prevSpeaker = change.speakerId;
  }

  if (!entries.length && cameraFeeds.length >= 1) {
    entries.push({
      id: "multicam-default",
      startFrame: 0,
      endFrame: timeline.durationInFrames,
      layoutMode: "single",
      activeFeedIds: [cameraFeeds[0]!.id],
      triggerId: "episode_start",
    });
  }

  return entries;
}
