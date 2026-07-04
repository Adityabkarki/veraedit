# Motion Graphics System — Code-as-Video Reference Spec

Professional, AI-controllable motion graphics for ViraEdit. Optimized for
**Podcast**, **Consultancy**, and **Product Showcase** videos (plus VOX-style
explainers). Everything is **JSON-driven**; Remotion renders sharp programmatic
overlays (never generative video). Preview uses the same `motionMath` timing.

---

## Architecture

```
✨ Magic Mode one-tap presets (Podcast · Consultancy · Product · Explainer)
       │
       ▼
prepare_motion_assets() → direct_motion_plan() → validate_motion_plan()
       │   content-type package rules + preferred component lists
       ▼
Timeline overlay clips → Remotion (:3500) transparent WebM → FFmpeg composite
       │
       ▼
Final MP4 (preview-to-export fidelity)
```

---

## Full library (62 types)

Canonical render: `remotion-service/src/motion/elements.tsx` + `elementsExtra.tsx`  
Registry: `apps/api/services/motion_graphics_service.py`  
Preview: `apps/web/components/editor/player/MotionGraphicsProOverlays.tsx`

### Audio visualizers & waveforms
| type | Description |
|------|-------------|
| `voice_waveform` | Horizontal voice bars |
| `eq_visualizer` | Reactive equalizer |
| `circular_waveform` | Circular audio ring |

### Social & broadcast
| type | Description |
|------|-------------|
| `social_frame` | 9:16 safe-frame + platform label |
| `broadcast_lower_third` | Clean broadcast nameplate |
| `lower_third_pro` | Slide / glass / accent lower third |
| `name_plate` | Guest name plate |
| `subscribe_badge` | YouTube / Spotify-style CTA |
| `cta_badge` | Generic pulsing CTA |

### Podcast
| type | Description |
|------|-------------|
| `guest_intro` | Guest introduction card |
| `chapter_marker` | Chapter title bar |
| `soundbite` | Pull-quote + mini waveform |
| `focus_frame` | Talking-head vignette + brackets |
| `karaoke_caption` | Word-highlight pop-up captions |

### Product showcase
| type | Description |
|------|-------------|
| `device_mockup` | Phone / tablet / laptop frame |
| `product_reveal` | Dramatic product intro |
| `product_highlight` | Shine-sweep highlight box |
| `feature_callout` | Numbered benefit card |
| `callout_line` | Animated line to a feature |
| `price_popup` | Offer / price pop |
| `before_after` | Before–after slider |
| `split_screen` | Two-panel layout |
| `grid_layout` | 2×2 UGC / product grid |

### Consultancy / infographics
| type | Description |
|------|-------------|
| `glass_card` | Frosted glass UI card |
| `authority_badge` | Trust badge |
| `stat_counter` | Count-up metric |
| `data_reveal` | Clip-reveal data card |
| `timeline_flow` | Horizontal process steps |
| `corporate_timeline` | Vertical roadmap / history |
| `bar_chart` / `line_chart` / `comparison_chart` | Charts |
| `pie_chart` | Pie / donut |
| `funnel_chart` | Funnel stages |
| `map_pin` | Location pin |
| `icon_pop` | Flat business icon pop |
| `parallax_slide` | Minimalist parallax text |

### Kinetic typography
| type | Description |
|------|-------------|
| `animated_title` | Word-pop hero title + accent stroke |
| `kinetic_text` | Word-by-word kinetic |
| `kinetic_line` | Line-by-line kinetic |
| `quote_callout` | Quote marks callout |
| `accent_stroke` | Underline / slash / bracket |

### Transitions
| type | Description |
|------|-------------|
| `shape_transition` | Wipe / circle / split |
| `pro_wipe` | Clean wipe + accent edge |
| `whip_transition` | Camera whip / speed ramp |
| `zoom_transition` | Punch zoom |

### Effects & backgrounds
| type | Description |
|------|-------------|
| `particle_burst` | Confetti / sparkles |
| `liquid_blob` | Organic morphing blob |
| `glitch_overlay` | Urban glitch |
| `paper_rip` | Paper-rip edge |
| `collage_frame` | Mixed-media collage |
| `halftone` | Print dot screen |
| `doodle_scribble` | Sketch circle / arrow |
| `hud_grid` / `hud_loader` | Digital HUD |
| `background_gradient` / `background_shader` / `texture_bg` / `geometric_pattern` | Backdrops |
| `arrow_callout` | Arrow pointer |
| `end_card` | End screen CTA |

### Aesthetic blueprints (anti-repetition)

Components are **not** interchangeable flat cards. Four structural families,
emulating open-source Remotion ecosystem patterns:

| Blueprint | Architecture | Ecosystem reference | Spring profile |
|-----------|--------------|---------------------|----------------|
| **A — Audio** | Bottom-docked flex of pill bars / circular SVG ring; `sin(frame)` heights; glow | — | Social: mass 0.5, damping 10, stiffness 150 |
| **B — Device** | Chassis + overflow screen + glass reflection; `interpolateCard3D` (perspective + rotateY/X) | `av/remotion-bits` 3D cards | Product: mass 0.7, damping 14, stiffness 160 |
| **C — Infographic** | Standalone `LineChartScene` / timeline SVG; `strokeDashoffset` self-draw | `lifeprompt-team/remotion-scenes` | Corporate: mass 1.0, damping 25, stiffness 80 |
| **D — Glass** | `backdrop-blur`, `bg-slate-900/40`, `border-white/20` floating card | — | Corporate glide |

**Declarative animation** (`motion/animated.tsx`): Call-outs and karaoke captions use
`Animated` / `AnimatedAt` (philosophy of `stefanwittwer/remotion-animated`) so
elements mount/unmount cleanly from frame timings.

**Kinetic typography**: Flexbox `gap` + per-word springs for layout smoothing
(incoming words displace neighbors). Fonts load via `@remotion/google-fonts`
in `motion/fonts.ts` (Montserrat + Noto Sans Devanagari) **before** layout
measurement — Devanagari uses line-height 1.55 + padding so matras never clip.

**Glitch overlays**: SVG composite `GlitchScene` (scanlines, tear blocks, RGB offset).

Presets **snap layouts** (podcast waveforms → yPct 90, lower thirds → yPct 86)
and stamp family springs via `apply_preset_layout()`.

---

## One-tap Magic Mode presets

Non-editors open **Effects → Motion → One-tap styles** and tap a card.
No further steps: graphics land on the timeline, playhead jumps to the first
graphic, and a success message says “Press play to preview.”

| Preset | Package | What you get |
|--------|---------|----------------|
| **Auto** | auto-detect | Best package from transcript keywords |
| **Podcast** | podcast | Guest intro, broadcast L3, EQ, soundbites, subscribe |
| **Interview** | podcast | Sparse guest/host plates + soundbites |
| **Social Reel** | podcast | 9:16 frame, karaoke captions, subscribe CTA |
| **Consultancy** | consultancy | Glass UI, timelines, charts, authority |
| **Pitch Deck** | consultancy | Stats, funnel, authority, CTA |
| **Product** | product | Device mockup, features, offers |
| **Launch** | product | Reveal, price pop, confetti |
| **App Demo** | product | Device mockup, callouts, grid |
| **VOX Explainer** | explainer | Halftone, collage, charts, doodles |
| **Minimal** | consultancy | Title + lower third + end card only |

A **For you** badge highlights the recommended preset from the transcript.
Advanced options (custom prompt, density) are collapsed by default.
**Replace existing graphics** is on by default.

Quality guarantee: if the LLM returns fewer than the density minimum (3 / 5 / 6
elements), the deterministic package fallback is used so one-tap never produces
an empty or thin plan.

---

## Motion Plan examples

### Podcast EQ + broadcast lower third

```json
{
  "elements": [
    {
      "id": "mg-eq",
      "type": "eq_visualizer",
      "startSeconds": 2,
      "endSeconds": 8,
      "position": { "xPct": 50, "yPct": 80 },
      "animation": { "enter": "grow", "exit": "fade", "enterDuration": 0.5, "exitDuration": 0.3,
        "spring": { "damping": 14, "stiffness": 180, "mass": 1 } },
      "props": { "brandColor": "#3B82F6", "accentColor": "#22D3EE", "bars": 24, "seed": 4 }
    },
    {
      "id": "mg-l3",
      "type": "broadcast_lower_third",
      "startSeconds": 1,
      "endSeconds": 5,
      "position": { "xPct": 20, "yPct": 86 },
      "animation": { "enter": "slide_left", "exit": "fade", "enterDuration": 0.5, "exitDuration": 0.3 },
      "props": { "title": "Sita Sharma", "subtitle": "Host", "brandColor": "#E11D48" }
    }
  ]
}
```

### Product device mockup

```json
{
  "type": "device_mockup",
  "props": { "device": "phone", "title": "ViraEdit", "brandColor": "#8B5CF6", "accentColor": "#FFFFFF" }
}
```

### Consultancy pie chart

```json
{
  "type": "pie_chart",
  "props": {
    "title": "Market share",
    "labels": ["Us", "Competitor", "Other"],
    "values": [45, 30, 25],
    "brandColor": "#3B82F6",
    "accentColor": "#FFD600"
  }
}
```

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/library` | Full catalog (62 types) |
| GET | `/presets` | Magic presets + preferred lists |
| POST | `/validate` | Normalize plan |
| POST | `/suggest` | AI suggestions |
| POST | `/magic` | Magic Mode (preset or prompt) |
| POST | `/prepare` | Asset prep from transcript |
| GET | `/health` | Remotion reachability |

---

## Files

| Layer | Path |
|-------|------|
| Spec | `.claude/skills/viraedit/references/motion-graphics.md` |
| Remotion core | `remotion-service/src/motion/elements.tsx` |
| Remotion packs | `remotion-service/src/motion/elementsExtra.tsx` |
| Backend | `apps/api/services/motion_graphics_service.py` |
| Frontend catalog | `apps/web/lib/motionGraphicsLibrary.ts` |
| Magic UI | `apps/web/components/editor/effects/MotionGraphicsTab.tsx` |
| Preview | `apps/web/components/editor/player/MotionGraphicsProOverlays.tsx` |

---

## Hard rules

- English-only UI; Devanagari only on video text.
- `pathlib.Path` + FFmpeg `path.as_posix()`.
- Port 3500 internal only.
- Remotion failures are non-fatal at export.
- Every service function has at least one test.
