# Phase 10 — Style Extractor Fix
## Part 3 of 3: Section-Anchor Timing, Music Bed Wire-Up, B-Roll Gap Resolution

> Prerequisite: Parts 1 and 2 must be implemented first.
> This part patches three specific broken behaviours in RecipeApplicator
> without changing its overall structure.

---

## Section A: Section-Anchor Timing

### The Problem

The existing proportional scaling (`start_s = start_pct × user_duration`) produces
wrong results when the user's video is much longer than the reference. A hook
overlay at `start_pct=0.05` (first 5% of a 25s reference = 1.25s) maps to
`start_s = 0.05 × 180 = 9s` on a 3-minute user video — which is still fine. But
a mid-video graphic at `start_pct=0.5` maps to `90s` into a 3-minute video,
which may be editorially correct or completely wrong depending on the video's
structure. More importantly, a CTA at `start_pct=0.9` maps to `162s` on a 3-minute
video — fine. But on a 10-minute video it maps to `9 minutes in`, when most
creators put CTAs in the last 15–20 seconds regardless of video length.

The fix is **three timing zones** with different scaling rules:

- **Hook zone** (`start_pct` 0.0–0.20): always maps into the first 10 seconds of
  the user video, regardless of proportional math. Hook content must be early.
- **Body zone** (`start_pct` 0.20–0.80): proportional scaling within a clamped
  range (`10s` → `user_duration - 20s`). Keeps the body content spread across
  the middle section even for very long videos.
- **CTA zone** (`start_pct` 0.80–1.00): always maps into the last 15 seconds of
  the user video. CTAs belong at the end regardless of length.

### `apps/api/app/services/recipe_applicator.py` — add `_scale_timestamp()`

Replace or wrap the existing timestamp-scaling logic (wherever `start_s = start_pct × user_duration`
is computed) with this function:

```python
def _scale_timestamp(self, start_pct: float, end_pct: float,
                     user_duration: float) -> tuple[float, float]:
    """
    Maps reference video percentage positions to user video timestamps using
    section-anchor scaling rather than pure proportional scaling.

    Zones:
      Hook  (start_pct 0.00–0.20) → user 0s–10s
      Body  (start_pct 0.20–0.80) → user 10s–(user_duration - 20s)
      CTA   (start_pct 0.80–1.00) → user (user_duration - 20s)–user_duration

    Edge case: if user_duration < 30s, fall back to pure proportional scaling
    (the zones only help for long-form content).
    """
    # Fallback for short user videos — zones don't help here
    if user_duration < 30.0:
        return (
            round(start_pct * user_duration, 3),
            round(end_pct * user_duration, 3),
        )

    hook_end = 10.0
    cta_start = max(hook_end + 10.0, user_duration - 20.0)
    body_start = hook_end
    body_end = cta_start

    def map_pct(pct: float) -> float:
        if pct <= 0.20:
            # Hook zone: 0.00–0.20 maps to 0s–10s
            return round((pct / 0.20) * hook_end, 3)
        elif pct >= 0.80:
            # CTA zone: 0.80–1.00 maps to cta_start–user_duration
            zone_pct = (pct - 0.80) / 0.20
            return round(cta_start + zone_pct * (user_duration - cta_start), 3)
        else:
            # Body zone: 0.20–0.80 maps to body_start–body_end
            zone_pct = (pct - 0.20) / 0.60
            return round(body_start + zone_pct * (body_end - body_start), 3)

    scaled_start = map_pct(start_pct)
    scaled_end = map_pct(end_pct)

    # Ensure minimum duration is preserved (at least 1s for very compressed zones)
    if scaled_end - scaled_start < 1.0:
        scaled_end = scaled_start + max(1.0, (end_pct - start_pct) * user_duration)

    return scaled_start, scaled_end
```

### Where to call `_scale_timestamp`

Find every place in `RecipeApplicator` (or `edit_recipe.py`) where
`start_s = start_pct * user_duration` (or similar) is computed for individual
events, and replace with:

```python
# BEFORE:
start_s = event["start_pct"] * self.user_duration
end_s = event["end_pct"] * self.user_duration

# AFTER:
start_s, end_s = self._scale_timestamp(
    event["start_pct"], event["end_pct"], self.user_duration
)
event["start_s"] = start_s
event["end_s"] = end_s
```

> Important: jump-cut pacing (silence removal) runs first and changes
> `self.user_duration`. Call `_scale_timestamp` AFTER any jump-cut pass has
> updated `self.user_duration`, not before. The existing code already runs
> jump-cuts first — preserve that order.

### Determine zone for each event (passed to renderers)

```python
def _get_zone(self, start_pct: float) -> str:
    if start_pct <= 0.20:
        return "hook"
    elif start_pct >= 0.80:
        return "cta"
    return "body"
```

Attach `zone` to each event dict before dispatching so renderers
(e.g. `_apply_remotion_title_card`) can read it:

```python
event["zone"] = self._get_zone(event["start_pct"])
```

---

## Section B: Music Bed Wire-Up

### The Problem

`add_music_bed_timeline_clip` creates a `music` track placeholder clip with
`is_placeholder: True` and `asset_id: "synthetic"`. The clip is visible in the
timeline but silent — no actual audio track is selected. The music library from
Phase 5 already exists and is already tagged by mood, but nothing connects the
template's `audio_profile` to that library at apply time.

### Fix: `apps/api/app/services/recipe_applicator.py` — update `_apply_music_bed()`

Find the existing `add_music_bed_timeline_clip` call (likely in a method that
handles the `music_bed` event type from the recipe) and replace the placeholder
logic:

```python
def _apply_music_bed(self, event: dict, params: dict):
    """
    Selects a real track from the bundled music library and writes it as
    a concrete (non-placeholder) music timeline clip.
    """
    from .music_library import pick_music_for_mood, get_music_track_metadata
    import shutil, uuid

    # Read audio profile from the template — set by Phase 1's Director's Blueprint
    audio_profile = self.template.get("audio_profile", {})
    music_genre = audio_profile.get("music_genre", "upbeat")
    energy_arc = audio_profile.get("music_energy_arc", "high throughout")

    # Determine mood from genre + energy_arc combination
    mood = self._map_genre_to_mood(music_genre, energy_arc)

    track_path = pick_music_for_mood(mood)
    if not track_path or not os.path.exists(track_path):
        # No matching track — keep the placeholder rather than failing the whole apply
        self._log(f"music_bed: no track found for mood '{mood}', leaving placeholder")
        self._record_skipped("music_bed", reason="no_matching_track")
        return

    # Copy track to MinIO project storage so it has a real asset_id
    track_filename = os.path.basename(track_path)
    asset_id = str(uuid.uuid4())
    dest_key = f"projects/{self.project_id}/assets/music/{asset_id}_{track_filename}"
    self.storage.put_file(dest_key, track_path, "audio/mpeg")

    track_meta = get_music_track_metadata(track_path)

    # Write a REAL (non-placeholder) timeline music clip
    self.timeline_writer.add_music_clip(
        asset_id=asset_id,
        storage_key=dest_key,
        start_s=0.0,
        end_s=self.user_duration,
        volume=audio_profile.get("music_volume", 0.2),
        duck_under_voice=audio_profile.get("music_ducking_behavior") == "music drops significantly under VO",
        label=f"{mood.title()} music — {track_meta.get('title', track_filename)}",
        is_placeholder=False,
    )

    self._record_applied("music_bed", {
        "mood": mood, "track": track_filename, "asset_id": asset_id,
    })
    self._log(f"music_bed: placed '{track_filename}' for mood '{mood}'")


def _map_genre_to_mood(self, genre: str, energy_arc: str) -> str:
    """
    Maps Gemini's free-text genre/energy description to the mood tags
    used by music_library.py (upbeat, calm, dramatic, corporate).
    """
    genre_lower = genre.lower()
    energy_lower = energy_arc.lower()

    if any(w in genre_lower for w in ["epic", "trailer", "cinematic", "dramatic", "intense"]):
        return "dramatic"
    if any(w in genre_lower for w in ["corporate", "professional", "business", "clean"]):
        return "corporate"
    if any(w in genre_lower for w in ["lofi", "chill", "ambient", "calm", "soft", "acoustic"]):
        return "calm"
    if any(w in genre_lower for w in ["upbeat", "energetic", "pop", "hip hop", "hype", "fun"]):
        return "upbeat"

    # Fall back to energy_arc
    if "calm" in energy_lower or "low" in energy_lower:
        return "calm"
    if "build" in energy_lower or "peak" in energy_lower or "dramatic" in energy_lower:
        return "dramatic"

    return "upbeat"  # safest general default
```

### `apps/api/app/processors/music_library.py` — add `get_music_track_metadata()`

The existing `pick_music_for_mood()` returns a file path. Add a companion function
that returns display metadata for the timeline clip label:

```python
def get_music_track_metadata(track_path: str) -> dict:
    """Returns basic metadata for a bundled track file."""
    filename = os.path.basename(track_path)
    name_without_ext = os.path.splitext(filename)[0]
    # Convert filename like "upbeat_2" to "Upbeat 2"
    title = name_without_ext.replace("_", " ").title()
    return {"title": title, "filename": filename}
```

### Sidechain ducking at render time

When `duck_under_voice=True` is set on the music clip, the FFmpeg render step
(in `render_video.py` or wherever the final Celery render happens) should apply
sidechain compression. Find the existing audio mixing in the render pipeline and
add:

```python
def _mix_audio_with_ducking(voice_video_path: str, music_path: str,
                              output_path: str, music_volume: float = 0.2) -> str:
    """
    Mixes voice audio from the main video with background music,
    automatically ducking the music under speech.
    Reuses the same FFmpeg sidechain filter as Phase 5's add_background_music.
    """
    import subprocess
    from ..config import settings

    filter_complex = (
        f"[1:a]volume={music_volume}[music];"
        f"[0:a][music]sidechaincompress="
        f"threshold=0.05:ratio=8:attack=5:release=200[ducked];"
        f"[0:a][ducked]amix=inputs=2:duration=first[aout]"
    )
    subprocess.run([
        settings.ffmpeg_path,
        "-i", voice_video_path,
        "-i", music_path,
        "-filter_complex", filter_complex,
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
        output_path, "-y",
    ], check=True, capture_output=True)
    return output_path
```

---

## Section C: B-Roll Gap Resolution Wire-Up

### The Problem

When `RecipeApplicator` creates a B-roll slot (a `broll` event from the recipe),
it creates a placeholder timeline clip. Phase 2's `match_template_to_library`
already exists and can find or flag a matching asset — but it is never called from
`RecipeApplicator`. The result is that every B-roll slot stays as a silent
placeholder that the user has to manually resolve, even when a perfect match
exists in their library.

### Fix: `apps/api/app/services/recipe_applicator.py` — update `_apply_broll_slot()`

```python
async def _apply_broll_slot(self, event: dict, params: dict):
    """
    Resolves a B-roll slot by:
    1. Building a SlotRequirement from the event's description and category
    2. Running Phase 2's match_template_to_library against the workspace library
    3. If matched/partial: write a real asset clip to the timeline
    4. If missing: write a placeholder with is_placeholder=True and
       gap_resolution_needed=True so the Phase 2 UI can pick it up
    """
    from ..processors.asset_matcher import score_asset_against_requirement
    from ..schemas.template import SlotRequirement
    from sqlalchemy import select
    from ..models.asset_library import LibraryAsset

    description = event.get("description", "") or event.get("label", "B-roll clip")
    shot_type = params.get("shot_type", "b_roll")
    energy = params.get("energy_level", "moderate")
    start_s, end_s = event["start_s"], event["end_s"]
    slot_duration = end_s - start_s

    req = SlotRequirement(
        shot_type=shot_type,
        energy_level=energy,
        min_duration=max(1.0, slot_duration * 0.6),
        max_duration=slot_duration * 1.5,
        needs_face=False,
        description=description,
    )

    # Load workspace library assets
    async with self.db_session() as db:
        result = await db.execute(
            select(LibraryAsset).where(
                LibraryAsset.workspace_id == self.workspace_id,
                LibraryAsset.asset_type == "video",
            )
        )
        library = [
            {"id": a.id, "asset_type": a.asset_type,
             "tags": a.tags, "storage_key": a.storage_key}
            for a in result.scalars().all()
        ]

    # Score all candidates
    scored = [
        (asset, score_asset_against_requirement(asset["tags"], req))
        for asset in library
    ]
    scored.sort(key=lambda x: x[1], reverse=True)

    MATCH_THRESHOLD = 0.75
    PARTIAL_THRESHOLD = 0.45

    if scored and scored[0][1] >= MATCH_THRESHOLD:
        best_asset, score = scored[0]
        match_status = "matched"
    elif scored and scored[0][1] >= PARTIAL_THRESHOLD:
        best_asset, score = scored[0]
        match_status = "partial"
    else:
        best_asset, score = None, 0.0
        match_status = "missing"

    slot_id = event.get("slot_id") or f"broll_{int(start_s*100)}"

    if match_status in ("matched", "partial"):
        # Write a real (or best-effort) asset clip to the timeline
        signed_url = self.storage.get_presigned_url(best_asset["storage_key"], expires=86400)
        self.timeline_writer.add_broll_clip(
            slot_id=slot_id,
            asset_id=best_asset["id"],
            storage_key=best_asset["storage_key"],
            asset_url=signed_url,
            start_s=start_s,
            end_s=end_s,
            match_status=match_status,
            match_score=round(score, 3),
            description=description,
            is_placeholder=match_status == "partial",  # partial shown as soft placeholder
            gap_resolution_needed=match_status == "partial",
        )
        self._record_applied("broll", {
            "slot_id": slot_id, "match_status": match_status,
            "asset_id": best_asset["id"], "score": score,
        })
        self._log(f"broll slot '{slot_id}': {match_status} (score={score:.2f})")

    else:
        # Missing — write placeholder with gap_resolution_needed flag
        self.timeline_writer.add_broll_placeholder(
            slot_id=slot_id,
            start_s=start_s,
            end_s=end_s,
            description=description,
            requirement=req.dict(),
            gap_resolution_needed=True,
            workspace_id=self.workspace_id,
        )
        self._record_applied("broll", {
            "slot_id": slot_id, "match_status": "missing",
            "gap_resolution_needed": True,
        })
        self._log(f"broll slot '{slot_id}': missing — placeholder created for gap resolver")
```

### Timeline writer additions

The `timeline_writer` (whatever class writes `timelineStore` clips) needs two new
methods. Find where `add_sfx_timeline_clip` is defined and add alongside it:

```python
def add_broll_clip(self, slot_id: str, asset_id: str, storage_key: str,
                    asset_url: str, start_s: float, end_s: float,
                    match_status: str, match_score: float, description: str,
                    is_placeholder: bool = False, gap_resolution_needed: bool = False):
    """Adds a B-roll clip to the video/overlay track, may be a soft placeholder if partial."""
    clip = {
        "id": f"broll_{slot_id}",
        "track": "video_overlay",
        "asset_id": asset_id,
        "storage_key": storage_key,
        "asset_url": asset_url,
        "start_s": start_s,
        "end_s": end_s,
        "is_placeholder": is_placeholder,
        "gap_resolution_needed": gap_resolution_needed,
        "gap_metadata": {
            "slot_id": slot_id,
            "match_status": match_status,
            "match_score": match_score,
            "description": description,
        },
    }
    self.clips.append(clip)

def add_broll_placeholder(self, slot_id: str, start_s: float, end_s: float,
                           description: str, requirement: dict,
                           gap_resolution_needed: bool, workspace_id: str):
    """Adds a missing B-roll placeholder that the gap resolver UI will act on."""
    clip = {
        "id": f"broll_{slot_id}",
        "track": "video_overlay",
        "asset_id": "synthetic",
        "start_s": start_s,
        "end_s": end_s,
        "is_placeholder": True,
        "gap_resolution_needed": gap_resolution_needed,
        "gap_metadata": {
            "slot_id": slot_id,
            "match_status": "missing",
            "match_score": 0.0,
            "description": description,
            "requirement": requirement,
            "workspace_id": workspace_id,
        },
    }
    self.clips.append(clip)
```

### Gap Resolver Badge — Surface Missing B-Roll in the UI

After apply completes, if any B-roll clips have `gap_resolution_needed=True`, show
a count badge on the timeline and in the Effects drawer so the user knows there's
action needed:

```tsx
// apps/web/src/components/editor/TimelineBrollGapBadge.tsx
import { useTimelineStore } from "@/store/timelineStore";

export function BrollGapBadge() {
  const clips = useTimelineStore(s => s.clips);
  const missing = clips.filter(c => c.gap_resolution_needed && c.gap_metadata?.match_status === "missing");

  if (!missing.length) return null;

  return (
    <button
      className="flex items-center gap-1.5 bg-yellow-100 border border-yellow-300 text-yellow-800
                 text-xs px-3 py-1.5 rounded-full"
      onClick={() => {
        // Open the gap resolver panel — same Phase 2 TemplateGapResolver
        // but reading from timeline clips instead of template slots
      }}
    >
      <span className="w-2 h-2 rounded-full bg-yellow-500" />
      {missing.length} B-roll clip{missing.length !== 1 ? 's' : ''} need footage
    </button>
  );
}
```

Place `<BrollGapBadge />` in the timeline toolbar so it appears whenever there
are unresolved B-roll slots after a template apply.

---

## Section D: Apply Flow Summary and Order of Operations

After Parts 1-3, the complete `RecipeApplicator.apply()` order must be:

```
1. Pre-apply validation
   └── Check all events have toolbox_ids (Part 1 normalization already ran at extraction time)
   └── Build apply plan: filter events by strength threshold
   └── Return apply plan to frontend → show ApplyConfirmPanel (Part 2)
   └── User confirms → continue

2. Jump-cut pacing (if in recipe at strength >= 0.5)
   └── Runs silence removal on user video
   └── Updates self.user_duration to post-cut duration

3. Scale all event timestamps using _scale_timestamp() (Part 3A)
   └── Runs AFTER jump-cut pass so user_duration is correct
   └── Attaches zone ("hook"/"body"/"cta") to each event

4. Color grading (global — applies to whole video)
   └── _apply_lut()

5. B-roll gap resolution (Part 3C) — async
   └── _apply_broll_slot() for each broll event
   └── Writes real clips or flagged placeholders to timeline

6. Transition effects
   └── _apply_ffmpeg_transition() at scaled+snapped timestamps

7. Motion effects (ken burns, zoom)
   └── _apply_ffmpeg_motion()

8. Text overlays (Part 2 renderers)
   └── _apply_remotion_lower_third()
   └── _apply_remotion_title_card() for hook and CTA zones

9. Caption style (global)
   └── _apply_remotion_caption() or existing caption renderer

10. SFX placement
    └── _apply_sfx() at scaled transition timestamps

11. Music bed (Part 3B)
    └── _apply_music_bed()
    └── Writes real track or logs skip

12. Build apply_summary()
    └── Return to frontend: applied_count, skipped list, gap badges

13. Trigger BrollGapBadge if any broll placeholders remain
```

This order matters because:
- Jump-cuts change duration → must run before timestamp scaling
- Color is global → order relative to cuts doesn't matter but running early is convention
- Transitions must snap to clip boundaries → must run after jump-cuts reshape the clips
- Text overlays run after transitions so they composite correctly
- Music bed last because it needs the final `user_duration` for full-span placement

---

## Checklist for Cursor — Part 3

### Section A: Timing

- [ ] `_scale_timestamp(start_pct, end_pct, user_duration)` added to
      `RecipeApplicator` with the three-zone logic above
- [ ] `_get_zone(start_pct)` helper added
- [ ] Every event's `start_s` / `end_s` computation replaced with
      `_scale_timestamp` call — search for all occurrences of
      `start_pct * self.user_duration` or similar in the file
- [ ] `zone` attached to each event dict before dispatch
- [ ] `_scale_timestamp` called AFTER the jump-cut pass — confirm the call
      site ordering matches the apply order table above
- [ ] Unit test: reference 25s → user 180s: hook at `start_pct=0.05` must
      land between 0s and 10s, CTA at `start_pct=0.90` must land within last 20s

### Section B: Music Bed

- [ ] `_apply_music_bed` updated to call `pick_music_for_mood` from
      `music_library.py` using `template["audio_profile"]`
- [ ] `_map_genre_to_mood` helper covers the common Gemini genre descriptions
- [ ] `get_music_track_metadata` added to `music_library.py`
- [ ] Selected track uploaded to MinIO with a real `asset_id` before writing
      the timeline clip — never reference a local file path in the timeline
- [ ] `is_placeholder=False` on the timeline music clip when a real track is found
- [ ] `duck_under_voice` flag stored on the clip and consumed by the render
      pipeline's audio mixing step
- [ ] `_mix_audio_with_ducking` wired into the final render step (in
      `render_video.py` or wherever the Celery export task assembles audio) —
      only activated when the music clip has `duck_under_voice=True`
- [ ] Fallback: if no track found for `mood`, the original placeholder behavior
      is preserved — no silent failure, just a logged skip

### Section C: B-Roll

- [ ] `_apply_broll_slot` updated with async library query + scoring
- [ ] `RecipeApplicator` receives `workspace_id` as a constructor parameter
      if it doesn't already — needed for the library query
- [ ] `RecipeApplicator` receives a `db_session` factory (async) or equivalent
      DB access pattern consistent with how other async methods in the file work
- [ ] `add_broll_clip` and `add_broll_placeholder` added to the timeline writer
- [ ] `gap_metadata` dict stored on the clip and accessible to the frontend
      via the timeline state (confirm `TimelineDataModel` serializes it)
- [ ] `BrollGapBadge` component placed in the timeline toolbar
- [ ] Badge click opens `TemplateGapResolver` (Phase 2) pre-populated with the
      missing B-roll slots read from the timeline clips — not from a fresh
      template match run
- [ ] `gap_resolution_needed` clips are visually distinct in the timeline —
      use a dashed border or orange tint on the clip block so the user can see
      at a glance which B-roll slots still need attention

### Section D: Order of Operations

- [ ] Verify the apply order in `RecipeApplicator.apply()` matches the table
      above — specifically that jump-cuts run before timestamp scaling, and
      that music bed runs after all visual effects
- [ ] `apply_summary()` from Part 2 is called at the very end and its result
      is returned in the API response from `POST /api/v1/projects/{id}/apply-style`
- [ ] Integration test (manual): apply a template from a 25s TikTok reference
      onto a 3-minute video and verify:
        (a) hook text lands in the first 10s
        (b) CTA text lands in the last 20s
        (c) music bed plays a real track, not silence
        (d) any B-roll slots show in the timeline with correct match status
        (e) `apply_summary` in the API response lists applied/skipped correctly