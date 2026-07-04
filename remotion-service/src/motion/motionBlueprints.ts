/**
 * Aesthetic blueprints — distinct DOM/style architectures + spring profiles.
 * Keep spring profiles in lockstep with apps/web/lib/motionBlueprints.ts
 */
import type { CSSProperties } from "react";
import type { MotionElement } from "./types";
import { containsDevanagari } from "./motionMath";
import { resolveMotionFont } from "./fonts";

/** Social / TikTok — snappy high bounce */
export const SPRING_SOCIAL = { mass: 0.5, damping: 10, stiffness: 150 };

/** Consultancy / corporate — smooth glide, no oscillation */
export const SPRING_CORPORATE = { mass: 1.0, damping: 25, stiffness: 80 };

/** Product showcase — medium bounce with polish */
export const SPRING_PRODUCT = { mass: 0.7, damping: 14, stiffness: 160 };

/** Default balanced */
export const SPRING_DEFAULT = { mass: 1.0, damping: 14, stiffness: 180 };

export type BlueprintFamily = "social" | "corporate" | "product" | "default";

const FAMILY_BY_TYPE: Record<string, BlueprintFamily> = {
  // Blueprint A — audio / podcast
  voice_waveform: "social",
  eq_visualizer: "social",
  circular_waveform: "social",
  soundbite: "social",
  karaoke_caption: "social",
  subscribe_badge: "social",
  social_frame: "social",
  guest_intro: "social",
  name_plate: "social",
  broadcast_lower_third: "social",
  lower_third_pro: "social",
  chapter_marker: "social",
  focus_frame: "social",
  cta_badge: "social",
  // Blueprint C — consultancy / infographics
  bar_chart: "corporate",
  line_chart: "corporate",
  comparison_chart: "corporate",
  pie_chart: "corporate",
  funnel_chart: "corporate",
  timeline_flow: "corporate",
  corporate_timeline: "corporate",
  data_reveal: "corporate",
  stat_counter: "corporate",
  authority_badge: "corporate",
  progress_timer: "corporate",
  glass_card: "corporate",
  icon_pop: "corporate",
  parallax_slide: "corporate",
  animated_title: "corporate",
  accent_stroke: "corporate",
  // Blueprint B — product
  device_mockup: "product",
  product_highlight: "product",
  product_reveal: "product",
  feature_callout: "product",
  callout_line: "product",
  price_popup: "product",
  before_after: "product",
  split_screen: "product",
  grid_layout: "product",
  liquid_blob: "product",
};

const SPRING_BY_FAMILY: Record<BlueprintFamily, { mass: number; damping: number; stiffness: number }> = {
  social: SPRING_SOCIAL,
  corporate: SPRING_CORPORATE,
  product: SPRING_PRODUCT,
  default: SPRING_DEFAULT,
};

export function blueprintFamily(typeId: string): BlueprintFamily {
  return FAMILY_BY_TYPE[typeId] ?? "default";
}

/** Prefer element.animation.spring when set; otherwise family defaults. */
export function springConfigForElement(el: MotionElement): {
  mass: number;
  damping: number;
  stiffness: number;
} {
  const family = blueprintFamily(el.type);
  const defaults = SPRING_BY_FAMILY[family];
  const s = el.animation.spring;
  if (!s) return { ...defaults };
  return {
    mass: Number(s.mass ?? defaults.mass),
    damping: Number(s.damping ?? defaults.damping),
    stiffness: Number(s.stiffness ?? defaults.stiffness),
  };
}

/**
 * Devanagari-safe text style: extra line-height and padding so matras
 * (ि ी ु ू) and conjuncts are never clipped.
 */
export function textLayerStyle(
  text: string,
  fontFamily: string,
  extras: CSSProperties = {},
): CSSProperties {
  const dev = containsDevanagari(text);
  return {
    fontFamily: resolveMotionFont(text, fontFamily),
    lineHeight: dev ? 1.55 : 1.25,
    paddingTop: dev ? "0.2em" : 0,
    paddingBottom: dev ? "0.25em" : 0,
    overflow: "visible",
    ...extras,
  };
}

/** Hex to rgba for glow filters. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(59,130,246,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
