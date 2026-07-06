## Role & Operational Protocol
 
You are continuing as the Staff Creative Engineer on ViraEdit. The platform currently has no color grading system and no VFX/image-overlay layer — every clip renders exactly as uploaded. This engine adds a deterministic color-grade system tied to the Theme Token System, plus a library of VFX and image overlays (glitch, grain, light leaks, halftone) that respect the existing Density Throttle and Photosensitive Flash Safety laws.
 
Follow the phases in order. Pause at every ⏸️ checkpoint.
 
---
 
## PHASE 1 — Extend `skills.md`
 
### The Grade Consistency Law
Exactly one color grade applies per composition (or per explicitly user-defined segment override) — never a randomly varying grade from clip to clip within the same content type. Grading is a themed property, not a per-clip decoration.
 
### The Precise Grading Law
Color grading must be implemented with **SVG filter primitives** (`<feColorMatrix>`, `<feComponentTransfer>`) rather than CSS `filter: contrast()/saturate()` shorthand. CSS filter shorthand renders inconsistently between the browser preview and headless Chromium export in some configurations; SVG filter primitives give exact, reproducible matrix math that matches pixel-for-pixel between preview and export.
 
### The VFX Overlay Restraint Law
VFX overlays (glitch, scanlines, chromatic aberration) and image overlays (grain, light leaks, halftone) are **Triggers**, subject to the same Density Throttle Law already governing motion graphics and B-roll. They do not get a separate, unthrottled budget — an "Immersive" density setting spending its whole budget on VFX instead of motion graphics is still respecting the law.
 
### Layer Depth Registry Update
Extend the existing band table to make room for this new layer type:
 
| Band | Range | Contents |
|------|-------|----------|
| Background | 0–10 | Base video/plate, background gradients |
| Content | 10–45 | Speaker cards, device mockups, charts, funnels |
| Graphics Overlay | 45–70 | Captions, equalizers, callouts, annotations |
| **VFX/Image Overlay** | **70–85** | **Glitch, grain, light leaks, halftone, color grade layer** |
| UI Chrome | 85–100 | Branding watermark, subscribe badges, safe-zone guides |
 
**Violation to reject:** any VFX/overlay component claiming a `layerDepth` outside 70–85, or the color grade layer being applied below content instead of as a final full-frame pass above it.
 
⏸️ **Stop and confirm** the updated band table and both new laws are written before proceeding.
 
---
 
## PHASE 2 — The Grade Token
 
Extend the Theme Token System (`@types/theme-tokens.ts`) with a `grade` field — this is a themed property, resolved once alongside colors/fonts, not a runtime toggle:
 
```typescript
export interface GradeToken {
  contrast: number;        // -1 to 1, 0 = neutral
  saturation: number;      // -1 to 1, 0 = neutral
  warmth: number;          // -1 to 1, negative = cooler, positive = warmer
  vignetteIntensity: number; // 0 to 1
  grainIntensity: number;    // 0 to 1
  blendMode: 'normal' | 'overlay' | 'screen' | 'soft-light';
}
 
// Add to ThemeToken:
// grade: GradeToken;
 
export const GRADE_PRESETS: Record<'podcast' | 'consultancy' | 'social' | 'showcase', GradeToken> = {
  podcast:     { contrast: 0.1,  saturation: -0.05, warmth: 0.15, vignetteIntensity: 0.2, grainIntensity: 0.08, blendMode: 'overlay' }, // warm, intimate
  consultancy: { contrast: 0.05, saturation: -0.1,  warmth: -0.05, vignetteIntensity: 0.0, grainIntensity: 0.0,  blendMode: 'normal' },  // clean, neutral, corporate
  social:      { contrast: 0.25, saturation: 0.2,   warmth: 0.05, vignetteIntensity: 0.1, grainIntensity: 0.05, blendMode: 'overlay' },  // punchy, saturated
  showcase:    { contrast: 0.1,  saturation: 0.05,  warmth: 0.0,  vignetteIntensity: 0.0, grainIntensity: 0.0,  blendMode: 'normal' },   // clean, bright, product-accurate
};
```
 
Default grade per content type comes from `GRADE_PRESETS`; a scraped/manual brand theme (Theme Token System Path A/B) may override individual fields, but must still pass through the same resolution/validation function — no separate ungoverned code path.
 
⏸️ **Stop and confirm** the type compiles and merges cleanly into the existing `ThemeToken` shape without breaking the theme migration system from Step 7 of the Theme Token spec.
 
---
 
## PHASE 3 — Grading Component
 
Build `@components/vfx/ColorGrade.tsx` — a full-frame SVG filter overlay applied as the topmost layer within the Content band, wrapping the video output:
 
1. Build a `<feColorMatrix type="matrix">` combining contrast/saturation adjustments into a single matrix (don't stack multiple naive filter passes — compose the matrix math once for performance and to avoid compounding rounding errors).
2. Warmth is applied via a secondary subtle color matrix shifting the red/blue channel balance.
3. Vignette is a separate radial gradient overlay (`<radialGradient>`) composited with `multiply` blend mode, intensity from `grade.vignetteIntensity`.
4. Grain is a tiled, seeded noise texture (pre-generated static noise frames, cycled deterministically by `frame % noiseFrameCount` — never `Math.random()` per frame, which would violate the Determinism Law) composited at low opacity via the configured `blendMode`.
**Violation to reject:** any grain/noise implementation using live `Math.random()` per frame instead of cycling through a fixed, pre-generated seeded noise sequence.
 
⏸️ **Stop and confirm** the same source clip rendered under all four `GRADE_PRESETS` produces visibly distinct, correct looks, and confirm pixel-level consistency between a browser preview screenshot and an actual exported frame.
 
---
 
## PHASE 4 — VFX Overlay Library
 
Build under `@components/vfx/overlays/`, each respecting the VFX/Image Overlay band (70–85) and the Photosensitive Flash Safety Law where applicable:
 
- **Glitch Overlay** — RGB channel split (reuse the technique from the Cuts & Motion Engine's `glitch_cut` transition) sustained as a brief overlay rather than a cut; digital noise blocks via randomly-seeded (per-trigger, not per-frame) rectangular displacement.
- **Scanline/HUD Overlay** — repeating horizontal line pattern via SVG `<pattern>`, animated scroll offset driven by `frame`, low opacity, for the HUD Elements category from the original effects wishlist.
- **Chromatic Aberration** — subtle RGB channel offset at frame edges, intensity constant (not per-frame random) — a static stylistic filter, not a flashing effect, so it's exempt from the flash-safety cap but still Density-Throttled.
- **Light Leak** — pre-rendered light-leak video/PNG sequence assets, composited with `screen` blend mode, opacity ramped in/out at trigger boundaries.
- **Halftone/Print Texture** — SVG `<pattern>` of dot/line halftone, composited with `multiply`, used for the Mixed Media/Video Collage look.
- **Doodle/Scribble Overlay** — reuses the Scribble Attention Annotation self-drawing `strokeDashoffset` technique from the Motion Graphics Library, but as a decorative full-frame overlay rather than a pointer.
Each overlay is a `TriggerLogEntry`-linked `VFXOverlayEntry` (extend the Timeline schema):
 
```typescript
export interface VFXOverlayEntry {
  id: string;
  type: 'glitch' | 'scanline' | 'chromatic_aberration' | 'light_leak' | 'halftone' | 'doodle';
  startFrame: number;
  durationInFrames: number;
  layerDepth: number;   // must be within 70–85
  intensity: number;    // 0–1
  triggerId: string;
}
```
 
⏸️ **Stop and confirm** each overlay renders correctly in isolation and that `glitch`/`scanline` variants pass a manual flash-frequency check before proceeding.
 
---
 
## PHASE 5 — Integrate into the Timeline & Director Engine
 
1. Add `vfx: VFXOverlayEntry[]` to the `Timeline.tracks` shape.
2. Extend each Director with VFX/grade defaults:
   - **Podcast** — grade applied always (warm/intimate preset); VFX overlays essentially never auto-triggered (talking-head content doesn't benefit from glitch/halftone) — reserve for manual use only.
   - **Consultancy** — clean neutral grade always; VFX overlays effectively disabled by default (a glitch effect undermines an executive-pitch tone) — Density Throttle should naturally suppress these triggers at `balanced`/`minimalist` for this pillar; confirm this explicitly rather than assuming it falls out automatically.
   - **Social** — punchy grade always; `glitch`/`chromatic_aberration` overlays are legitimate triggers tied to `hook_phrase` or `isTransient` moments (same beat-sync payoff as the Cuts & Motion Engine).
   - **Showcase** — clean bright grade always, matching real product colors; light leaks only, used sparingly around transitions, never glitch (would misrepresent product visuals).
3. Grade is **always applied** (it's the base look, not an optional trigger) — only VFX/image overlays go through Trigger Resolution and Density Throttling.
⏸️ **Stop and confirm** with one full end-to-end render per content type showing the correct default grade and appropriately restrained (or absent) VFX overlay usage before considering this engine complete.
 
---
 
## Execution Directives
 
- **Grade is not optional and not throttled** — every frame of every export has a grade applied, even if it's a deliberately neutral one (Consultancy). Don't let Cursor treat "no grade" as a valid default; `consultancy`'s "neutral" preset is still an explicit, intentional grade.
- **Consultancy and Podcast should almost never show VFX overlays by default** — if Cursor's Density Throttle output shows glitch effects firing on a consultancy pitch, that's a tuning bug, not an acceptable stylistic choice. Verify explicitly.
- Update `motion-graphics.md` with the grade preset table, the VFX overlay library, and the updated Layer Depth Registry band table.
