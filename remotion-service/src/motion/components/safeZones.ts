/**
 * Title-Safe / Action-Safe Zone Law — skills.md.
 *
 * 9:16 (Social): bottom 15% and right 10% reserved for platform UI.
 * 16:9 (Podcast/Consultancy/Showcase): 5% action-safe / 10% title-safe.
 */

import type { CSSProperties } from "react";

export type AspectMode = "social_9_16" | "broadcast_16_9";

export interface SafeRect {
  /** Inset from left as fraction of width (0–1). */
  left: number;
  /** Inset from right as fraction of width (0–1). */
  right: number;
  /** Inset from top as fraction of height (0–1). */
  top: number;
  /** Inset from bottom as fraction of height (0–1). */
  bottom: number;
}

export function detectAspectMode(width: number, height: number): AspectMode {
  return height > width ? "social_9_16" : "broadcast_16_9";
}

/** Action-safe rectangle (critical content must stay inside). */
export function actionSafeRect(mode: AspectMode): SafeRect {
  if (mode === "social_9_16") {
    return { left: 0.05, right: 0.1, top: 0.05, bottom: 0.15 };
  }
  return { left: 0.05, right: 0.05, top: 0.05, bottom: 0.05 };
}

/** Title-safe rectangle (text/captions must stay inside). */
export function titleSafeRect(mode: AspectMode): SafeRect {
  if (mode === "social_9_16") {
    return { left: 0.08, right: 0.12, top: 0.08, bottom: 0.18 };
  }
  return { left: 0.1, right: 0.1, top: 0.1, bottom: 0.1 };
}

/** CSS inset style for a safe rect (percentages). */
export function safeRectStyle(rect: SafeRect): CSSProperties {
  return {
    position: "absolute",
    left: `${rect.left * 100}%`,
    right: `${rect.right * 100}%`,
    top: `${rect.top * 100}%`,
    bottom: `${rect.bottom * 100}%`,
  };
}

/** Clamp a percent position into the title-safe zone. */
export function clampToTitleSafe(
  xPct: number,
  yPct: number,
  mode: AspectMode,
): { xPct: number; yPct: number } {
  const r = titleSafeRect(mode);
  const minX = r.left * 100;
  const maxX = (1 - r.right) * 100;
  const minY = r.top * 100;
  const maxY = (1 - r.bottom) * 100;
  return {
    xPct: Math.min(maxX, Math.max(minX, xPct)),
    yPct: Math.min(maxY, Math.max(minY, yPct)),
  };
}
