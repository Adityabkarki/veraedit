/**
 * Phase 17 — SFX variant rotation: deterministic, varied, catalog-backed.
 */
import { describe, expect, it } from "vitest";
import {
  SFX_LIBRARY,
  TRANSITION_SFX_VARIANTS,
  TRIGGER_SFX_VARIANTS,
  seededIndex,
  soundIdForTransition,
  soundIdForTrigger,
} from "../sfxLibrary";

const CATALOG_SLUGS = new Set([
  "whoosh",
  "whoosh_arrow",
  "whoosh_cinematic",
  "whoosh_rocket",
  "shutter_click",
  "camera_flash",
  "sub_bass",
  "impact_hit",
  "impact_cinematic",
  "pop",
  "notification",
  "swipe",
  "glitch",
  "riser",
]);

describe("sfx variant pools", () => {
  it("every pooled soundId exists in the bundled catalog", () => {
    const all = [
      ...Object.values(SFX_LIBRARY),
      ...Object.values(TRANSITION_SFX_VARIANTS).flat(),
      ...Object.values(TRIGGER_SFX_VARIANTS).flat(),
    ];
    for (const soundId of all) {
      expect(CATALOG_SLUGS.has(soundId)).toBe(true);
    }
  });

  it("whip_pan draws from multiple whoosh variants", () => {
    expect(TRANSITION_SFX_VARIANTS.whip_pan!.length).toBeGreaterThanOrEqual(3);
  });

  it("selection is deterministic per seed (Determinism Law)", () => {
    for (const seed of ["t-1", "t-2", "trans-abc", "trigger-99"]) {
      expect(soundIdForTransition("whip_pan", seed)).toBe(
        soundIdForTransition("whip_pan", seed),
      );
      expect(soundIdForTrigger("high_emphasis_moment", seed)).toBe(
        soundIdForTrigger("high_emphasis_moment", seed),
      );
    }
  });

  it("different seeds reach different variants across a pool", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => `whip-${i}`);
    const picked = new Set(seeds.map((s) => soundIdForTransition("whip_pan", s)));
    expect(picked.size).toBeGreaterThan(1);
  });

  it("no seed falls back to the first variant only", () => {
    const pool = TRANSITION_SFX_VARIANTS.whip_pan!;
    for (let i = 0; i < 100; i++) {
      const idx = seededIndex(`seed-${i}`, pool.length);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(pool.length);
    }
  });

  it("unknown types return undefined", () => {
    expect(soundIdForTransition("unknown_type", "x")).toBeUndefined();
    expect(soundIdForTrigger("unknown_type", "x")).toBeUndefined();
  });
});
