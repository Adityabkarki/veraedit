/**
 * Curated SFX library — maps trigger/transition types to catalog soundIds.
 *
 * Every mapping is a variant pool: the concrete sound is picked
 * deterministically from the pool via a seed (the trigger/transition id), so
 * the same three sounds never repeat back-to-back across one video while the
 * same timeline always renders the same audio (Determinism Law).
 *
 * All soundIds are slugs from apps/api/data/sfx_catalog.json with real files
 * in apps/api/static/sfx/.
 */
export const SFX_LIBRARY = {
  whoosh: "whoosh",
  whoosh_arrow: "whoosh_arrow",
  whoosh_cinematic: "whoosh_cinematic",
  whoosh_rocket: "whoosh_rocket",
  pop: "pop",
  click: "shutter_click",
  camera_flash: "camera_flash",
  riser: "riser",
  chime: "notification",
  swipe: "swipe",
  glitch: "glitch",
  sub_bass: "sub_bass",
  impact_hit: "impact_hit",
  impact_cinematic: "impact_cinematic",
} as const;

export type SfxSoundId = (typeof SFX_LIBRARY)[keyof typeof SFX_LIBRARY];

/** Variant pools per transition type — first entry is the classic default. */
export const TRANSITION_SFX_VARIANTS: Record<string, readonly SfxSoundId[]> = {
  whip_pan: [SFX_LIBRARY.whoosh, SFX_LIBRARY.whoosh_arrow, SFX_LIBRARY.whoosh_rocket],
  zoom_blur_cut: [SFX_LIBRARY.whoosh_cinematic, SFX_LIBRARY.whoosh],
  glitch_cut: [SFX_LIBRARY.glitch, SFX_LIBRARY.swipe],
  slide: [SFX_LIBRARY.whoosh, SFX_LIBRARY.whoosh_arrow],
};

/** Variant pools per trigger type — first entry is the classic default. */
export const TRIGGER_SFX_VARIANTS: Record<string, readonly SfxSoundId[]> = {
  hook_phrase: [SFX_LIBRARY.riser],
  kinetic_caption: [SFX_LIBRARY.pop],
  stat_mention: [SFX_LIBRARY.click, SFX_LIBRARY.pop],
  feature_callout_phrase: [SFX_LIBRARY.chime, SFX_LIBRARY.pop],
  high_emphasis_moment: [SFX_LIBRARY.pop, SFX_LIBRARY.sub_bass, SFX_LIBRARY.impact_hit],
  topic_shift: [SFX_LIBRARY.whoosh_cinematic, SFX_LIBRARY.impact_cinematic],
  beat: [SFX_LIBRARY.whoosh, SFX_LIBRARY.whoosh_arrow],
  screen_recording_segment: [SFX_LIBRARY.whoosh, SFX_LIBRARY.swipe],
};

/** Legacy single-sound maps (kept for existing consumers/tests). */
export const TRANSITION_SFX: Record<string, SfxSoundId> = Object.fromEntries(
  Object.entries(TRANSITION_SFX_VARIANTS).map(([k, v]) => [k, v[0]!]),
);

export const TRIGGER_SFX: Record<string, SfxSoundId> = Object.fromEntries(
  Object.entries(TRIGGER_SFX_VARIANTS).map(([k, v]) => [k, v[0]!]),
);

/** Deterministic 32-bit string hash (FNV-1a) — stable across renders/workers. */
export function seededIndex(seed: string, poolSize: number): number {
  if (poolSize <= 1) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % poolSize;
}

export function soundIdForTransition(
  type: string,
  seed?: string,
): SfxSoundId | undefined {
  const pool = TRANSITION_SFX_VARIANTS[type];
  if (!pool?.length) return undefined;
  return pool[seed ? seededIndex(seed, pool.length) : 0];
}

export function soundIdForTrigger(
  type: string,
  seed?: string,
): SfxSoundId | undefined {
  const pool = TRIGGER_SFX_VARIANTS[type];
  if (!pool?.length) return undefined;
  return pool[seed ? seededIndex(seed, pool.length) : 0];
}
