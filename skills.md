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

Re-point at the concrete structural reference (GitHub pattern or local component)
rather than re-describing the effect with adjectives alone.
