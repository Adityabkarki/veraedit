/**
 * Standalone infographic composition (lifeprompt-team/remotion-scenes pattern).
 * Accepts JSON data array; self-draws via strokeDashoffset + useCurrentFrame.
 */
import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SPRING_CORPORATE } from "../motionBlueprints";
import { FONT_CORPORATE } from "../fonts";

export interface LineChartDataPoint {
  label: string;
  value: number;
}

export interface LineChartSceneProps {
  data: LineChartDataPoint[];
  title?: string;
  brandColor?: string;
  accentColor?: string;
  /** Local seconds since scene start */
  localSeconds?: number;
}

export const LineChartScene: React.FC<LineChartSceneProps> = ({
  data,
  title = "",
  brandColor = "#64748B",
  accentColor = "#10B981",
  localSeconds,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = localSeconds ?? frame / fps;
  const points = data.length ? data : [
    { label: "Q1", value: 20 },
    { label: "Q2", value: 45 },
    { label: "Q3", value: 38 },
    { label: "Q4", value: 72 },
  ];
  const n = points.length;
  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const w = 440;
  const h = 200;
  const pad = 28;
  const draw = spring({
    frame: Math.round(local * fps),
    fps,
    config: SPRING_CORPORATE,
  });

  const coords = points.map((p, i) => ({
    x: pad + (i / Math.max(1, n - 1)) * (w - pad * 2),
    y: h - pad - (p.value / maxVal) * (h - pad * 2),
    ...p,
  }));

  let pathLen = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i].x - coords[i - 1].x;
    const dy = coords[i].y - coords[i - 1].y;
    pathLen += Math.sqrt(dx * dx + dy * dy);
  }
  pathLen = Math.max(pathLen, 100);
  const pathD = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const dashOffset = pathLen * (1 - Math.min(draw, 1));

  return (
    <div style={{ width: w, fontFamily: FONT_CORPORATE }}>
      {title && (
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#E2E8F0",
            marginBottom: 10,
            letterSpacing: 1,
            textTransform: "uppercase",
            lineHeight: 1.55,
            paddingBottom: "0.2em",
          }}
        >
          {title}
        </div>
      )}
      <svg width={w} height={h + 28} viewBox={`0 0 ${w} ${h + 28}`}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={pad}
            x2={w - pad}
            y1={pad + (1 - g) * (h - pad * 2)}
            y2={pad + (1 - g) * (h - pad * 2)}
            stroke="rgba(71,85,105,0.3)"
            strokeWidth={1}
          />
        ))}
        <path
          d={pathD}
          fill="none"
          stroke={brandColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={pathLen}
          strokeDashoffset={dashOffset}
        />
        {coords.map((p, i) => {
          const nodeIn = spring({
            frame: Math.max(0, Math.round((local - i * 0.14) * fps)),
            fps,
            config: SPRING_CORPORATE,
          });
          return (
            <g key={i} opacity={nodeIn}>
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                fill="#0F172A"
                stroke={i === n - 1 ? accentColor : brandColor}
                strokeWidth={2}
              />
              <text
                x={p.x}
                y={p.y - 12}
                textAnchor="middle"
                fill="#F1F5F9"
                fontSize={12}
                fontWeight={600}
              >
                {p.value}
              </text>
              <text
                x={p.x}
                y={h + 18}
                textAnchor="middle"
                fill="rgba(148,163,184,0.9)"
                fontSize={12}
                fontWeight={600}
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
