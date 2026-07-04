# Motion Graphics System — Code-as-Video Reference Spec

Professional, AI-controllable motion graphics for ViraEdit. Optimized for
**Podcast**, **Consultancy**, and **Product Showcase** videos (plus VOX-style
explainers). Everything is **JSON-driven**; Remotion renders sharp programmatic
overlays (never generative video). Preview uses the same `motionMath` timing.

---

## Architecture

```
✨ Magic Mode one-tap presets (Podcast · Consultancy · Social · Product Showcase)
       │
       ▼
prepare_motion_assets() → direct_motion_plan() → validate_motion_plan()
       │   content-type package rules + preferred component lists
       │   thin LLM plans fall back to build_atomic_preset_plan()
       ▼
Timeline overlay clips → Remotion (:3500) transparent WebM → FFmpeg composite
       │
       ▼
   Final MP4 (preview-to-export fidelity)
```

---

## Theming (Brand Theme Token System)

Visual identity is **decoupled from component logic**. Every atomic component reads
colors, fonts, glass variants, and logo from a resolved `ThemeToken` via
`ThemeProvider` / `useTheme()` — never hardcoded hex or font-family strings.

### Token shape

`remotion-service/src/types/theme-tokens.ts` — `ThemeToken` + `DEFAULT_THEME`.

| Field | Purpose |
|-------|---------|
| `identity.brandName` / `logoUrl` | Wordmark fallback when no logo |
| `colors.*` | `primary`, `secondary`, `accent`, `background`, `surface` + derived `on*` |
| `typography.*` | `headingFont`, `bodyFont`, `devanagariFont`, `weightScale` |
| `motion.defaultCurve` | Brand default physics curve (karaoke/showcase override per manifest) |
| `glass.*` | `surfaceOpacity`, `borderOpacity`, `blurStrength` for glassmorphic atoms |
| `meta` | `source`, `sourceUrl`, `resolvedAt` — theme resolved once upstream |

### Resolution paths (Node / build-time only — never inside Remotion render)

| Path | Entry | Output |
|------|-------|--------|
| **Brand Kit** | `brandKitToTheme()` — editor Brand tab colors + logo text | `ThemeToken` via `resolveManualTheme()` → `deriveTokens()` |
| **Manual** | `resolveManualTheme()` — onboarding form colors + curated font pairing | `ThemeToken` via `deriveTokens()` |
| **Scraped** | `resolveScrapedTheme(url)` — HTML meta/theme-color/og:image + font mapping | Same shape; explicit fallback if extraction fails |

Editor Brand Kit (`visualLibraryStore.brandKit`) syncs through `brandKitToTheme()` / API `POST /motion-graphics/resolve-theme`. Magic Mode sends `brand_kit` on the plan; export metadata includes both `brand_kit` and resolved `theme`.

Pipeline files: `src/lib/theme/{deriveTokens,resolveTheme,migrateTheme,themeSchema}.ts`  
Provider: `src/motion/components/theme/ThemeProvider.tsx`

### Example scraped theme

Input URL with `<meta name="theme-color" content="#2563EB">` and Roboto body font:

- **Before (DEFAULT_THEME):** dark `#0B1120` plate, sky `#0EA5E9` primary, orange `#F97316` accent
- **After (scraped):** `primary: #2563EB`, mapped Poppins/Roboto pairing, `meta.source: scraped`

Preview side-by-side: Remotion compositions `PodcastPillarPreview` vs `PodcastPillarPreviewLight`
(same atoms, `TEST_LIGHT_THEME` with `#F1F5F9` background + rose `#E11D48` accent).

Saved projects: run `migrateTheme(storedTheme)` before `ThemeProvider` (handles legacy
`brandColor` / `accentColor` v0 JSON).

---

## Atomic pillar library (Jitter-style)

Canonical atoms: `remotion-service/src/motion/components/{podcast,consultancy,social,showcase}/`  
Presets: `remotion-service/src/motion/components/presets/`

### Pillar 1 — Podcast
| type | Component | Notes |
|------|-----------|-------|
| `active_speaker_split` | ActiveSpeakerSplitCards | Flex dual cards, `activeSpeakerId` highlight |
| `symmetric_audio_strip` | SymmetricAudioStrip | Center-out EQ, bottom-third anchor |
| `circular_orbit_equalizer` | CircularOrbitEqualizer | Radial bars + profile mask |
| `eq_visualizer` | (alias → symmetric_audio_strip) | Legacy type id |

### Pillar 2 — Consultancy
| type | Component | Notes |
|------|-----------|-------|
| `strategy_funnel` | StrategyFunnel | SVG trapezoid self-draw |
| `metric_ticker` | GlassmorphicMetricTicker | Glass count-up + trend arrow |
| `corporate_timeline` | CorporateTimelineRoadmap | Axis strokeDashoffset + nodes |
| `glass_card` | (alias → metric_ticker) | Legacy type id |

### Pillar 3 — Social
| type | Component | Notes |
|------|-----------|-------|
| `vertical_clip_template` | VerticalClipTemplate | 9:16 safe zones |
| `kinetic_karaoke` | KineticKaraokeText | Word nodes + snappy_spring |
| `scribble_annotation` | ScribbleAnnotation | Self-tracing SVG arrows/circles |
| `social_frame` | (alias → vertical_clip_template) | Legacy type id |

### Pillar 4 — Product Showcase
| type | Component | Notes |
|------|-----------|-------|
| `device_mockup` | DeviceMockup3D | 3-layer chassis/screen/glass |
| `dynamic_feature_callout` | DynamicFeatureCallout | Dot → line → card chain |
| `feature_callout` / `callout_line` | (aliases) | Legacy type ids |

---

## One-tap atomic presets (Step 4)

| Preset | Forced curve | Atoms injected | Canvas |
|--------|--------------|----------------|--------|
| **Podcast** | elegant_glide | split cards + orbit EQ + audio strip + L3 | 1920×1080 |
| **Consultancy** | elegant_glide | title + funnel + metric + timeline + progress | 1920×1080 |
| **Social** | snappy_spring | vertical template + karaoke + scribble | 1080×1920 |
| **Product Showcase** | elastic_overshoot | 3D device + 2× feature callouts | 1920×1080 |

**Usage:** Effects → Motion → One-tap styles → tap preset. Backend uses
`build_atomic_preset_plan()` when a one-tap atomic preset is selected or when the
LLM plan is too thin.

Remotion preview compositions: `PodcastPresetPreview`, `ConsultancyPresetPreview`,
`SocialPresetPreview`, `ProductShowcasePresetPreview`.

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
| **A — Audio** | Bottom-docked flex / circular SVG ring; seeded sin heights | — | elegant_glide (corporate) |
| **B — Device** | Chassis + overflow screen + glass; `interpolateCard3D` | `av/remotion-bits` | elastic_overshoot (product) |
| **C — Infographic** | SVG self-draw via strokeDashoffset | `lifeprompt-team/remotion-scenes` | elegant_glide (corporate) |
| **D — Glass** | backdrop-blur glassmorphic cards | — | elegant_glide (corporate) |
| **E — Social** | Karaoke word nodes + scribble SVG | remotion-animated philosophy | snappy_spring (social) |

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
| **Social Reel** | social | 9:16 template, karaoke, scribbles |
| **Social** | social | Same atomic stack, snappy_spring |
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
| Atomic atoms | `remotion-service/src/motion/components/` |
| Presets | `remotion-service/src/motion/components/presets/` |
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
