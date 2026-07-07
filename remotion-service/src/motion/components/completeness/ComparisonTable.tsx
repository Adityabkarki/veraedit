/**
 * Comparison Table — themed two/three-column table for comparison_phrase fallback.
 */

import React from "react";
import { useAtomicAnimation } from "../useAtomicAnimation";
import { useTheme } from "@components/theme/ThemeProvider";
import { themeTypographyStyle } from "@components/theme/themeTypography";
import { glassSurfaceStyle } from "@lib/theme/glassStyles";
import { withAlpha } from "@lib/theme/colorMath";
import { detectAspectMode, titleSafeRect } from "../safeZones";

export interface ComparisonTableProps {
  startSeconds?: number;
  endSeconds?: number;
  title?: string;
  labels?: string[];
  values?: (string | number)[];
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  startSeconds = 0,
  endSeconds = 5,
  title = "Comparison",
  labels = ["Option A", "Option B"],
  values = ["—", "—"],
}) => {
  const theme = useTheme();
  const anim = useAtomicAnimation({
    startSeconds,
    endSeconds,
    enterCurve: theme.motion.defaultCurve,
    exitCurve: theme.motion.defaultCurve,
    enterDurationSeconds: 0.45,
    exitDurationSeconds: 0.3,
  });
  if (!anim.active) return null;

  const mode = detectAspectMode(anim.width, anim.height);
  const safe = titleSafeRect(mode);
  const cols = labels.map((label, i) => ({
    label,
    value: String(values[i] ?? "—"),
  }));

  return (
    <div
      style={{
        position: "absolute",
        left: `${safe.left * 100 + 5}%`,
        bottom: `${safe.bottom * 100 + 12}%`,
        width: `${(1 - safe.left - safe.right) * 70}%`,
        opacity: anim.opacity,
        zIndex: 30,
        transform: `scale(${0.92 + anim.enter * 0.08})`,
        ...glassSurfaceStyle(theme),
        padding: "1.4em 1.6em",
        borderRadius: 16,
      }}
    >
      <div
        style={themeTypographyStyle(title, theme, {
          color: theme.colors.onSurface,
          fontSize: "1.1em",
          fontWeight: 700,
          marginBottom: "0.9em",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        })}
      >
        {title}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols.length}, 1fr)`,
          gap: 12,
        }}
      >
        {cols.map((col, i) => (
          <div
            key={col.label}
            style={{
              padding: "0.8em",
              borderRadius: 10,
              background: withAlpha(
                i === 0 ? theme.colors.primary : theme.colors.accent,
                0.12,
              ),
              border: `1px solid ${withAlpha(theme.colors.onSurface, 0.12)}`,
            }}
          >
            <div
              style={themeTypographyStyle(col.label, theme, {
                color: withAlpha(theme.colors.onSurface, 0.75),
                fontSize: "0.85em",
                marginBottom: "0.4em",
              })}
            >
              {col.label}
            </div>
            <div
              style={themeTypographyStyle(col.value, theme, {
                color: theme.colors.onSurface,
                fontSize: "1.35em",
                fontWeight: 700,
              })}
            >
              {col.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
