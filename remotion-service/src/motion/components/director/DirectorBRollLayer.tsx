/**
 * B-roll track for DirectorRender — one Sequence per entry (Phase 15).
 */
import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
} from "remotion";
import type { BRollEntry } from "@types/timeline";

export interface DirectorBRollLayerProps {
  entries: BRollEntry[];
  assetUrls: Record<string, string>;
}

export const DirectorBRollLayer: React.FC<DirectorBRollLayerProps> = ({
  entries,
  assetUrls,
}) => (
  <>
    {entries.map((entry) => {
      const src = entry.assetUrl || assetUrls[entry.id] || "";
      if (!src) return null;
      const durationInFrames = Math.max(1, entry.durationInFrames);
      const isImage = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(src);

      return (
        <Sequence
          key={entry.id}
          from={entry.startFrame}
          durationInFrames={durationInFrames}
          layout="none"
        >
          <AbsoluteFill style={{ pointerEvents: "none" }}>
            {isImage ? (
              <Img
                src={src}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <OffthreadVideo
                src={src}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </AbsoluteFill>
        </Sequence>
      );
    })}
  </>
);
