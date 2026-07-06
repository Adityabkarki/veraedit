# ViraEdit Motion Graphics — Structural Laws

Persistent anchor for the Jitter-style atomic component system.
If any generation drifts back to generic centered divs with fades/slide-ins,
re-read this file and fix violations immediately.

Content pillars: **Podcast**, **Consultancy**, **Social Media**, **Product Showcase**.

---

## Law of Atomic Layout Isolation

Components must be pure, layout-isolated functional blocks driven by responsive
primitives (percentages, flex gaps, SVG viewBoxes). Never hardcode fixed absolute
pixel values that break when the composition switches between 16:9 and 9:16.

**Violations to reject:**
- Hardcoded `width: 400px` / `left: 120px` that assume a single aspect ratio
- Centered text wrappers used as a substitute for real layout anchoring
- Flat single-div containers where the blueprint requires layered DOM/SVG structure

**Required patterns:**
- Percentages, `flex`, `gap`, and SVG `viewBox` for geometry
- Explicit alignment anchors (`bottom_third`, `split_dual`, circular masks)
- Each atomic component owns its internal layout; parents only position the block

---

## The Devanagari Padding Law

To prevent clipping of multi-byte Nepali/Devanagari modifiers (ि, ी, ु, ू, and
conjunct clusters), every typography wrapper must:

1. Enforce a minimum height padding multiplier (`py-[0.25em]` minimum)
2. Use `content-box` sizing
3. Load fonts via `@remotion/fonts` (fallback: Noto Sans Devanagari) **before**
   any text-width calculation runs

**Violations to reject:**
- Measuring text bounds before font faces are ready
- Tight line-height / zero vertical padding on Devanagari caption nodes
- Using UI fonts for on-video Nepali typography

---

## The Physics Constant Manifest

Every animated element must use one of these three named curves.
Never invent ad hoc spring values outside this list:

| Curve | Constants | Use for |
|-------|-----------|---------|
| `snappy_spring` | `{ mass: 0.4, stiffness: 180, damping: 12 }` | Social/TikTok pop-ups, accent bursts, karaoke word highlights |
| `elegant_glide` | `{ mass: 1.0, stiffness: 90, damping: 24 }` | Consultancy timelines, data reports, corporate reveals |
| `elastic_overshoot` | `{ mass: 0.7, stiffness: 140, damping: 8 }` | Product showcase 3D frames, callouts, device mockups |

**Violations to reject:**
- Inline `spring({ stiffness: … })` with values not in this table
- Mixing curves within a preset that mandates one (e.g. consultancy must force `elegant_glide`)

---

## References (architectural ground truth)

Do **not** invent generic layout code. Emulate DOM structures and Remotion math
from these sources. Treat them as ground truth — not loose inspiration.

When stuck, re-point at the concrete repo/pattern below rather than re-describing
the effect with adjectives alone.

| Reference | Status | Use for | Agent instruction |
|-----------|--------|---------|-------------------|
| [av/remotion-bits](https://github.com/av/remotion-bits) | Accessible (verified) | 3D device mockups, CSS gradient transitions | Emulate the perspective + rotateY DOM stacking pattern used in av/remotion-bits's 3D card implementations for our device mockup containers. |
| [stefanwittwer/remotion-animated](https://github.com/stefanwittwer/remotion-animated) | Accessible (verified) | Declarative enter/exit chaining for call-outs & pop-ups | Adopt the declarative animation chaining philosophy from stefanwittwer/remotion-animated so elements mount/unmount cleanly on frame timings. |
| [lifeprompt-team/remotion-scenes](https://github.com/lifeprompt-team/remotion-scenes) | Accessible (verified) | Glitch overlays, HUDs, self-drawing infographic SVGs | Reference the SVG composite scene construction in lifeprompt-team/remotion-scenes. Structure infographics as standalone `.tsx` compositions that accept a JSON data prop, using `<path>` + `strokeDashoffset` mapped to `useCurrentFrame()`. |
| [@remotion/fonts](https://www.remotion.dev/docs/fonts) / `@remotion/google-fonts` | Accessible (verified); in-tree via `remotion-service/src/motion/fonts.ts` | Kinetic typography, Devanagari safety | Use `@remotion/fonts` (or `@remotion/google-fonts`) to guarantee font-faces — especially Devanagari — are loaded before Canvas calculates text bounds. Combine with Flexbox gap transitions + spring interpolation so incoming words displace existing ones ("layout smoothing"). |

### Local pattern ports (prefer these when implementing)

These files already encode the reference patterns inside ViraEdit. Extend them;
do not re-paraphrase from adjectives.

| Pattern | Local path |
|---------|------------|
| Theme tokens + provider | `remotion-service/src/types/theme-tokens.ts`, `src/motion/components/theme/ThemeProvider.tsx` |
| Theme resolution (upstream) | `remotion-service/src/lib/theme/{deriveTokens,resolveTheme,migrateTheme,brandKitToTheme}.ts` |
| Editor Brand Kit → theme | `apps/web/lib/brandKitTheme.ts`, `apps/api/services/brand_theme_service.py` |
| remotion-bits 3D stacking | `remotion-service/src/motion/transform3d.ts` |
| remotion-bits device chassis | `remotion-service/src/motion/elementsExtra.tsx` (Blueprint B — Device mockup) |
| remotion-animated enter/exit | `remotion-service/src/motion/animated.tsx` |
| remotion-scenes SVG self-draw | `remotion-service/src/motion/compositions/LineChartScene.tsx`, `GlitchScene.tsx` |
| Font load-before-measure | `remotion-service/src/motion/fonts.ts` (`FONT_DEVANAGARI`, `resolveMotionFont`) |

### Optional local clone (for `@` linking in Cursor)

If an agent needs the upstream source trees on disk:

```bash
mkdir -p references/motion-ground-truth
git clone --depth 1 https://github.com/av/remotion-bits.git references/motion-ground-truth/remotion-bits
git clone --depth 1 https://github.com/stefanwittwer/remotion-animated.git references/motion-ground-truth/remotion-animated
git clone --depth 1 https://github.com/lifeprompt-team/remotion-scenes.git references/motion-ground-truth/remotion-scenes
```

Then `@references/motion-ground-truth/remotion-bits` (etc.) as ground truth.
Do not vendor-commit those clones unless explicitly requested.

---

## Implementation Map (Steps 3–5)

| Pillar | Folder | Key components |
|--------|--------|----------------|
| Podcast | `@components/motion/podcast/` | Reactive Equalizer Rails, Active Speaker Split-Cards |
| Consultancy | `@components/motion/consultancy/` | Strategy Funnel, Glassmorphic Metric Tickers, Corporate Timeline |
| Social | `@components/motion/social/` | Kinetic Karaoke Text, Scribble Annotations, Vertical Clip Templates |
| Showcase | `@components/motion/showcase/` | 3D Device Mockup, Dynamic Feature Callouts |

Presets snap atoms together; Magic Mode injects pillar nodes into the layout JSON
tree via `JitterComponentSchema` — never a raw generic video wrapper div.

---

## The Theme Token Law

No atomic component may hardcode a color, font-family, or logo reference. Every visual
identity value must be read from a resolved `ThemeToken` object, passed as a prop or
consumed via a `ThemeProvider` wrapping the composition root.

**Violations to reject:**
- Literal hex codes (`#0EA5E9`, `bg-slate-900`) inside a component file
- Literal font-family strings (`font-family: 'Inter'`) outside the theme resolution layer
- A component that renders correctly with one theme but breaks (invisible text, missing logo) with another

**Required pattern:** every component destructures its colors/fonts from `theme.colors.*` /
`theme.typography.*`, and degrades gracefully to `DEFAULT_THEME` if no theme is supplied.

---

## Production Hardening Laws

### The Determinism Law

Every atomic component's visual state must be a **pure function of `frame` and `props`** — nothing else.

**Violations to reject:**
- `Math.random()` without a seeded, frame-derived PRNG
- `Date.now()`, `setInterval`, `requestAnimationFrame`, or any wall-clock/real-time dependency
- Any state that could differ between the preview player and a parallel render worker rendering an isolated frame range

**Required pattern:** if randomness is needed (e.g. varied waveform shapes), derive the seed from `frame` or a stable `id` prop so the same frame always produces the same pixels, regardless of render order.

---

### Layer Depth Registry

Reserve fixed `layerDepth` bands so presets combining multiple atomic components can never collide:

| Band | Range | Contents |
|------|-------|----------|
| Background | 0–10 | Base video/plate, background gradients |
| Content | 10–45 | Speaker cards, device mockups, charts, funnels |
| Graphics Overlay | 45–70 | Captions, equalizers, callouts, annotations |
| VFX/Image Overlay | 70–85 | Glitch, grain, light leaks, halftone, color grade layer |
| UI Chrome | 85–100 | Branding watermark, subscribe badges, safe-zone guides |

**Violation to reject:** any component hardcoding a `layerDepth` outside its declared band, any VFX/overlay component claiming a `layerDepth` outside 70–85, or the color grade layer being applied below content instead of as a final full-frame pass above it.

---

### Title-Safe / Action-Safe Zone Law

All text, captions, and callout anchors must respect safe margins so platform UI chrome never covers them:

- **9:16 (Social):** bottom 15% and right 10% are reserved for platform UI (caption bar, like/share/username). No critical content may render there.
- **16:9 (Podcast/Consultancy/Showcase):** standard 5% action-safe / 10% title-safe broadcast margins apply.

**Violation to reject:** any component placing text or callout anchors outside the safe rectangle for its target aspect ratio.

---

### Symmetric Entry/Exit Law

Every animated element must define both an entry **and** an exit curve from the Physics Constant Manifest. An element that simply disappears on cut is a violation — it must animate out using the same curve family it entered with (or a defined opposite, e.g. `elastic_overshoot` in → `snappy_spring` out for punchy exits).

---

### Photosensitive Flash Safety Law

Glitch, strobe, and high-contrast flash effects (Glitch & Urban Overlays, HUD loading states) must not exceed **3 full-contrast flashes per second**. Any effect exceeding this must be re-timed or dampened before shipping.

---

### Frame-Rate & Resolution Independence Law

- Durations are declared in **seconds** and converted via `useVideoConfig().fps` at render time — never hardcoded as raw frame counts.
- Geometry uses `useVideoConfig().width/height` ratios or `viewBox` scaling — never assumes a fixed canvas size.

**Violation to reject:** any component with a hardcoded `durationInFrames` that assumes 30fps, or fixed pixel geometry that assumes 1920×1080.

---

### Graceful Degradation Law

Every component must render a sane default when its expected data is missing or not yet loaded:

- No `activeSpeakerId` → show a neutral, non-highlighted card state
- No audio amplitude data → fall back to the mock `Math.sin(seededFrame)` waveform, not a crash or blank frame
- Missing chart data array → render an empty-state placeholder, not a runtime error

---

### The Audio-Reactive Fidelity Law

Any component claiming to be "audio-reactive" (equalizers, waveforms, speaker-activity
indicators) must derive its values from **real decoded audio amplitude/frequency data**
for the actual source track. A decorative loop (`Math.sin(seededFrame)`) is permitted
only as the explicit Graceful Degradation fallback when no audio track exists or
analysis has failed — and must **never** be silently substituted when real data is
available.

**Violations to reject:**
- An equalizer that always uses the mock loop regardless of whether real analysis data was passed in
- Any audio analysis performed with mutable state carried across frames (breaks determinism across parallel render workers — see Determinism Law)
- Treating raw, unsmoothed FFT bins as final bar heights (they're visually noisy/jittery without perceptual bucketing)

**Required pattern:** when `audioAnalysis` is present and non-empty, map bar heights and
speaker activity from `AudioAnalysisFrame` values for the current frame. When absent or
failed, fall back to the seeded mock loop and expose `isMockData: true` so dev tooling
can inspect the degradation path.

**Foundation:** use `@remotion/media-utils` (`getAudioData`, `visualizeAudio`) for
client-side analysis. Do not hand-roll FFT or use browser `AudioContext` live analysis —
those are non-deterministic across parallel render workers.

**Hybrid routing (Path A / Path B):**

| Path | When | How |
|------|------|-----|
| **A — Client** | Clips ≤ **3 minutes** (`CLIENT_ANALYSIS_MAX_SECONDS = 180`) | `getAudioData()` at composition mount (`delayRender`/`continueRender`), then `visualizeAudio()` per frame |
| **B — Server** | Episodes > 3 minutes | Celery + librosa STFT → RMS + mel bands, resampled to composition fps; stored as quantized sidecar in MinIO keyed by `(sourceHash, fps, bandCount)` |

Both paths output the same `AudioAnalysisTrack` shape (`remotion-service/src/types/audio-analysis.ts`).
Equalizer components never branch on which path produced the data.

**Render pipeline wiring:**
- **Ingest** (>3 min): Celery `tasks.audio_analysis.precompute` queues Path B sidecar to MinIO
- **Export render**: `attach_audio_analysis_to_plan()` sets `plan.audio.src` (short) or `plan.audio.track` (long)
- **Remotion mount**: `useCompositionAudioAnalysis()` uses `delayRender` + `getAudioData` (Path A) or reads inline track (Path B)

---

### Interpolation Clamping Law

Every `interpolate()` call must explicitly set `extrapolateLeft: 'clamp', extrapolateRight: 'clamp'` unless overshoot is an intentional, named effect (e.g. `elastic_overshoot`). Unclamped interpolations are a violation — they cause value overshoot, pops, or NaN artifacts at composition boundaries.

---

## Look & VFX Laws

### The Grade Consistency Law

Exactly one color grade applies per composition (or per explicitly user-defined segment
override) — never a randomly varying grade from clip to clip within the same content
type. Grading is a themed property, not a per-clip decoration.

### The Precise Grading Law

Color grading must use **SVG filter primitives** (`<feColorMatrix>`,
`<feComponentTransfer>`) rather than CSS `filter: contrast()/saturate()` shorthand.
SVG filter primitives give exact, reproducible matrix math that matches pixel-for-pixel
between preview and headless Chromium export.

### The VFX Overlay Restraint Law

VFX overlays (glitch, scanlines, chromatic aberration) and image overlays (grain, light
leaks, halftone) are **Triggers**, subject to the same Density Throttle Law governing
motion graphics and B-roll. They do not get a separate, unthrottled budget.

---

## Director Assembly Laws

These laws govern how the Director Engine assembles automatic edits. They extend
the Determinism Law — the Timeline is the one resolved, static artifact the
renderer reads.

### The Single Source of Truth Timeline Law

There is exactly one canonical data structure per project: the **Timeline**.
Every track — video, audio, captions, B-roll, motion graphics — is a list of
time-bounded entries inside this one structure. No subsystem may maintain its own
separate "list of things to show" outside the Timeline. The renderer only ever
reads the Timeline; it never independently queries the transcript, B-roll service,
or director rules at render time.

**Violation to reject:** any component or render pass that fetches transcript data,
B-roll suggestions, or trigger logic live during render instead of reading
pre-resolved Timeline entries.

### The Trigger-Driven Assembly Law

Every automatic Timeline entry must trace back to an explicit, named **Trigger**
(e.g. `stat_mention`, `speaker_change`, `topic_shift`, `feature_callout_phrase`)
detected from the source content, with a confidence score and the exact transcript
timestamp range that caused it. Nothing gets placed on the Timeline "because the
AI felt like it" — every auto-inserted element must be traceable and therefore
removable/explainable to the user.

**Violation to reject:** any Director rule that inserts a component without a
corresponding logged `TriggerLogEntry` the user could inspect ("why did this
chart appear here?").

### The Density Throttle Law

Every content-type Director has a Graphics Density setting
(`minimalist` → `balanced` → `immersive`). Triggers are ranked by
confidence/impact and only the top N (per density level, per time window) are
actually realized as Timeline entries — the rest are logged as
`considered but suppressed` for transparency and future manual insertion. This
prevents auto-assembly from becoming a cluttered mess of every possible graphic
firing on every possible topic sentence.

**Violation to reject:** silently dropping lower-confidence triggers with no
`TriggerLogEntry` record, or realizing more graphics per window than the active
density level allows.

---

## Integration Laws

These laws govern how the four engines (Director, Motion Graphics, Cuts & Motion,
Look & VFX, Audio & Multicam) are wired into the live upload → compile → render
pipeline. They apply during the migration from the legacy editor path to the
Director Engine pipeline.

### The Preview/Export Parity Law

There is exactly **one** Composition component (`DirectorRender`) and exactly
**one** props-resolution path (`editor timeline` → `bridgeEditorTimelineToDirector`
→ `resolveDirectorRenderProps` → `timelineToMotionPlan()` → props) used for both
the live preview and the final export.

Preview and export must never diverge into separate composition definitions or
separate prop-construction logic. The unified export path (`_render_unified_director_export`)
and the preview API (`GET /director-render-props`) both call the same bridge and
render `DirectorRender` with identical `inputProps`.

**Violations to reject:**
- Export paths that render raw FFmpeg video + captions while preview shows Remotion layers
- Preview overlays built only in `VisualOverlayLayer` without a bridged `DirectorTimeline`
- Duplicate `timelineToMotionPlan()` call sites that construct props differently for preview vs export
- Adding export-only or preview-only composition stacks for motion graphics, VFX, grade, or audio

**Required pattern:** when the editor timeline changes, re-fetch `director-render-props`
for preview; when exporting, bridge the same saved timeline snapshot before calling
`POST /render-director`.

### The Feature-Flag Migration Law

The Director Engine pipeline ships behind a flag (e.g. `useDirectorEngine`),
running **alongside** the legacy path (`motion_graphics_service.py`, editor
`timelineStore`, `@viraedit/timeline`) — not replacing it yet. Both paths must
remain independently functional until the new pipeline has been validated
end-to-end on real content per content type.

**Violations to reject:**
- Removing or breaking the legacy editor path as part of integration work
- Merging PRs that delete legacy code before Phase 5 validation passes on all
  four content types
- Defaulting `useDirectorEngine` on for all users before real-video validation
  completes

**Required pattern:** gate all Director Engine UI and export wiring behind
`useDirectorEngine` per project. Existing users on the legacy editor see no
change until the flag is explicitly enabled for their project.

### The Honest Confidence Law

Every signal-extraction module must tag its output with a
`confidenceSource: 'heuristic' | 'ml'` field. Downstream Trigger Resolution
weights heuristic-sourced triggers **lower** than ml-sourced ones in the Density
Throttle ranking (Director Engine Phase 5), so a coin-flip diarization stub
cannot dominate trigger placement the same way a real model's output would.

**Violations to reject:**
- Signal modules that emit triggers without a `confidenceSource` tag
- Folding `confidenceSource` into a single opaque confidence number so the
  provenance is no longer inspectable
- Treating heuristic outputs (pause-based speaker alternation, keyword topic
  segmentation) as ground truth in Density Throttle ranking

**Required pattern:** `confidenceSource` must be visible on every
`TriggerLogEntry` in the log — not silently baked into ranking math alone.
Heuristic modules (shot classification, topic segmentation) remain acceptable
when correctly tagged; ml modules (pyannote diarization) must be tagged `'ml'`.

### The No-Empty-Asset Law

No `BRollEntry`, or any Timeline entry with an `assetUrl` / `sourceUrl` field,
may be marked `status: 'realized'` while that field is empty or null.

**Violations to reject:**
- Realizing a B-roll trigger with an empty `assetUrl` and shipping it to render
- Silently skipping asset resolution and leaving broken placeholders in export
- Marking a trigger `realized` when Pexels (or equivalent) returned no match

**Required pattern:** resolution either successfully fetches a real asset and
populates the URL field, or the trigger is marked `suppressed` with an explicit
reason (e.g. `'no_asset_found'`). Never silently ship broken assets.

---

## Cuts & Motion Laws

These laws govern transitions, camera motion, and pacing. They extend the
Determinism Law and apply to every content pillar — including Social glitch/whip
effects (Photosensitive Flash Safety Law still applies).

### The Transition Determinism Law

A transition is a pure function of
`(frame, transitionStartFrame, durationInFrames, transitionType, params)`.
It must never sample "the previously rendered pixel" or depend on GPU-side stateful
effects that vary between preview and export. Ground implementation in
**`@remotion/transitions`** (`TransitionSeries`, `linearTiming`/`springTiming`,
presentations like `fade`, `wipe`, `slide`, `flip`, `clockWipe`) rather than
hand-rolling transition math.

**Violation to reject:** transitions that use unseeded randomness, wall-clock
time, or framebuffer feedback loops.

### The Motion Continuity Law

Camera motion (Ken Burns, push-in, drift) must have a **seeded, deterministic
direction and intensity per clip** — derived from the clip's `id`, not randomized
per render. A clip that pushes in from the left must always push in from the left,
on every render, on every worker.

**Violation to reject:** `Math.random()` for pan direction or scale delta;
camera motion without a stable `seed` prop derived from the clip id.

### The Pacing Profile Law

Speed and cut frequency are governed by exactly one `PacingProfile` per project
(`relaxed` / `balanced` / `aggressive`), which maps to concrete numeric
thresholds in `PACING_PRESETS`. No component may hardcode its own independent
"how fast should this feel" value outside this profile.

**Violation to reject:** hardcoded silence-trim thresholds, transition durations,
or camera intensity caps scattered in individual components.

---

## Audio & Multicam Laws

### The SFX Attribution Law

Every SFX cue must be tied to a specific `TriggerLogEntry` or `TransitionEntry` — a
whoosh plays *because* a whip-pan transition happened at that frame, a pop plays
*because* a karaoke word landed. No SFX may be placed on the Timeline as an
independent, untraceable decoration. This extends the Trigger-Driven Assembly Law.

### The Deterministic Ducking Law

Audio ducking must be expressed as a volume envelope that is a pure function of
frame — computed once during Timeline resolution as
`{ startFrame, endFrame, targetVolume, attackFrames, releaseFrames }` windows,
not as a live audio-analysis pass during render or export.

### The Multicam Sync Law

When a project has multiple camera feeds, they must be aligned to a single shared
timeline via cross-correlation of their audio waveforms (or clapperboard/timecode if
present), computed once at ingest — never assumed pre-synced by upload order.

### The Shot Continuity Law

Automatic camera-angle switching must respect a minimum shot duration and bias toward
cutting on speaker changes or topic shifts (existing Director signals) rather than
arbitrary timers.

---

## Drift Recovery

Trigger a `skills.md` re-read and fix immediately when any of the following appear:

- Centered div + fade/slide-in (generic layout drift)
- Any non-deterministic visual output (differs between preview and export)
- Any component ignoring its aspect-ratio safe zone
- Any entry animation with no matching exit
- Any hardcoded frame count or fixed canvas dimension

Recovery instruction:

> You are violating the layout laws in skills.md — fix it immediately.

Re-point at the concrete structural reference in the **References** section
(GitHub URL, agent instruction, or local pattern port) rather than re-describing
the effect with adjectives alone.
