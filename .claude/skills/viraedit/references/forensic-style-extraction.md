# Forensic Style Extraction — AI Template Guide

## Purpose

When a user extracts a reference Short (e.g. *Kejriwal vs Think School*), ViraEdit produces:

1. **Forensic Report** — 12-section reverse-engineering document
2. **Edit Recipe** — normalized timeline events (0–100%)
3. **Draggable Toolbox** — individual elements the editor can drop on the timeline

The APP UI is English. Reference video content may be any language; captions on the user's video stay Nepali.

---

## 12-Section Report Schema

| Section | Key | Contents |
|---------|-----|----------|
| 1 | `section_1_high_level` | Philosophy, tone, audience, psychology, hook, retention, pacing, narrative acts, energy curve, intensity metrics (1–10) |
| 2 | `section_2_timeline` | Rows: timestamp, shot_type, camera_framing, zoom_level, cut_transition, vfx_motion_broll, caption_style, audio_sfx, purpose |
| 3 | `section_3_cutting_rhythm` | avg shot duration, total cuts, pattern interrupt interval, subtitle cadence |
| 4 | `section_4_camera` | step zoom %, push-in rate, shake rules, invariance rule |
| 5 | `section_5_captions` | font, weight, position Y%, stroke, animation, color matrix |
| 6 | `section_6_graphics_motion` | data cards, arrows, conflict boxes, frame flashes |
| 7 | `section_7_sound_design` | LUFS, EQ, SFX library mapping |
| 8 | `section_8_color_grade` | contrast, exposure, clarity, vignette |
| 9 | `section_9_retention` | curiosity loop, validation frame, open-loop ending |
| 10 | `section_10_rulebook` | 5 enforceable editing rules |
| 11 | `section_11_ai_yaml` | machine-readable recreation spec |
| 12 | `section_12_ai_prompt` | single prompt for AI video editor |

Stored on `StylePreset.forensic_report` in `Brand.style_dna`.

---

## Draggable Tool Categories

Each detected element maps to a toolbox `tool_id`. User drags from **Edit toolbox** → **Timeline**.

| UI Category | Tool IDs (examples) | Timeline track |
|-------------|---------------------|----------------|
| Shot type | `shot_aroll_host`, `shot_aroll_guest`, `shot_broll_news`, `shot_motion_graphic` | video / overlay |
| Camera framing | `framing_mcu`, `framing_ecu` | effects |
| Zoom level | `zoom_step_108`, `zoom_step_115`, `zoom_continuous_push`, `digital_zoom_punch` | effects |
| Cut / transition | `hard_cut`, `fade_transition`, `vfx_frame_flash` | effects |
| VFX | `vfx_vignette`, `vfx_edge_blur`, `vfx_camera_shake` | effects |
| Motion graphics | `motion_data_card`, `motion_arrow_flow`, `motion_conflict_box` | overlay |
| B-roll | `broll_documentary`, `shot_broll_news`, `broll_insert` | overlay |
| Captions | `caption_scale_pop`, `caption_word_by_word`, `caption_masked_overlay` | captions / overlay |
| Overlay / masking | `overlay_upper_third_label`, `title_hook_banner`, `lower_third` | overlay |
| Audio SFX | `sfx_sub_bass_thud`, `sfx_whoosh_cut`, `sfx_shutter_click` | sfx |
| Color | `color_grade` | effects |
| Retention | `retention_open_loop` | effects |

---

## AI Model Pipeline (extraction)

```
Reference video
  → Scene detect (PySceneDetect) + Vision (OCR, layouts, zoom)
  → StyleDNA (pacing, captions, color, audio, hook, broll)
  → EditRecipe (normalized events)
  → Forensic report (rule-based + optional GPT-4o-mini narrative)
  → Toolbox unlock (FORENSIC_DEFAULT_TOOL_IDS when cuts/min > 30 or avg shot < 2s)
```

### Hyper-accelerated detection triggers

- `avg_cut_duration_ms` < 2000 OR `cuts_per_minute` > 30
- Unlocks trailer-style toolbox: host/guest MCU, step zooms, whoosh/thud SFX, data cards, open-loop ending

### LLM enrichment (`style_forensic` task)

Input: metrics JSON + timeline sample  
Output: refined `editing_philosophy`, `hook_strategy`, `editing_rulebook`, `ai_editor_prompt`

---

## Applying vs Drag-Drop

- **Apply template** — scales full `edit_recipe` to target video length (one click)
- **Drag-drop tool** — inserts a single element at playhead (manual fine-tuning)

Content policy on apply:
- `user_captions` — style only, Nepali text unchanged
- `placeholder` — B-roll / logo slots empty for user media
- `style_only` — zoom, color, transitions, SFX markers

---

## Example Intensity Profile (Think School reference)

| Metric | Target |
|--------|--------|
| Editing intensity | 9.5 |
| Motion intensity | 8.5 |
| Caption intensity | 7.5 |
| Sound design | 9.0 |
| Information density | 9.5 |
| Viral optimization | 10.0 |

Cadence: new frame ~1.08s · zoom toggle ~2.1s · pattern interrupt ~3.8s · caption word ~0.38s

---

## API

- `GET /api/v1/projects/{id}/style-library/{preset_id}/forensic` — full report
- `GET /api/v1/projects/{id}/style-toolbox` — draggable catalog + discovered flags

---

## Implementation files

- `apps/api/tasks/style_transfer/forensic_analyzer.py`
- `apps/api/tasks/style_transfer/edit_toolbox.py`
- `apps/api/tasks/style_extract_task.py`
- `apps/web/lib/styleToolboxSync.ts`
- `apps/web/components/editor/visual/StyleToolboxPanel.tsx`
