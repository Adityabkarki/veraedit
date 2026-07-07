/**
 * Renders Director timeline video clips with camera motion and optional multicam switching.
 */
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
} from "remotion";
import type { DirectorTimeline } from "@types/timeline";
import type { CameraFeedRef } from "@types/multicam";
import { CameraMotionWrapper } from "../camera/CameraMotionWrapper";
import { buildKenBurnsMotion } from "@types/camera-motion";
import { MulticamCompositor } from "./MulticamCompositor";

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
