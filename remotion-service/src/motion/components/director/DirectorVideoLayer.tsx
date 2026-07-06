/**
 * Renders Director timeline video clips with camera motion and optional multicam switching.
 */
import React, { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { DirectorTimeline } from "@types/timeline";
import type { CameraFeedRef, MulticamEntry } from "@types/multicam";
import { CameraMotionWrapper } from "../camera/CameraMotionWrapper";
import { buildKenBurnsMotion } from "@types/camera-motion";

export interface DirectorVideoLayerProps {
  timeline: DirectorTimeline;
  assetUrls: Record<string, string>;
  primaryVideoSrc?: string;
  cameraFeeds?: CameraFeedRef[];
}

export const DirectorVideoLayer: React.FC<DirectorVideoLayerProps> = ({
  timeline,
  assetUrls,
  primaryVideoSrc,
  cameraFeeds,
}) => {
  const multicam = timeline.tracks.multicam;
  const useMulticam = multicam.length > 0 && (cameraFeeds?.length ?? 0) >= 1;

  if (useMulticam) {
    return (
      <MulticamCompositor
        entries={multicam}
        feeds={cameraFeeds ?? []}
        assetUrls={assetUrls}
        fps={timeline.fps}
      />
    );
  }

  return (
    <>
      {timeline.tracks.video.map((clip) => {
        const src = assetUrls[clip.assetId] ?? primaryVideoSrc;
        if (!src) return null;
        const motion = clip.cameraMotion ?? buildKenBurnsMotion(clip.id, 0.04);

        return (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationInFrames}
            layout="none"
          >
            <CameraMotionWrapper motion={motion} durationInFrames={clip.durationInFrames}>
              <AbsoluteFill>
                <OffthreadVideo
                  src={src}
                  startFrom={Math.round(clip.sourceStartSeconds * timeline.fps)}
                  playbackRate={clip.playbackRate ?? clip.speed ?? 1}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </AbsoluteFill>
            </CameraMotionWrapper>
          </Sequence>
        );
      })}
    </>
  );
};

const MulticamCompositor: React.FC<{
  entries: MulticamEntry[];
  feeds: CameraFeedRef[];
  assetUrls: Record<string, string>;
  fps: number;
}> = ({ entries, feeds, assetUrls, fps }) => {
  const frame = useCurrentFrame();
  const active = useMemo(
    () => entries.find((e) => frame >= e.startFrame && frame < e.endFrame) ?? entries[0],
    [entries, frame],
  );

  if (!active) return null;

  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const resolveSrc = (feedId: string) => {
    const feed = feedMap.get(feedId);
    return feed?.sourceUrl || assetUrls[feedId] || "";
  };

  if (active.layoutMode === "split_dual" && active.activeFeedIds.length >= 2) {
    const left = resolveSrc(active.activeFeedIds[0]!);
    const right = resolveSrc(active.activeFeedIds[1]!);
    return (
      <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
        <FeedPane src={left} offsetFrames={feedMap.get(active.activeFeedIds[0]!)?.syncOffsetFrames ?? 0} fps={fps} />
        <FeedPane src={right} offsetFrames={feedMap.get(active.activeFeedIds[1]!)?.syncOffsetFrames ?? 0} fps={fps} />
      </AbsoluteFill>
    );
  }

  if (active.layoutMode === "grid") {
    const ids = active.activeFeedIds.slice(0, 4);
    return (
      <AbsoluteFill
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: "0.5%",
        }}
      >
        {ids.map((id) => (
          <FeedPane
            key={id}
            src={resolveSrc(id)}
            offsetFrames={feedMap.get(id)?.syncOffsetFrames ?? 0}
            fps={fps}
          />
        ))}
      </AbsoluteFill>
    );
  }

  const feedId = active.activeFeedIds[0] ?? feeds[0]?.id;
  const src = feedId ? resolveSrc(feedId) : "";
  const offset = feedId ? feedMap.get(feedId)?.syncOffsetFrames ?? 0 : 0;
  return <FeedPane src={src} offsetFrames={offset} fps={fps} full />;
};

const FeedPane: React.FC<{
  src: string;
  offsetFrames: number;
  fps: number;
  full?: boolean;
}> = ({ src, offsetFrames, fps, full }) => {
  if (!src) {
    return (
      <AbsoluteFill
        style={{
          flex: full ? undefined : 1,
          position: full ? "absolute" : "relative",
          background: "#111",
        }}
      />
    );
  }

  return (
    <AbsoluteFill
      style={{
        flex: full ? undefined : 1,
        position: full ? "absolute" : "relative",
        overflow: "hidden",
      }}
    >
      <OffthreadVideo
        src={src}
        startFrom={Math.max(0, offsetFrames)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};
