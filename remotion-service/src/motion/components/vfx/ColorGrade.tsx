/**
 * Full-frame SVG color grade — Precise Grading Law (feColorMatrix, not CSS shorthand).
 */
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { GradeToken } from "@lib/look/gradePresets";
import {
  buildColorMatrix,
  buildWarmthMatrix,
  grainOpacity,
  vignetteOpacity,
} from "@lib/look/gradeMatrix";
import { buildNoiseTile, noiseFrameIndex } from "@lib/look/seededNoise";

export interface ColorGradeProps {
  grade: GradeToken;
  seed?: string;
  children: React.ReactNode;
}

export const ColorGrade: React.FC<ColorGradeProps> = ({
  grade,
  seed = "grade",
  children,
}) => {
  const frame = useCurrentFrame();
  const colorMatrix = buildColorMatrix(grade);
  const warmthMatrix = buildWarmthMatrix(grade.warmth);
  const vignette = vignetteOpacity(grade.vignetteIntensity);
  const grainAlpha = grainOpacity(grade.grainIntensity, frame, 8);
  const noiseIdx = noiseFrameIndex(frame);

  const noiseTile = useMemo(
    () => buildNoiseTile(`${seed}-grain`, 64, 64),
    [seed],
  );

  return (
    <AbsoluteFill>
      <AbsoluteFill>
        <svg width="0" height="0" aria-hidden>
          <filter id="vira-grade">
            <feColorMatrix type="matrix" values={colorMatrix} />
            <feColorMatrix type="matrix" values={warmthMatrix} />
          </filter>
        </svg>
        <AbsoluteFill style={{ filter: "url(#vira-grade)" }}>{children}</AbsoluteFill>
      </AbsoluteFill>

      {vignette > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignette}) 100%)`,
            mixBlendMode: "multiply",
            pointerEvents: "none",
          }}
        />
      )}

      {grainAlpha > 0 && (
        <AbsoluteFill
          style={{
            opacity: grainAlpha,
            mixBlendMode: grade.blendMode,
            pointerEvents: "none",
            backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
              noiseSvg(noiseTile[noiseIdx % noiseTile.length] ?? noiseTile[0]!),
            )}")`,
            backgroundSize: "128px 128px",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

function noiseSvg(row: number[]): string {
  const cells = row
    .map((v, i) => {
      const g = Math.round(v * 255);
      return `<rect x="${i}" y="0" width="1" height="1" fill="rgb(${g},${g},${g})"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${row.length}" height="1">${cells}</svg>`;
}
