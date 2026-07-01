# Phase 10 — Style Extractor Fix
## Part 1 of 3: Capability Registry

---

## Context

This phase fixes the style template extractor. The extraction pipeline already
exists and produces real data (`StyleExtractor` → `StyleDNA` + `EditRecipe` +
`effect_inventory` + `forensic_report`). The `RecipeApplicator` already writes
into the timeline. The Effects drawer and Style tab already exist.

**What is actually broken:**
- The vision model produces free-text effect descriptions that have no authoritative
  mapping to the toolbox IDs the applicator understands
- The `effect_inventory` gap report exists but is not surfaced to the user — the card
  shows "100% supported" regardless of what the gap report actually says
- Three specific EP-10.4 renderers are missing: lower-third overlay, hook text overlay,
  zoom transition
- Proportional timestamp scaling breaks on long user videos (hook lands at wrong place)
- Music bed placeholder is created but never wired to the actual music library
- B-roll placeholder slots are created but gap resolution from Phase 2 is never called

This SKILL.md is divided into three parts. Read all three before implementing any of them.

**Part 1 — Capability Registry** (this file): normalizes what the vision model detects
into what the toolbox can apply, and makes "supported" a real check.

**Part 2 — Gap Report UI + EP-10.4 Renderers** (`SKILL-PART2.md`): surfaces the gap
report honestly in the UI and builds the three missing renderers.

**Part 3 — Timing, Music, B-Roll** (`SKILL-PART3.md`): section-anchor timing, music
bed wire-up, b-roll gap resolution integration.

---

## What the Capability Registry Is

A single source of truth that maps every effect the vision model might describe
(in any phrasing) to a toolbox ID, its implementation status, and the params
needed to apply it. This is what makes the gap report's "is_implemented" field
trustworthy and what lets `RecipeApplicator` know exactly which effects it can
actually realize.

### File: `apps/api/data/capability_registry.json`

```json
{
  "version": "1.0",
  "capabilities": [

    {
      "toolbox_id": "caption_word_by_word",
      "display_name": "Word-by-word captions",
      "category": "caption",
      "is_implemented": true,
      "renderer": "remotion_caption",
      "renderer_params": { "style": "hormozi" },
      "detection_aliases": [
        "word by word captions", "word_by_word", "hormozi captions",
        "karaoke captions", "animated captions", "highlight captions",
        "word highlight subtitle"
      ]
    },

    {
      "toolbox_id": "caption_sentence",
      "display_name": "Sentence captions",
      "category": "caption",
      "is_implemented": true,
      "renderer": "remotion_caption",
      "renderer_params": { "style": "minimal" },
      "detection_aliases": [
        "sentence captions", "standard subtitles", "minimal subtitles",
        "clean captions", "sentence subtitle"
      ]
    },

    {
      "toolbox_id": "hook_text_overlay",
      "display_name": "Hook text overlay",
      "category": "overlay",
      "is_implemented": true,
      "renderer": "remotion_title_card",
      "renderer_params": {
        "position": "center_top",
        "animation": "slide_down",
        "duration_pct": 0.15
      },
      "detection_aliases": [
        "hook text", "hook overlay", "opening text", "hook headline",
        "title card hook", "bold hook text", "opening title"
      ]
    },

    {
      "toolbox_id": "lower_third",
      "display_name": "Lower-third name card",
      "category": "overlay",
      "is_implemented": true,
      "renderer": "remotion_lower_third",
      "renderer_params": {
        "position": "bottom_left",
        "animation": "slide_up",
        "duration_s": 4.0
      },
      "detection_aliases": [
        "lower third", "lower-third", "name card", "speaker name",
        "name lower third", "title lower third", "chyron", "name tag overlay"
      ]
    },

    {
      "toolbox_id": "cta_overlay",
      "display_name": "CTA / end card overlay",
      "category": "overlay",
      "is_implemented": true,
      "renderer": "remotion_title_card",
      "renderer_params": {
        "position": "center",
        "animation": "fade_in",
        "zone": "cta"
      },
      "detection_aliases": [
        "call to action", "cta", "end card", "subscribe overlay",
        "follow overlay", "link in bio", "outro text"
      ]
    },

    {
      "toolbox_id": "transition_zoom",
      "display_name": "Zoom transition",
      "category": "transition",
      "is_implemented": true,
      "renderer": "ffmpeg_transition",
      "renderer_params": {
        "filter": "zoompan",
        "direction": "in",
        "duration_frames": 6
      },
      "detection_aliases": [
        "zoom transition", "zoom_in_cut", "zoom in cut", "push in",
        "smash zoom", "zoom cut", "punch in cut"
      ]
    },

    {
      "toolbox_id": "transition_whip_pan",
      "display_name": "Whip pan transition",
      "category": "transition",
      "is_implemented": true,
      "renderer": "ffmpeg_transition",
      "renderer_params": {
        "filter": "motion_blur_horizontal",
        "duration_frames": 4
      },
      "detection_aliases": [
        "whip pan", "whip cut", "swipe cut", "fast pan cut",
        "horizontal blur transition", "whip transition"
      ]
    },

    {
      "toolbox_id": "transition_hard_cut",
      "display_name": "Hard cut",
      "category": "transition",
      "is_implemented": true,
      "renderer": "ffmpeg_transition",
      "renderer_params": { "filter": "none" },
      "detection_aliases": [
        "hard cut", "jump cut", "straight cut", "direct cut", "cut only"
      ]
    },

    {
      "toolbox_id": "transition_crossfade",
      "display_name": "Crossfade",
      "category": "transition",
      "is_implemented": true,
      "renderer": "ffmpeg_transition",
      "renderer_params": {
        "filter": "xfade",
        "transition_type": "fade",
        "duration_s": 0.3
      },
      "detection_aliases": [
        "crossfade", "cross fade", "dissolve", "fade transition", "blend cut"
      ]
    },

    {
      "toolbox_id": "transition_glitch",
      "display_name": "Glitch cut",
      "category": "transition",
      "is_implemented": false,
      "renderer": null,
      "renderer_params": null,
      "detection_aliases": [
        "glitch cut", "glitch transition", "digital glitch", "artifact cut",
        "distortion cut", "rgb split cut"
      ]
    },

    {
      "toolbox_id": "sfx_whoosh",
      "display_name": "Whoosh on transition",
      "category": "sfx",
      "is_implemented": true,
      "renderer": "sfx_placement",
      "renderer_params": {
        "sfx_id": "whoosh",
        "offset_ms": -80,
        "volume": 0.7
      },
      "detection_aliases": [
        "whoosh", "swipe sound", "air sound", "transition sound",
        "whoosh sfx", "swoosh", "swish sound"
      ]
    },

    {
      "toolbox_id": "sfx_bass_drop",
      "display_name": "Bass drop on cut",
      "category": "sfx",
      "is_implemented": true,
      "renderer": "sfx_placement",
      "renderer_params": {
        "sfx_id": "sub_bass",
        "offset_ms": 0,
        "volume": 0.9
      },
      "detection_aliases": [
        "bass drop", "sub bass", "impact bass", "bass hit",
        "heavy bass", "thud", "bass impact"
      ]
    },

    {
      "toolbox_id": "sfx_riser",
      "display_name": "Riser before hook",
      "category": "sfx",
      "is_implemented": true,
      "renderer": "sfx_placement",
      "renderer_params": {
        "sfx_id": "riser",
        "offset_ms": -1500,
        "volume": 0.6
      },
      "detection_aliases": [
        "riser", "build up", "tension build", "anticipation sound",
        "rising tone", "swoosh up"
      ]
    },

    {
      "toolbox_id": "sfx_impact",
      "display_name": "Impact hit",
      "category": "sfx",
      "is_implemented": true,
      "renderer": "sfx_placement",
      "renderer_params": {
        "sfx_id": "impact",
        "offset_ms": 0,
        "volume": 0.8
      },
      "detection_aliases": [
        "impact", "hit sound", "punch", "impact sound",
        "thump", "boom", "crash hit"
      ]
    },

    {
      "toolbox_id": "music_duck",
      "display_name": "Music ducks under voice",
      "category": "audio",
      "is_implemented": true,
      "renderer": "audio_sidechain",
      "renderer_params": {
        "duck_ratio": 8,
        "attack_ms": 5,
        "release_ms": 200,
        "threshold": 0.05
      },
      "detection_aliases": [
        "music ducking", "duck", "auto duck", "music under voice",
        "music drops under speech", "sidechain", "voice over music"
      ]
    },

    {
      "toolbox_id": "color_warm",
      "display_name": "Warm color grade",
      "category": "color",
      "is_implemented": true,
      "renderer": "lut_apply",
      "renderer_params": { "lut": "cinematic_warm" },
      "detection_aliases": [
        "warm grade", "warm color", "warm tone", "golden tone",
        "warm cinematic", "orange teal", "warm lut"
      ]
    },

    {
      "toolbox_id": "color_cold",
      "display_name": "Cold color grade",
      "category": "color",
      "is_implemented": true,
      "renderer": "lut_apply",
      "renderer_params": { "lut": "cinematic_cold" },
      "detection_aliases": [
        "cold grade", "cool tone", "blue tone", "cold color",
        "desaturated", "cool cinematic", "teal lut"
      ]
    },

    {
      "toolbox_id": "color_bw",
      "display_name": "Black and white",
      "category": "color",
      "is_implemented": true,
      "renderer": "lut_apply",
      "renderer_params": { "lut": "bw" },
      "detection_aliases": [
        "black and white", "grayscale", "monochrome", "b&w",
        "desaturated black white", "bw filter"
      ]
    },

    {
      "toolbox_id": "color_high_contrast",
      "display_name": "High contrast / punchy",
      "category": "color",
      "is_implemented": true,
      "renderer": "lut_apply",
      "renderer_params": { "lut": "high_contrast" },
      "detection_aliases": [
        "high contrast", "punchy", "vivid", "contrasty",
        "deep blacks", "crushed blacks", "boosted contrast"
      ]
    },

    {
      "toolbox_id": "broll_illustrative",
      "display_name": "Illustrative B-roll",
      "category": "broll",
      "is_implemented": true,
      "renderer": "broll_resolver",
      "renderer_params": { "match_strategy": "semantic_search" },
      "detection_aliases": [
        "b-roll", "broll", "cutaway", "illustrative footage",
        "supporting footage", "insert shot", "supplementary clip"
      ]
    },

    {
      "toolbox_id": "broll_reaction",
      "display_name": "Reaction cut B-roll",
      "category": "broll",
      "is_implemented": true,
      "renderer": "broll_resolver",
      "renderer_params": { "match_strategy": "reaction_shot" },
      "detection_aliases": [
        "reaction shot", "reaction cut", "talking head reaction",
        "face reaction", "response shot"
      ]
    },

    {
      "toolbox_id": "zoom_ken_burns",
      "display_name": "Ken Burns slow zoom",
      "category": "motion",
      "is_implemented": true,
      "renderer": "ffmpeg_motion",
      "renderer_params": {
        "type": "ken_burns",
        "scale_from": 1.0,
        "scale_to": 1.08,
        "duration_pct": 1.0
      },
      "detection_aliases": [
        "ken burns", "slow zoom", "subtle zoom", "static shot zoom",
        "gentle zoom", "documentary zoom"
      ]
    },

    {
      "toolbox_id": "jump_cut_pacing",
      "display_name": "Jump-cut pacing (silence removal)",
      "category": "pacing",
      "is_implemented": true,
      "renderer": "silence_remover",
      "renderer_params": {
        "min_silence_ms": 400,
        "threshold_db": -35
      },
      "detection_aliases": [
        "jump cut", "jump cuts", "silence removed", "tight cut",
        "no pauses", "fast pacing", "tightly edited"
      ]
    }

  ]
}
```

---

## Capability Registry Python Module

### `apps/api/app/services/capability_registry.py`

```python
import json, os
from functools import lru_cache
from difflib import SequenceMatcher

REGISTRY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "data", "capability_registry.json"
)

@lru_cache(maxsize=1)
def load_registry() -> dict:
    with open(REGISTRY_PATH) as f:
        data = json.load(f)
    # Build alias lookup: alias_lower → capability dict
    alias_map = {}
    for cap in data["capabilities"]:
        for alias in cap["detection_aliases"]:
            alias_map[alias.lower()] = cap
        alias_map[cap["toolbox_id"].lower()] = cap
        alias_map[cap["display_name"].lower()] = cap
    data["_alias_map"] = alias_map
    return data


def normalize_effect_to_toolbox_id(raw_description: str) -> dict | None:
    """
    Takes a free-text effect description from the vision model and returns
    the matching capability dict, or None if no match found.

    Matching strategy:
    1. Exact alias match (fastest, most reliable)
    2. Fuzzy substring match (handles minor phrasing variations)
    3. Return None if confidence < 0.65 (goes to gap report as 'unknown')
    """
    registry = load_registry()
    alias_map = registry["_alias_map"]
    raw_lower = raw_description.lower().strip()

    # 1. Exact match
    if raw_lower in alias_map:
        return alias_map[raw_lower]

    # 2. Substring match
    for alias, cap in alias_map.items():
        if alias in raw_lower or raw_lower in alias:
            return cap

    # 3. Fuzzy match — try all aliases, pick best score
    best_cap, best_score = None, 0.0
    for alias, cap in alias_map.items():
        score = SequenceMatcher(None, raw_lower, alias).ratio()
        if score > best_score:
            best_score, best_cap = score, cap

    if best_score >= 0.65:
        return best_cap

    return None  # genuinely unknown — goes to gap report as unresolvable


def get_capability(toolbox_id: str) -> dict | None:
    registry = load_registry()
    for cap in registry["capabilities"]:
        if cap["toolbox_id"] == toolbox_id:
            return cap
    return None


def get_implemented_capabilities() -> list[dict]:
    return [c for c in load_registry()["capabilities"] if c["is_implemented"]]


def get_unimplemented_capabilities() -> list[dict]:
    return [c for c in load_registry()["capabilities"] if not c["is_implemented"]]


def build_gap_report(detected_effects: list[str]) -> dict:
    """
    Given a list of raw effect descriptions from the vision model,
    returns a structured gap report used by the UI card and apply flow.

    Returns:
    {
      "total_detected": 5,
      "implemented": [{"toolbox_id": ..., "display_name": ..., "raw_description": ...}],
      "partial": [...],       # detected and in registry but is_implemented=False
      "unresolvable": [...],  # no registry match at all
      "coverage_pct": 80,
    }
    """
    implemented, partial, unresolvable = [], [], []

    for raw in detected_effects:
        cap = normalize_effect_to_toolbox_id(raw)
        if cap is None:
            unresolvable.append({"raw_description": raw})
        elif cap["is_implemented"]:
            implemented.append({
                "toolbox_id": cap["toolbox_id"],
                "display_name": cap["display_name"],
                "category": cap["category"],
                "raw_description": raw,
                "renderer": cap["renderer"],
            })
        else:
            partial.append({
                "toolbox_id": cap["toolbox_id"],
                "display_name": cap["display_name"],
                "category": cap["category"],
                "raw_description": raw,
                "reason": "Renderer not yet built for this effect",
            })

    total = len(detected_effects)
    coverage = int((len(implemented) / total) * 100) if total else 0

    return {
        "total_detected": total,
        "implemented": implemented,
        "partial": partial,
        "unresolvable": unresolvable,
        "coverage_pct": coverage,
    }
```

---

## Wire Registry into StyleExtractor

### `apps/api/app/services/style_extractor.py` — update `_build_effect_inventory()`

Find the existing `_build_effect_inventory` method (or wherever raw effect names
come from the vision model output) and add normalization before storing:

```python
from .capability_registry import normalize_effect_to_toolbox_id, build_gap_report

def _build_effect_inventory(self, raw_effects: list[str]) -> dict:
    """
    Normalizes raw vision-model effect descriptions into toolbox IDs and
    produces the gap report. Replaces or supplements the existing inventory
    builder — keep all existing logic, just add normalization on top.
    """
    gap_report = build_gap_report(raw_effects)

    # Build the effect_inventory structure the existing code expects,
    # now backed by the registry so toolbox_id is always a real, known ID
    inventory_items = []

    for item in gap_report["implemented"]:
        inventory_items.append({
            "toolbox_id": item["toolbox_id"],
            "display_name": item["display_name"],
            "category": item["category"],
            "status": "supported",       # was being set to something undefined before
            "renderer": item["renderer"],
        })

    for item in gap_report["partial"]:
        inventory_items.append({
            "toolbox_id": item["toolbox_id"],
            "display_name": item["display_name"],
            "category": item["category"],
            "status": "partial",
            "renderer": None,
            "partial_reason": item["reason"],
        })

    for item in gap_report["unresolvable"]:
        inventory_items.append({
            "toolbox_id": None,
            "display_name": item["raw_description"],
            "category": "unknown",
            "status": "unsupported",
            "renderer": None,
        })

    return {
        "items": inventory_items,
        "gap_report": gap_report,
        "coverage_pct": gap_report["coverage_pct"],
    }
```

---

## Wire Registry into RecipeApplicator

### `apps/api/app/services/recipe_applicator.py` — update the effect dispatch

Find the existing dispatch logic (where `edit_recipe.events` are iterated and
applied) and add a registry lookup before attempting to apply:

```python
from .capability_registry import get_capability

def _apply_single_event(self, event: dict, user_video_path: str, work_dir: str):
    """
    Existing event dispatch, hardened with registry check.
    """
    toolbox_id = event.get("toolbox_id") or event.get("type")
    if not toolbox_id:
        self._log(f"Skipping event with no toolbox_id: {event}")
        return

    cap = get_capability(toolbox_id)

    if cap is None:
        self._log(f"SKIP: {toolbox_id} not in capability registry — unknown effect")
        self._record_skipped(toolbox_id, reason="not_in_registry")
        return

    if not cap["is_implemented"]:
        self._log(f"SKIP: {toolbox_id} detected but renderer not built (partial)")
        self._record_skipped(toolbox_id, reason="renderer_not_implemented")
        return

    # Strength gate: skip effects below the user's chosen strength threshold
    event_confidence = event.get("confidence", 1.0)
    if event_confidence < self.strength:
        self._log(f"SKIP: {toolbox_id} confidence {event_confidence} < strength {self.strength}")
        self._record_skipped(toolbox_id, reason="below_strength_threshold")
        return

    renderer = cap["renderer"]
    renderer_params = {**cap["renderer_params"], **event.get("params", {})}

    # Dispatch to the correct renderer
    if renderer == "remotion_caption":
        self._apply_remotion_caption(event, renderer_params, work_dir)
    elif renderer == "remotion_title_card":
        self._apply_remotion_title_card(event, renderer_params, work_dir)
    elif renderer == "remotion_lower_third":
        self._apply_remotion_lower_third(event, renderer_params, work_dir)
    elif renderer == "ffmpeg_transition":
        self._apply_ffmpeg_transition(event, renderer_params, user_video_path, work_dir)
    elif renderer == "sfx_placement":
        self._apply_sfx(event, renderer_params)
    elif renderer == "lut_apply":
        self._apply_lut(event, renderer_params, work_dir)
    elif renderer == "audio_sidechain":
        self._apply_sidechain(event, renderer_params)
    elif renderer == "broll_resolver":
        self._apply_broll_slot(event, renderer_params)
    elif renderer == "ffmpeg_motion":
        self._apply_ffmpeg_motion(event, renderer_params, work_dir)
    elif renderer == "silence_remover":
        self._apply_silence_removal(event, renderer_params, user_video_path)
    else:
        self._log(f"SKIP: {toolbox_id} has unknown renderer type '{renderer}'")
        self._record_skipped(toolbox_id, reason="unknown_renderer")


def _record_skipped(self, toolbox_id: str, reason: str):
    self.skipped_effects.append({"toolbox_id": toolbox_id, "reason": reason})
```

---

## Checklist for Cursor — Part 1

- [ ] `apps/api/data/capability_registry.json` — create with the full catalog above
- [ ] `apps/api/app/services/capability_registry.py` — the four functions:
      `load_registry`, `normalize_effect_to_toolbox_id`, `build_gap_report`,
      `get_capability`
- [ ] Update `_build_effect_inventory` in `style_extractor.py` to use
      `build_gap_report` — keep all existing logic, add normalization on top
- [ ] Update `RecipeApplicator._apply_single_event` to do a registry lookup
      before dispatching — add `_record_skipped` tracking
- [ ] `self.skipped_effects = []` initialized in `RecipeApplicator.__init__`
- [ ] `self.strength` (float 0.0–1.0) already exists in RecipeApplicator — confirm
      its current name and use it for the confidence gate
- [ ] Registry `_alias_map` is built once via `@lru_cache` — no repeated file I/O
- [ ] Add `coverage_pct` to the response of
      `GET /api/v1/projects/{id}/style-library/{preset_id}` so the UI card can
      read it directly instead of computing it client-side
- [ ] Do NOT yet implement the renderer functions (`_apply_remotion_caption`,
      `_apply_remotion_lower_third`, etc.) — those are Part 2