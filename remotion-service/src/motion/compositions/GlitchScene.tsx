/**
 * Glitch / urban overlay — SVG composite structure inspired by remotion-scenes.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

export interface GlitchSceneProps {
  brandColor?: string;
  accentColor?: string;
  intensity?: number;
  localSeconds?: number;
}

export const GlitchScene: React.FC<GlitchSceneProps> = ({
  brandColor = "#22D3EE",
  accentColor = "#EF4444",
  intensity = 0.5,
  localSeconds,
}) => {
  const frame = useCurrentFrame();
  const local = localSeconds ?? frame / 30;
  const j = Math.sin(local * 40) * 10 * intensity;
  const j2 = Math.cos(local * 55) * 6 * intensity;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <filter id="glitch-rgb">
            <feOffset in="SourceGraphic" dx={j} dy={0} result="r" />
            <feOffset in="SourceGraphic" dx={-j2} dy={0} result="b" />
            <feBlend in="r" in2="b" mode="screen" />
          </filter>
        </defs>
        {/* Scanlines */}
        {Array.from({ length: 12 }).map((_, i) => {
          const y = ((i * 37 + local * 80) % 100);
          return (
            <rect
              key={i}
              x={0}
              y={`${y}%`}
              width="100%"
              height={1 + (i % 3)}
              fill={i % 2 === 0 ? brandColor : accentColor}
              opacity={0.15 + (i % 4) * 0.05}
              transform={`translate(${j * (i % 3)} 0)`}
            />
          );
        })}
        {/* Tear blocks */}
        {[0.2, 0.45, 0.7].map((y, i) => (
          <rect
            key={`t-${i}`}
            x={`${10 + i * 5}%`}
            y={`${y * 100}%`}
            width={`${30 + i * 10}%`}
            height={8}
            fill={i % 2 ? brandColor : accentColor}
            opacity={0.35 * intensity}
            transform={`translate(${j * (i + 1)} ${j2})`}
          />
        ))}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `${brandColor}18`,
          transform: `translateX(${j}px)`,
          filter: "url(#glitch-rgb)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `${accentColor}12`,
          transform: `translateX(${-j2}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
