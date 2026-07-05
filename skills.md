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
| Content | 10–50 | Speaker cards, device mockups, charts, funnels |
| Graphics Overlay | 50–80 | Captions, equalizers, callouts, annotations |
| UI Chrome | 80–100 | Branding watermark, subscribe badges, safe-zone guides |

**Violation to reject:** any component hardcoding a `layerDepth` outside its declared band, or two components in the same preset claiming the same value.

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
