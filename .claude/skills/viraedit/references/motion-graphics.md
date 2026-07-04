# Motion Graphics System — Reference Spec

Professional, AI-controllable motion graphics for ViraEdit: animated titles,
kinetic typography, lower thirds, stat counters, particle effects, transitions
and dynamic overlays. Everything is **JSON-driven** so the AI pipeline can
generate placements, and everything renders through **Remotion** at export so
the final video matches the preview.

---

## Architecture

```
                         ┌────────────────────────────────────┐
                         │  Editor (Next.js)                   │
                         │  MotionGraphicsTab  → insert clip   │
                         │  MotionGraphicsProOverlays (preview)│
                         │  lib/motionMath.ts (shared easing)  │
                         └───────────────┬────────────────────┘
                                         │ timeline clips (effects.visualType)
                                         ▼
┌───────────────────┐    ┌────────────────────────────────────┐
│ FastAPI            │    │  Timeline JSON (export)            │
│ /motion-graphics/* │◄───┤  overlay clips → motion plan JSON  │
│ library/validate/  │    └───────────────┬────────────────────┘
│ suggest            │                    │ render_task step 5b
└─────────┬─────────┘                     ▼
          │              ┌────────────────────────────────────┐
          │ LLM (gpt-4o- │  services/motion_graphics_service  │
          │ mini) plans  │  validate → render → composite     │
          ▼              └───────────────┬────────────────────┘
   Motion Plan JSON                      │ HTTP :3500 (internal)
                                         ▼
                         ┌────────────────────────────────────┐
                         │  Remotion service (Node)           │
                         │  POST /render-motion-graphics      │
                         │  MotionGraphicsComposition (JSON    │
                         │  dispatcher) → transparent WebM    │
                         └───────────────┬────────────────────┘
                                         │ yuva420p VP8 overlay
                                         ▼
                              FFmpeg overlay composite
```

Division of labor (unchanged from Phase 9):
- **Remotion** renders only the animated graphics layer (transparent WebM).
- **FFmpeg** owns cuts, reframe, audio, color, and the final overlay composite.
- **Preview** uses CSS/React approximations driven by the *same* easing math
  (`motionMath`) and the playhead time, so scrubbing shows the real animation.

---

## Motion Plan — JSON Schema

The single interchange format between AI, editor, backend and renderer.

```json
{
  "version": 1,
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "elements": [
    {
      "id": "mg-hook-1",
      "type": "animated_title",
      "startSeconds": 0.0,
      "endSeconds": 3.2,
      "position": { "xPct": 50, "yPct": 28 },
      "animation": {
        "enter": "word_pop",
        "exit": "fade",
        "enterDuration": 0.6,
        "exitDuration": 0.35
      },
      "props": {
        "text": "3 mistakes killing your channel",
        "fontSize": 72,
        "color": "#FFFFFF",
        "accentColor": "#FFD600"
      }
    }
  ]
}
```

Rules enforced by `validate_motion_plan()` (backend) and mirrored in the
frontend catalog defaults:

| Field | Rule |
|-------|------|
| `type` | Must be a registered component type (unknown → element dropped, warning) |
| `startSeconds` / `endSeconds` | Clamped to `[0, videoDuration]`; `end > start` (min 0.3s) |
| `position.xPct` / `yPct` | Clamped to `[0, 100]` |
| `animation.enter` / `exit` | Must be in the component's `animations` list, else default |
| `props.*` | Unknown props dropped; missing props filled from registry defaults |
| `props` colors | Must match `#RRGGBB` (else default) |
| elements | Max 30 per plan (AI suggestion cap: 12) |

---

## Component Library (12 types)

All types live in `remotion-service/src/motion/` (canonical render) and
`apps/web/components/editor/player/MotionGraphicsProOverlays.tsx` (preview).
Registry source of truth for the backend:
`apps/api/services/motion_graphics_service.py` → `COMPONENT_REGISTRY`.

| type | What it is | Key props | Enter animations |
|------|-----------|-----------|------------------|
| `animated_title` | Hero title card | text, fontSize, color, accentColor | word_pop, slide_up, blur_in, scale_bounce |
| `kinetic_text` | Kinetic typography — words appear sequentially with scale/rotation | text, color, accentColor, fontSize | pop, rotate_in |
| `lower_third_pro` | Name + role bar | title, subtitle, brandColor, variant (slide/glass/accent_line) | slide_left, fade |
| `stat_counter` | Count-up number with label | value, prefix, suffix, label, brandColor | count_up |
| `quote_callout` | Quote with animated quotation marks | text, author, brandColor | fade_up |
| `cta_badge` | Pulsing pill CTA (Subscribe / Follow) | text, brandColor, textColor | pop_pulse |
| `progress_timer` | Animated progress bar (chapters, countdowns) | label, brandColor, direction | fill |
| `particle_burst` | Confetti / sparkle burst (deterministic seed) | particleCount, colors[], seed, burstStyle | burst |
| `shape_transition` | Full-frame wipe/circle/slide transition | style (wipe/circle/slide/split), color | (self-timed) |
| `background_gradient` | Animated gradient + floating shapes backdrop | colorA, colorB, shapeCount, seed | (looping) |
| `arrow_callout` | Animated arrow + label pointing at something | text, angle, brandColor | draw |
| `end_card` | End screen with CTA + handle | title, subtitle, handle, brandColor | rise |

Notes:
- Devanagari text (video content) renders with **Noto Sans Devanagari** —
  the renderer picks the font per-element when `props.text` contains
  Devanagari codepoints. UI labels stay English (hard rule 4).
- `particle_burst` and `background_gradient` use Remotion's deterministic
  `random(seed)` so re-renders are pixel-identical.

---

## API Endpoints

Router: `apps/api/routers/motion_graphics.py` (prefix `/api/v1/motion-graphics`).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/library` | Component catalog (types, props, defaults, animations) |
| POST | `/validate` | Validate + normalize a motion plan; returns `{plan, warnings}` |
| POST | `/suggest` | AI placement suggestions from transcript → validated plan |
| GET | `/health` | Remotion service reachability for the motion pipeline |

`POST /suggest` request body:

```json
{
  "transcript_segments": [{ "text": "…", "start": 0.0, "end": 4.2 }],
  "video_duration": 62.0,
  "content_type": "podcast",
  "brand_color": "#C41E3A",
  "max_elements": 8
}
```

The LLM (gpt-4o-mini via `call_openai_llm`, task type `motion_graphics` in the
model router) receives the registry summary + transcript and returns a motion
plan. The response is always passed through `validate_motion_plan()` before it
reaches the client — the AI never bypasses validation.

---

## Export Integration (preview → export parity)

`tasks/render_task.py` step **5b — motion graphics composite** (after overlay
compositing, before captions):

1. Collect overlay clips whose `visual_type` is a motion-graphic type
   (`plan_from_timeline_clips()` in the service).
2. Build a motion plan; skip the step entirely if no elements.
3. Call `render_motion_graphics_overlay()` → transparent WebM at output
   resolution and fps.
4. FFmpeg-composite onto the cut video (`composite_overlay_onto_video`).
5. On any Remotion failure: log a warning and continue **without** the layer
   (a render must never hard-fail because the graphics service is down).

Parity strategy:
- One easing/timing module, two copies kept in lockstep:
  `remotion-service/src/motion/motionMath.ts` (canonical) and
  `apps/web/lib/motionMath.ts` (preview). Unit tests on both sides assert the
  same values for the same inputs.
- Preview components read the playhead (`usePlayerStore`) and compute local
  element time exactly like the Remotion composition computes it from frames.
- Colors, font sizes and layout constants come from the same registry defaults.

Performance:
- Preview never renders video through Remotion — CSS approximations only.
- Export renders one combined overlay for all elements (single Remotion pass,
  single FFmpeg composite), not one pass per element.
- Long videos: the overlay render is bounded by `REMOTION_RENDER_TIMEOUT`;
  on timeout the step is skipped with a warning (same fallback as captions).

---

## Editor Controls (right panel)

When a pro motion graphic clip is selected (timeline click or after insert
from Effects → Motion), the **Motion graphics** right panel opens with:

| Section | Controls |
|---------|----------|
| **Timing** | In / out times, clip duration (trim on timeline) |
| **Content** | Text, title, subtitle, stat value, variant, type-specific fields |
| **Animation** | Enter / exit preset (per component), enter/exit duration (seconds) |
| **Placement** | X/Y sliders, scale, preset positions (Top, Center, Lower third, …) |
| **Colors** | Brand, accent, text, gradient colors (type-dependent) |

Canvas interaction:
- **Drag** on preview to move (positionable types)
- **Corner handles** to scale (via shared `PositionedOverlay`)
- Full-frame types (end card, transition, gradient BG) show a note instead of X/Y

All edits sync `motionProps` + `displayValue`/`secondaryText` for export parity.

---

## Files

| Layer | File |
|-------|------|
| Spec | `.claude/skills/viraedit/references/motion-graphics.md` (this file) |
| Remotion | `remotion-service/src/motion/motionMath.ts`, `types.ts`, `elements/*.tsx`, `MotionGraphicsComposition.tsx` |
| Remotion server | `remotion-service/server.js` → `POST /render-motion-graphics` |
| Backend service | `apps/api/services/motion_graphics_service.py` |
| Backend router | `apps/api/routers/motion_graphics.py` |
| Remotion client | `apps/api/processors/remotion_client.py` → `render_motion_graphics_overlay` |
| Export hook | `apps/api/tasks/render_task.py` step 5b |
| Frontend catalog | `apps/web/lib/motionGraphicsLibrary.ts` |
| Frontend math | `apps/web/lib/motionMath.ts` |
| Preview | `apps/web/components/editor/player/MotionGraphicsProOverlays.tsx` |
| Edit panel | `apps/web/components/editor/motion/MotionGraphicsEditPanel.tsx` |
| Edit helpers | `apps/web/lib/motionGraphicEdit.ts` |
| Insert UI | `apps/web/components/editor/effects/MotionGraphicsTab.tsx` |
| Tests | `tests/unit/test_motion_graphics_service.py`, `apps/web/__tests__/lib/motionGraphicsLibrary.test.ts`, `apps/web/__tests__/lib/motionMath.test.ts` |

---

## Hard rules that apply here

- English-only UI: component names, tooltips, AI suggestion labels.
- Devanagari font only for text rendered ON the video.
- `pathlib.Path` everywhere; FFmpeg gets `path.as_posix()`.
- Port 3500 stays internal — never exposed publicly.
- Every service function has at least one test.
