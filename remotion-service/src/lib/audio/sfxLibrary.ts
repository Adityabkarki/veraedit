/** Curated SFX library — maps trigger/transition types to catalog soundId. */
export const SFX_LIBRARY = {
  whoosh: "whoosh",
  whoosh_cinematic: "whoosh_cinematic",
  pop: "pop",
  click: "shutter_click",
  riser: "riser",
  chime: "notification",
  swipe: "swipe",
} as const;

export type SfxSoundId = (typeof SFX_LIBRARY)[keyof typeof SFX_LIBRARY];

export const TRANSITION_SFX: Record<string, SfxSoundId> = {
  whip_pan: SFX_LIBRARY.whoosh,
  zoom_blur_cut: SFX_LIBRARY.whoosh_cinematic,
  glitch_cut: SFX_LIBRARY.swipe,
  slide: SFX_LIBRARY.whoosh,
};

export const TRIGGER_SFX: Record<string, SfxSoundId> = {
  hook_phrase: SFX_LIBRARY.riser,
  kinetic_caption: SFX_LIBRARY.pop,
  stat_mention: SFX_LIBRARY.click,
  feature_callout_phrase: SFX_LIBRARY.chime,
  high_emphasis_moment: SFX_LIBRARY.pop,
  beat: SFX_LIBRARY.whoosh,
  screen_recording_segment: SFX_LIBRARY.whoosh,
};

export function soundIdForTransition(type: string): SfxSoundId | undefined {
  return TRANSITION_SFX[type];
}

export function soundIdForTrigger(type: string): SfxSoundId | undefined {
  return TRIGGER_SFX[type];
}
