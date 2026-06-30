# Phase 1 — Style Intelligence v2: The Director's Blueprint

> **This is the current version of Phase 1 and supersedes `SKILL_v1_original.md`
> in this folder** (kept alongside for reference only — do not implement from it).
> It keeps everything from v1 — Gemini native video analysis, the slot-level
> `SlotRequirement` schema, and the matching contract Phase 2 depends on — and adds
> two things that were missing: **audio/music profiling** of the reference, and
> a reframing of the whole output as one coherent **Director's Blueprint**
> rather than a flat style-properties JSON.

## Why this upgrade matters

A reference video's "feel" is not just its visuals — it's equally the music genre,
the SFX hits on transitions (whooshes, riser stingers, bass drops), how music ducks
under spoken dialogue, and the pacing logic tying cuts to emotional beats. The
original Phase 1 only looked at frames. This version makes one Gemini call that
reasons about the whole reference holistically — visual style, audio character,
and editing rhythm together — because a real video editor doesn't think about
those as separate problems, and neither should the system.

The output is still consumed by Phase 2 exactly the same way (slots with
`requirement` objects), so nothing downstream breaks. We are deepening what's
inside the blueprint, not changing its shape at the integration boundary.

---

## Updated Schema — Adds Audio Profile + Director Notes

```python
# backend/app/schemas/template.py
from pydantic import BaseModel
from typing import Optional, Literal

class SlotRequirement(BaseModel):
    shot_type: str
    energy_level: str
    min_duration: float
    max_duration: float
    needs_face: bool = False
    setting_hint: Optional[str] = None
    description: str

class TemplateSlot(BaseModel):
    slot_id: str
    type: Literal["video_placeholder", "text_overlay", "image_placeholder", "logo_placeholder"]
    start: float
    end: float
    label: str
    requirement: Optional[SlotRequirement] = None
    # NEW: per-slot audio direction, mirrors how an editor actually thinks about a cut
    audio_cue: Optional[str] = None   # e.g. "bass drop on this cut", "music ducks for VO"

class AudioProfile(BaseModel):
    """NEW — what the reference video sounds like, not just looks like."""
    music_genre: str                  # "lofi hip-hop", "epic trailer", "corporate upbeat", "none"
    music_energy_arc: str             # "builds steadily", "high throughout", "calm with one peak"
    has_sfx_hits: bool                # whooshes, risers, impact sounds on cuts
    sfx_style: Optional[str] = None   # "vine boom on punchlines", "subtle whoosh on transitions"
    music_ducking_behavior: str       # "music drops significantly under VO", "music stays constant"
    voice_emotion_arc: str            # "starts calm, becomes urgent", "consistently energetic"

class StyleTemplate(BaseModel):
    version: str = "2.1"
    source_url: Optional[str] = None
    duration: float
    aspect_ratio: str
    color_palette: list[str]
    pacing: Literal["fast", "medium", "slow"]
    visual_style: str
    caption_style: dict
    audio_profile: AudioProfile        # NEW — replaces the old flat "music_mood" string
    director_notes: list[str]          # NEW — free-text beats, see below
    slots: list[TemplateSlot]
    transitions: list[dict]
```

### What `director_notes` looks like

This mimics a human creative director's shot-by-shot thinking, in plain language,
attached to the template for transparency and for use in Phase 6's render step:

```json
"director_notes": [
  "0.0s-3.5s: Hook delivered with high energy direct-to-camera — cut hard on the punchline, no fade",
  "3.5s: Whip-pan style transition with a whoosh SFX into B-roll",
  "8.0s-22.0s: Music drops to background, mostly VO-driven, calmer pacing",
  "22.0s: Sudden tempo increase signals the CTA section — bring music back up"
]
```

---

## Updated Analysis Prompt

### `backend/app/processors/gemini_style_analyzer.py` (prompt update; surrounding function structure from v1 is unchanged)

```python
_FINGERPRINT_PROMPT = """You are an expert video editor AND sound designer analyzing
a reference video to create a reusable EDITING BLUEPRINT. Someone with ZERO video
editing skills will use this blueprint to make their own version by swapping in
their own footage, text, and using your suggested music style — so think like a
creative director giving precise instructions to a production team, covering both
what is SEEN and what is HEARD.

Watch and LISTEN to the full video. Return ONLY valid JSON (no markdown) in this
exact schema:

{
  "duration": 30.0,
  "aspect_ratio": "9:16",
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "pacing": "fast|medium|slow",
  "visual_style": "minimalist|bold|cinematic|ugc|corporate",
  "caption_style": {
    "position": "bottom_third|center|top_third",
    "animation": "word_by_word|sentence|fade",
    "has_highlight": true,
    "highlight_color": "#hex or null",
    "has_emoji": true
  },
  "audio_profile": {
    "music_genre": "describe the genre/mood of any background music, or 'none'",
    "music_energy_arc": "builds steadily|high throughout|calm with one peak|none",
    "has_sfx_hits": true,
    "sfx_style": "describe any whooshes, risers, bass drops, impact sounds on cuts, or null",
    "music_ducking_behavior": "music drops significantly under VO|music stays constant|no music",
    "voice_emotion_arc": "describe how the speaker's tone/energy changes through the video"
  },
  "director_notes": [
    "0.0s-3.5s: description of what happens and why, in plain creative-director language",
    "..."
  ],
  "slots": [
    {
      "slot_id": "clip_1",
      "type": "video_placeholder",
      "start": 0.0,
      "end": 3.5,
      "label": "Opening hook",
      "audio_cue": "describe any specific sound effect or music behavior tied to this exact slot, or null",
      "requirement": {
        "shot_type": "talking_head",
        "energy_level": "high_energy",
        "min_duration": 3.0,
        "max_duration": 4.0,
        "needs_face": true,
        "setting_hint": "indoor or studio",
        "description": "Energetic close-up of speaker reacting directly to camera"
      }
    }
  ],
  "transitions": [
    {"at": 3.5, "effect": "zoom_in"}
  ]
}

Rules:
- shot_type must be one of: talking_head, b_roll, screen_recording, product_shot,
  text_card, logo, establishing_shot, action, interview
- energy_level must be one of: calm, moderate, high_energy
- Be SPECIFIC in every description field — an automated system will use these
  exact words to search for or generate matching content
- Every video_placeholder slot MUST have a requirement object
- audio_cue should be null unless there is a genuinely distinct sound moment tied
  to that specific slot (don't force one onto every slot)
- director_notes should read like real shot notes a senior editor would leave for
  a junior editor — concrete, timestamped, actionable
"""
```

The rest of `analyze_reference_video()` (Gemini file upload, polling for
processing, JSON parsing, cleanup) is unchanged from v1 — only the prompt and
the schema it populates have grown richer.

---

## How `audio_profile` and `director_notes` Get Used Downstream

This phase's job is to **produce** the richer blueprint. Fully consuming it (e.g.
auto-selecting a matching track from the music library by genre/energy_arc, or
applying sidechain ducking automatically based on `music_ducking_behavior`) is
Phase 6's responsibility at render time. This is called out explicitly so Cursor
doesn't try to half-implement audio application inside this phase.

```python
# Phase 6's template_renderer.py should read template["audio_profile"] to:
# 1. Pick a music_library track matching music_genre + music_energy_arc
#    (extends backend/app/processors/music_library.py from Phase 5 — reuse the
#    same mood-tagged bundled library rather than building a second one)
# 2. Apply sidechain ducking (reuse Phase 5's add_background_music function)
#    only when music_ducking_behavior indicates the reference video did so
# 3. Surface director_notes as a read-only "How this style works" panel in the
#    UI so curious users can see what was detected, without needing to act on it
```

---

## Checklist for Cursor

- [ ] `backend/app/schemas/template.py` — add `AudioProfile`, extend `TemplateSlot`
      with `audio_cue`, extend `StyleTemplate` with `audio_profile` and
      `director_notes`, bump `version` to `"2.1"`
- [ ] `gemini_style_analyzer.py` — replace `_FINGERPRINT_PROMPT` with the version
      above; no other changes to the function body are required
- [ ] Confirm Gemini's video understanding call actually processes the audio
      track, not just frames — verify against current Gemini API docs that
      `genai.upload_file()` + `generate_content()` includes audio reasoning for
      video inputs (this has been a moving target across Gemini API versions)
- [ ] Phase 2's matching logic (`asset_matcher.py`) needs NO changes — it already
      only reads `slot["requirement"]`, which is unchanged in shape
- [ ] Phase 6's `template_renderer.py` gets a new responsibility: read
      `audio_profile` to select/duck background music — implement this as part
      of Phase 6, not here
- [ ] Add a simple read-only "How this style works" UI panel (optional, low
      priority) that displays `director_notes` as a bulleted list — purely
      informational, builds user trust in what the system understood
- [ ] If Gemini's audio reasoning proves unreliable in practice during testing,
      document that limitation in `KNOWN_LIMITATIONS.md` (see Phase 8) rather
      than silently shipping a guessed `audio_profile`
- [ ] Delete or archive `SKILL_v1_original.md` once this version is fully
      implemented and verified working — keep the skills folder from
      accumulating confusing duplicate versions long-term
