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

## Drift Recovery

When output looks like "centered div + fade/slide-in":

> You are violating the layout laws in skills.md — fix it immediately.

Re-point at the concrete structural reference (GitHub pattern or local component)
rather than re-describing the effect with adjectives alone.
