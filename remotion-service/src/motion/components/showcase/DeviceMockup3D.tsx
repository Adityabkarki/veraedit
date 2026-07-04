/**
 * 3D Perspective Device Mockup — three-layer composite:
 * (1) chassis, (2) overflow-hidden screen, (3) glass reflection.
 * Physics: elastic_overshoot locked per manifest (product showcase).
 */

import React from "react";
import { ATOMIC_LAYER_DEPTH } from "../layerDepth";
import { lerpClamp, lerpOvershoot } from "../interpolateClamp";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { useTheme } from "@components/theme/ThemeProvider";
import { css3dTransform } from "../../transform3d";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, clampToTitleSafe } from "../safeZones";

export interface DeviceMockup3DProps {
  startSeconds?: number;
  endSeconds?: number;
  device?: "phone" | "tablet" | "laptop";
  title?: string;
  screenSrc?: string;
  xPct?: number;
  yPct?: number;
}

const DEVICE_DIMS = {
  phone: { wPct: 22, aspect: 9 / 19.5, radius: 40, border: 12 },
  tablet: { wPct: 28, aspect: 3 / 4, radius: 28, border: 12 },
  laptop: { wPct: 42, aspect: 16 / 10, radius: 18, border: 10 },
} as const;

export const DeviceMockup3D: React.FC<DeviceMockup3DProps> = ({
  startSeconds = 0,
  endSeconds = 8,
  device = "phone",
  title = "",
  screenSrc,
  xPct = 50,
  yPct = 48,
}) => {
  const theme = useTheme();
  const brandColor = theme.colors.primary;
  const accentColor = theme.colors.onPrimary;

  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: "elastic_overshoot",
    exitCurve: "snappy_spring",
    enterDurationSeconds: 0.55,
    exitDurationSeconds: 0.3,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const pos = clampToTitleSafe(xPct, yPct, mode);
  const dims = DEVICE_DIMS[device] ?? DEVICE_DIMS.phone;
  const enterScale = lerpOvershoot(anim.enter, [0, 1], [0.7, 1]);
  const rotateY = lerpClamp(anim.enter, [0, 1], [-28, -12]);
  const rotateX = lerpClamp(anim.enter, [0, 1], [8, 2]);
  const cardTransform = css3dTransform({
    perspective: 1000,
    rotateY,
    rotateX,
    scale: enterScale * anim.exit,
  });

  const chassisBorder = withAlpha(theme.colors.secondary, 0.85);
  const chassisBg = theme.colors.surface;
  const notchBg = theme.colors.background;

  return (
    <div
      style={{
        position: "absolute",
        left: `${pos.xPct}%`,
        top: `${pos.yPct}%`,
        transform: "translate(-50%, -50%)",
        opacity: anim.opacity,
        zIndex: ATOMIC_LAYER_DEPTH.device_mockup_3d,
        width: `${dims.wPct}%`,
      }}
    >
      <div style={{ transform: cardTransform, transformStyle: "preserve-3d" }}>
        <div
          style={{
            width: "100%",
            aspectRatio: dims.aspect,
            borderRadius: dims.radius,
            border: `${dims.border}px solid ${chassisBorder}`,
            background: chassisBg,
            boxShadow: `0 30px 60px ${withAlpha(theme.colors.background, 0.55)}, inset 0 0 0 1px ${withAlpha(theme.colors.onSurface, 0.15)}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {device !== "laptop" && (
            <div
              style={{
                position: "absolute",
                top: "2.5%",
                left: "50%",
                transform: "translateX(-50%)",
                width: device === "tablet" ? "18%" : "28%",
                height: "2.2%",
                borderRadius: 8,
                background: notchBg,
                zIndex: 3,
              }}
            />
          )}

          <div
            style={{
              position: "absolute",
              inset: dims.border,
              borderRadius: Math.max(8, dims.radius - 10),
              overflow: "hidden",
              background: screenSrc
                ? theme.colors.background
                : `linear-gradient(160deg, ${brandColor}, ${withAlpha(brandColor, 0.6)} 55%, ${theme.colors.background})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {screenSrc ? (
              <img
                src={screenSrc}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={themeTypographyStyle(title || device, theme, {
                  color: accentColor,
                  fontWeight: theme.typography.weightScale.heading,
                  fontSize: "1.1em",
                  textAlign: "center",
                  padding: "0 8%",
                })}
              >
                {title || device}
              </div>
            )}
          </div>

          <div
            style={{
              position: "absolute",
              inset: dims.border,
              borderRadius: Math.max(8, dims.radius - 10),
              background: `radial-gradient(ellipse at 30% 20%, ${withAlpha(theme.colors.onSurface, 0.18)}, transparent 55%)`,
              opacity: 0.1,
              pointerEvents: "none",
              zIndex: 4,
            }}
          />
        </div>
      </div>
    </div>
  );
};
