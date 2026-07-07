/**
 * MulticamCompositor — each layout segment wrapped in Remotion Sequence (Phase 15).
 */
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
} from "remotion";
import type { CameraFeedRef, MulticamEntry } from "@types/multicam";

export interface MulticamCompositorProps {
  entries: MulticamEntry[];
  feeds: CameraFeedRef[];
  assetUrls: Record<string, string>;
  fps: number;
}

export const MulticamCompositor: React.FC<MulticamCompositorProps> = ({
  entries,
  feeds,
  assetUrls,
  fps,
}) => (
  <>
    {entries.map((entry) => {
      const durationInFrames = Math.max(1, entry.endFrame - entry.startFrame);
      return (
        <Sequence
          key={entry.id}
          from={entry.startFrame}
          durationInFrames={durationInFrames}
          layout="none"
        >
          <MulticamLayout
            entry={entry}
            feeds={feeds}
            assetUrls={assetUrls}
            fps={fps}
          />
        </Sequence>
      );
    })}
  </>
);

const MulticamLayout: React.FC<{
  entry: MulticamEntry;
  feeds: CameraFeedRef[];
  assetUrls: Record<string, string>;
  fps: number;
}> = ({ entry, feeds, assetUrls, fps }) => {
  const feedMap = new Map(feeds.map((f) => [f.id, f]));
  const resolveSrc = (feedId: string) => {
    const feed = feedMap.get(feedId);
    return feed?.sourceUrl || assetUrls[feedId] || "";
  };

  if (entry.layoutMode === "split_dual" && entry.activeFeedIds.length >= 2) {
    const left = resolveSrc(entry.activeFeedIds[0]!);
    const right = resolveSrc(entry.activeFeedIds[1]!);
    return (
      <AbsoluteFill style={{ display: "flex", flexDirection: "row" }}>
        <FeedPane
          src={left}
          offsetFrames={feedMap.get(entry.activeFeedIds[0]!)?.syncOffsetFrames ?? 0}
          fps={fps}
        />
        <FeedPane
          src={right}
          offsetFrames={feedMap.get(entry.activeFeedIds[1]!)?.syncOffsetFrames ?? 0}
          fps={fps}
        />
      </AbsoluteFill>
    );
  }

  if (entry.layoutMode === "grid") {
    const ids = entry.activeFeedIds.slice(0, 4);
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

  const feedId = entry.activeFeedIds[0] ?? feeds[0]?.id;
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
