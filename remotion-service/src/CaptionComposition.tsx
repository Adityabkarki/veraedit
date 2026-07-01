import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface CaptionWord {
  word: string;
  start: number;
  end: number;
}

export type CaptionStyle =
  | "hormozi"
  | "mrbeast"
  | "minimal"
  | "nepali_bold"
  | "kinetic";

export interface CaptionStyleProps {
  words: CaptionWord[];
  style: CaptionStyle;
  fontFamily: string;
}

const STYLE_CONFIG = {
  hormozi: {
    fontSize: 72,
    color: "#ffffff",
    highlightColor: "#FFD600",
    stroke: "#000000",
    strokeWidth: 8,
    position: "bottom" as const,
  },
  mrbeast: {
    fontSize: 84,
    color: "#FFD600",
    highlightColor: "#FF0000",
    stroke: "#000000",
    strokeWidth: 10,
    position: "center" as const,
  },
  minimal: {
    fontSize: 52,
    color: "#ffffff",
    highlightColor: "#ffffff",
    stroke: "rgba(0,0,0,0.5)",
    strokeWidth: 3,
    position: "bottomQuarter" as const,
  },
  nepali_bold: {
    fontSize: 68,
    color: "#ffffff",
    highlightColor: "#FFD600",
    stroke: "#000000",
    strokeWidth: 8,
    position: "bottom" as const,
  },
  kinetic: {
    fontSize: 76,
    color: "#ffffff",
    highlightColor: "#FF6B00",
    stroke: "#FF6B00",
    strokeWidth: 6,
    position: "center" as const,
  },
};

export const CaptionComposition: React.FC<CaptionStyleProps> = ({
  words,
  style,
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const config = STYLE_CONFIG[style] ?? STYLE_CONFIG.hormozi;

  const activeWord = words.find(
    (w) => currentTime >= w.start && currentTime < w.end,
  );
  if (!activeWord) return null;

  const groupSize = style === "minimal" ? 5 : 3;
  const activeIndex = words.indexOf(activeWord);
  const groupStart = Math.floor(activeIndex / groupSize) * groupSize;
  const group = words.slice(groupStart, groupStart + groupSize);

  const positionStyles: Record<string, React.CSSProperties> = {
    bottom: { bottom: "15%", top: "auto" },
    center: { top: "50%", transform: "translate(-50%, -50%)" },
    bottomQuarter: { bottom: "10%", top: "auto" },
  };

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        backgroundColor: "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform:
            config.position === "center"
              ? "translate(-50%, -50%)"
              : "translateX(-50%)",
          ...positionStyles[config.position],
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0.3em",
          maxWidth: "85%",
          padding: "0 20px",
        }}
      >
        {group.map((w, i) => {
          const isActive = w === activeWord;
          const wordIndexInVideo = groupStart + i;
          const enterProgress = spring({
            frame: frame - Math.round(w.start * fps),
            fps,
            config: { damping: 12, stiffness: 200 },
          });
          const scale = isActive
            ? interpolate(enterProgress, [0, 1], [0.8, 1.08])
            : 1;
          const opacity = currentTime >= w.start ? 1 : 0.35;

          return (
            <span
              key={wordIndexInVideo}
              style={{
                fontFamily,
                fontSize: config.fontSize,
                fontWeight: 800,
                color: isActive ? config.highlightColor : config.color,
                WebkitTextStroke: `${config.strokeWidth}px ${config.stroke}`,
                paintOrder: "stroke fill",
                transform: `scale(${scale})`,
                opacity,
                display: "inline-block",
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
