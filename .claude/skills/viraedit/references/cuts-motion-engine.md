## Role & Operational Protocol
 
You are continuing as the Staff Creative Engineer on ViraEdit. The Timeline schema currently has no concept of *how one clip moves into the next* or *how a static shot moves within itself* — cuts are hard cuts, images are static. This engine adds transitions, camera motion (Ken Burns, push-ins, whip-zooms), and a real speed/pacing system, all deterministic and all driven by the same Trigger-based architecture as the Director Engine.
 
Follow the phases in order. Pause at every ⏸️ checkpoint.
 
---
 
## PHASE 1 — Extend `skills.md`
 
### The Transition Determinism Law
A transition is a pure function of `(frame, transitionStartFrame, durationInFrames, transitionType, params)`. It must never sample "the previously rendered pixel" or depend on GPU-side stateful effects that vary between preview and export. Ground implementation in **`@remotion/transitions`** (official package: `TransitionSeries`, `linearTiming`/`springTiming`, presentations like `fade`, `wipe`, `slide`, `flip`, `clockWipe`) rather than hand-rolling transition math.
 
### The Motion Continuity Law
Camera motion (Ken Burns, push-in, drift) must have a **seeded, deterministic direction and intensity per clip** — derived from the clip's `id`, not randomized per render. A clip that pushes in from the left must always push in from the left, on every render, on every worker.
 
### The Pacing Profile Law
Speed and cut frequency are governed by exactly one `PacingProfile` per project (Relaxed / Balanced / Aggressive), which maps to concrete numeric thresholds (Phase 4). No component may hardcode its own independent "how fast should this feel" value outside this profile.
 
⏸️ **Stop and confirm** these laws are written before proceeding.
 
---
 
## PHASE 2 — Transition Schema & Component Library
 
Create `@types/transitions.ts`:
 
```typescript
export type TransitionType =
  | 'hard_cut'
  | 'crossfade'
  | 'whip_pan'
  | 'zoom_blur_cut'
  | 'glitch_cut'
  | 'slide'
  | 'morph_shape';
 
export interface TransitionEntry {
  id: string;
  type: TransitionType;
  atFrame: number;              // the shared boundary frame between two clips
  durationInFrames: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  easing: 'linear' | 'spring';  // maps to @remotion/transitions timing functions
  triggerId?: string;           // if auto-inserted (e.g. on a beat), links to TriggerLogEntry
}
```
 
Build each transition as a distinct component under `@components/motion/transitions/`, grounded in `@remotion/transitions`:
 
- **`hard_cut`** — no transition component needed; zero-duration boundary.
- **`crossfade`** — `TransitionSeries` with `fade()` presentation.
- **`whip_pan`** — fast directional blur + translate using `slide()` presentation combined with a motion-blur CSS filter keyframed to peak mid-transition, zero at both ends.
- **`zoom_blur_cut`** — combine a rapid scale-up on the outgoing clip with radial/gaussian blur ramp, then cut.
- **`glitch_cut`** — RGB channel split (three offset copies of the frame, each isolating one color channel via SVG `feColorMatrix`, each translated a few px in different directions) for 2–4 frames, then hard cut. **Must pass the Photosensitive Flash Safety Law** already in `skills.md` — cap duration and contrast so it doesn't exceed the flash-frequency limit.
- **`slide`** — direct `TransitionSeries` + `slide()` presentation.
- **`morph_shape`** — an SVG shape (circle/blob) scales up from a point to cover the frame, revealing the next clip underneath — use `clockWipe()` or a custom SVG mask presentation.
⏸️ **Stop and confirm** each transition renders correctly between two test clips before proceeding.
 
---
 
## PHASE 3 — Camera & Zoom Schema
 
Create `@types/camera-motion.ts`:
 
```typescript
export type CameraMotionType = 'ken_burns' | 'push_in' | 'drift' | 'whip_zoom';
 
export interface CameraMotionSchema {
  type: CameraMotionType;
  startScale: number;
  endScale: number;
  startPosition: { x: number; y: number }; // percentage-based, not pixel-based (Layout Isolation Law)
  endPosition: { x: number; y: number };
  curve: 'elegant_glide' | 'snappy_spring' | 'elastic_overshoot';
  seed: string; // derived from clip id — makes direction/intensity deterministic
}
```
 
- **`ken_burns`** — for static images/B-roll: slow scale + pan across the still, direction/magnitude seeded from `seed` so the same image always drifts the same way.
- **`push_in`** — for talking-head footage: subtle, slow scale increase (e.g. 1.0 → 1.08 over the full segment) using `elegant_glide`, adds production value to static single-camera podcast shots without being distracting.
- **`drift`** — very subtle constant slow pan, used as an "idle" motion for otherwise-static consultancy slide-style segments so nothing feels frozen.
- **`whip_zoom`** — rapid scale spike used as a transition-adjacent effect (pairs with `whip_pan`/`zoom_blur_cut` transitions), `elastic_overshoot` curve.
**Constraint:** all position/scale values must be expressed as percentages of frame dimensions, per the existing Law of Atomic Layout Isolation — never fixed pixel offsets.
 
⏸️ **Stop and confirm** `ken_burns` and `push_in` render correctly and deterministically (same output across two separate render invocations) before proceeding.
 
---
 
## PHASE 4 — Speed & Pacing Engine
 
Create `@lib/pacing/pacingProfile.ts`:
 
```typescript
export interface PacingProfile {
  profile: 'relaxed' | 'balanced' | 'aggressive';
  silenceTrimThresholdMs: number;   // pauses longer than this get trimmed
  minClipDurationFrames: number;    // floor, so aggressive pacing doesn't produce single-frame flashes
  defaultTransitionDurationFrames: number;
  maxCameraMotionIntensity: number; // caps push-in/ken-burns scale delta
  speedRampOnFiller: boolean;       // true = speed up "um/uh"/filler segments instead of cutting them
}
 
export const PACING_PRESETS: Record<PacingProfile['profile'], PacingProfile> = {
  relaxed:    { profile: 'relaxed',    silenceTrimThresholdMs: 1200, minClipDurationFrames: 60, defaultTransitionDurationFrames: 20, maxCameraMotionIntensity: 0.05, speedRampOnFiller: false },
  balanced:   { profile: 'balanced',   silenceTrimThresholdMs: 700,  minClipDurationFrames: 30, defaultTransitionDurationFrames: 12, maxCameraMotionIntensity: 0.08, speedRampOnFiller: false },
  aggressive: { profile: 'aggressive', silenceTrimThresholdMs: 350,  minClipDurationFrames: 12, defaultTransitionDurationFrames: 6,  maxCameraMotionIntensity: 0.12, speedRampOnFiller: true },
};
```
 
**Speed ramp implementation:** time-remap a segment by resampling source frames at a non-1:1 rate (Remotion supports this via `<OffthreadVideo>` with a computed `playbackRate` or manual frame-mapping). Speed ramps must ease in/out (never an instant speed jump) using the profile's assigned curve — apply `elastic_overshoot` timing to the rate change itself for a "whoosh" feel on aggressive pacing.
 
**Silence-based cutting:** consumes the Director Engine's Silence/Pause Detection module (Phase 3 of the Director Engine spec) — any silence longer than `silenceTrimThresholdMs` becomes a cut point, subject to `minClipDurationFrames` so trimming never produces single-frame flashes.
 
⏸️ **Stop and confirm** each of the three presets produces visibly different edit rhythms on the same 60-second test clip before proceeding.
 
---
 
## PHASE 5 — Integrate into the Timeline & Director Engine
 
1. Extend `Timeline` (from the Director Engine schema) with:
```typescript
   tracks: {
     // ...existing tracks
     transitions: TransitionEntry[];
   }
```
   and extend `VideoClipEntry` with `cameraMotion?: CameraMotionSchema`.
 
2. Extend each content-type Director (Podcast/Consultancy/Social/Showcase) with pacing + transition defaults:
   - **Podcast** — mostly `hard_cut` on speaker changes, occasional `crossfade` on topic shifts; `push_in` camera motion during sustained monologue segments. Default profile: `relaxed` or `balanced`.
   - **Consultancy** — `crossfade`/`slide` only, `elegant_glide` easing exclusively (per existing Physics Constant Manifest rule for this pillar); `drift` motion on static slide-style segments. Default profile: `balanced`.
   - **Social** — `whip_pan`/`glitch_cut`/`zoom_blur_cut` triggered **on `isTransient` frames from the Audio Analysis System** (i.e., cut on the beat) — this is the direct payoff of building real audio analysis earlier. Default profile: `aggressive`, `speedRampOnFiller: true`.
   - **Showcase** — `whip_zoom` transitions into/out of the 3D Device Mockup framing; `ken_burns` on any static product image segments. Default profile: `balanced`.
3. The Director's Trigger Resolution (Phase 5 of the Director Engine) now also proposes `TransitionEntry`/camera-motion assignments per clip boundary, subject to the same Density Throttle and layer-conflict rules already established.
⏸️ **Stop and confirm** with a full end-to-end render per content type showing pacing-appropriate cuts, transitions, and camera motion — not just isolated component tests — before considering this engine complete.
 
---
 
## Execution Directives
 
- **Cut-on-the-beat (Social + Audio Analysis) is the highest-value integration point here** — verify it explicitly on a real test clip with a clear rhythmic track before moving on; it's the single most visible "wow, this actually gets it" moment for that pillar.
- **Glitch/whip-pan effects inherit the Photosensitive Flash Safety Law** — do not let Cursor treat that law as scoped only to the original VFX pillar; re-verify it here.
- Update `motion-graphics.md` / `director-engine.md` with the transition and camera-motion tables and the three pacing preset definitions.