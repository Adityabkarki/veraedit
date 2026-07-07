import type { DirectorTimeline } from "@types/timeline";

export type PlatformRenderPlatform = "youtube" | "instagram" | "tiktok" | "linkedin";

export interface PlatformRenderVariant {
  platform: PlatformRenderPlatform;
  showCtaBadge: boolean;
  captionDensity: "full_karaoke" | "reduced";
  endCardStyle: "follow_prompt" | "none";
}

export const PLATFORM_RENDER_VARIANTS: Record<
  PlatformRenderPlatform,
  PlatformRenderVariant
> = {
  tiktok: {
    platform: "tiktok",
    showCtaBadge: true,
    captionDensity: "full_karaoke",
    endCardStyle: "follow_prompt",
  },
  instagram: {
    platform: "instagram",
    showCtaBadge: true,
    captionDensity: "full_karaoke",
    endCardStyle: "follow_prompt",
  },
  youtube: {
    platform: "youtube",
    showCtaBadge: true,
    captionDensity: "full_karaoke",
    endCardStyle: "follow_prompt",
  },
  linkedin: {
    platform: "linkedin",
    showCtaBadge: false,
    captionDensity: "reduced",
    endCardStyle: "none",
  },
};

const CTA_COMPONENT_IDS = new Set(["subscribe_badge", "cta_badge"]);

/** Map API platform strings to render variant keys. */
export function platformToRenderVariant(platform: string): PlatformRenderVariant {
  const normalized = platform.toLowerCase().replace(/-/g, "_");
  if (normalized.includes("linkedin")) return PLATFORM_RENDER_VARIANTS.linkedin;
  if (normalized.includes("tiktok")) return PLATFORM_RENDER_VARIANTS.tiktok;
  if (normalized.includes("instagram")) return PLATFORM_RENDER_VARIANTS.instagram;
  if (normalized.includes("youtube")) return PLATFORM_RENDER_VARIANTS.youtube;
  return PLATFORM_RENDER_VARIANTS.tiktok;
}

/**
 * Apply render-time platform variation without re-compilation — Platform Variant Law.
 */
export function applyPlatformVariantToTimeline(
  timeline: DirectorTimeline,
  variant: PlatformRenderVariant,
): DirectorTimeline {
  let captions = timeline.tracks.captions;
  if (variant.captionDensity === "reduced") {
    captions = captions.map((cue) => ({
      ...cue,
      style: "standard" as const,
    }));
  }

  let motionGraphics = timeline.tracks.motionGraphics;
  if (!variant.showCtaBadge) {
    motionGraphics = motionGraphics.filter(
      (entry) => !CTA_COMPONENT_IDS.has(entry.componentId),
    );
  }

  if (variant.endCardStyle === "none") {
    motionGraphics = motionGraphics.filter(
      (entry) => entry.componentId !== "subscribe_badge",
    );
  }

  return {
    ...timeline,
    tracks: {
      ...timeline.tracks,
      captions,
      motionGraphics,
    },
  };
}
