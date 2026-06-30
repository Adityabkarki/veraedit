# Phase 4 — PATCH: Audio-Energy-Aware Chapter & Hook Detection

> **This is a patch to the existing Phase 4 (`phase-4-chapter-extraction/SKILL.md`).
> Implement the original Phase 4 first, then apply this patch on top of it.**
> It does not replace anything — it adds a second detection signal (audio energy)
> that combines with the existing semantic (transcript-based) detection for more
> accurate chapter boundaries and hook identification.

## Why this patch exists

The original Phase 4 detects chapters purely from transcript text — sentence
boundaries and topic shifts via GPT-4o-mini. This misses a real signal a human
editor uses constantly: **audio energy spikes**. A sudden rise in volume/pitch
(excitement, a laugh, a raised voice making a point) often marks exactly the kind
of moment that should anchor a hook or a chapter boundary, even when the words
alone don't obviously signal a topic change.

This patch adds RMS-based audio energy analysis as a second signal, combined with
the existing semantic detection rather than replacing it. Both Phase 4 (chapters)
and Phase 5 (sizzle reels) benefit from this — sizzle detection in particular gets
meaningfully better at finding genuinely exciting moments rather than just
"semantically interesting" ones.

---

## New Processor: Audio Energy Analysis

### `backend/app/processors/audio_energy.py`

```python
import subprocess, os
import numpy as np
import soundfile as sf
from ..config import settings

def extract_energy_profile(video_path: str, window_seconds: float = 0.5) -> list[dict]:
    """
    Extracts RMS audio energy over time, returning a list of
    {"start": float, "end": float, "energy": float} windows.
    Energy values are normalized 0-1 relative to the video's own loudest moment,
    so this works consistently across videos with different recording levels.
    """
    audio_path = video_path + "_energy_tmp.wav"
    subprocess.run([
        settings.ffmpeg_path, "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        audio_path, "-y",
    ], check=True, capture_output=True)

    data, rate = sf.read(audio_path)
    if data.ndim > 1:
        data = data.mean(axis=1)

    window_samples = int(rate * window_seconds)
    windows = []
    for i in range(0, len(data), window_samples):
        chunk = data[i:i + window_samples]
        if len(chunk) == 0:
            continue
        rms = float(np.sqrt(np.mean(chunk.astype(np.float64) ** 2)))
        windows.append({
            "start": round(i / rate, 2),
            "end": round(min(i + window_samples, len(data)) / rate, 2),
            "energy_raw": rms,
        })

    os.remove(audio_path)

    if not windows:
        return []

    max_energy = max(w["energy_raw"] for w in windows) or 1.0
    for w in windows:
        w["energy"] = round(w["energy_raw"] / max_energy, 3)
        del w["energy_raw"]

    return windows


def find_energy_spikes(energy_profile: list[dict], threshold: float = 0.75,
                       min_gap_seconds: float = 3.0) -> list[dict]:
    """
    Identifies timestamps where audio energy crosses the threshold, suppressing
    spikes that are too close together (so one loud moment doesn't register as
    five separate "spikes" across consecutive windows).
    Returns: [{"timestamp": float, "energy": float}]
    """
    spikes = []
    last_spike_time = -999

    for w in energy_profile:
        if w["energy"] >= threshold and (w["start"] - last_spike_time) >= min_gap_seconds:
            spikes.append({"timestamp": w["start"], "energy": w["energy"]})
            last_spike_time = w["start"]

    return spikes
```

---

## Integrating Energy Spikes into Chapter Detection

### `backend/app/processors/chapter_detector.py` (additions to the existing file from Phase 4)

```python
from .audio_energy import extract_energy_profile, find_energy_spikes

async def detect_chapters_with_energy(
    video_path: str, transcript: dict, min_chapter_duration: float = 60.0,
) -> list:
    """
    Combines semantic chapter detection (existing Phase 4 logic) with audio
    energy spikes. Energy spikes that fall near an already-detected semantic
    boundary reinforce it (logged, not currently used to change behavior, but
    available for future confidence scoring). Energy spikes that DON'T align
    with any semantic boundary but are strong and isolated get inserted as
    additional chapter break candidates, since they often indicate a moment
    a human editor would also have flagged.
    """
    semantic_chapters = await detect_chapters(transcript, min_chapter_duration)

    energy_profile = extract_energy_profile(video_path)
    spikes = find_energy_spikes(energy_profile, threshold=0.75, min_gap_seconds=5.0)

    # Only add an energy-driven break if it's far from every existing chapter
    # boundary (otherwise we'd fragment chapters unnecessarily)
    existing_boundaries = [c["start"] for c in semantic_chapters] + [c["end"] for c in semantic_chapters]

    for spike in spikes:
        near_existing = any(abs(spike["timestamp"] - b) < min_chapter_duration * 0.5
                            for b in existing_boundaries)
        if not near_existing:
            # Find which chapter this spike falls inside, and tag it as a
            # notable moment within that chapter rather than always splitting —
            # splitting on every spike would over-fragment long-form content
            for ch in semantic_chapters:
                if ch["start"] <= spike["timestamp"] <= ch["end"]:
                    ch.setdefault("notable_moments", [])
                    ch["notable_moments"].append(spike["timestamp"])
                    break

    return semantic_chapters
```

### Update the Celery task call site

```python
# backend/app/tasks/chapter_tasks.py — change this line in extract_chapters_task:

# BEFORE:
# chapters = asyncio.run(detect_chapters(transcript, min_chapter_duration))

# AFTER:
from ..processors.chapter_detector import detect_chapters_with_energy
chapters = asyncio.run(detect_chapters_with_energy(local_path, transcript, min_chapter_duration))
```

---

## Applying the Same Signal to Phase 5 (Sizzle Reel) Detection

This is the bigger win — sizzle/highlight detection benefits more from energy
spikes than chapter detection does, since "exciting moment" is almost by
definition an energy spike.

### `backend/app/processors/sizzle_finder.py` (additions to the existing Phase 5 file)

```python
from .audio_energy import extract_energy_profile, find_energy_spikes

async def find_sizzle_moments_with_energy(
    video_path: str, transcript: dict, target_total_duration: float = 30.0,
    fragment_count: int = 10,
) -> list:
    """
    Upgrades find_sizzle_moments (original Phase 5) by cross-referencing
    GPT-4o-mini's semantic picks against actual audio energy at those timestamps,
    and adding any strong, isolated energy spikes the LLM might have missed
    (e.g. a sudden laugh or exclamation that doesn't read as exciting in text
    alone — "haha that's wild" reads flat in a transcript but is a real spike).
    """
    semantic_fragments = await find_sizzle_moments(transcript, target_total_duration, fragment_count)

    energy_profile = extract_energy_profile(video_path)
    spikes = find_energy_spikes(energy_profile, threshold=0.8, min_gap_seconds=4.0)

    existing_times = [(f["start"], f["end"]) for f in semantic_fragments]

    extra_fragments = []
    for spike in spikes:
        already_covered = any(s <= spike["timestamp"] <= e for s, e in existing_times)
        if not already_covered:
            extra_fragments.append({
                "start": max(0, spike["timestamp"] - 1.0),
                "end": spike["timestamp"] + 1.5,
                "energy_score": int(spike["energy"] * 100),
                "reason": "High audio energy moment (laugh, exclamation, or emphasis)",
            })

    combined = semantic_fragments + extra_fragments
    combined.sort(key=lambda x: x["start"])

    # If combining pushed us well over the target fragment count, trim the
    # lowest-scoring extras first, keeping all original LLM picks
    if len(combined) > fragment_count + 3:
        combined = sorted(combined, key=lambda x: x.get("energy_score", x.get("score", 0)), reverse=True)
        combined = combined[: fragment_count + 3]
        combined.sort(key=lambda x: x["start"])

    return combined
```

### Update the Celery task call site

```python
# backend/app/tasks/sizzle_tasks.py — change this line in generate_sizzle_task:

# BEFORE:
# fragments = asyncio.run(find_sizzle_moments(transcript, target_duration, fragment_count))

# AFTER:
from ..processors.sizzle_finder import find_sizzle_moments_with_energy
fragments = asyncio.run(find_sizzle_moments_with_energy(local_path, transcript, target_duration, fragment_count))
```

---

## Tuning Notes

`threshold=0.75` (chapters) and `threshold=0.8` (sizzle, intentionally stricter
since false positives there directly affect a short, visible montage) are starting
points, not validated values. As with Phase 8's asset-matching threshold audit,
run this against 10-15 real videos and manually judge whether detected spikes
correspond to genuinely notable moments, then adjust.

```python
# Add logging to support tuning, same pattern as Phase 8's asset_matcher audit
import logging
logger = logging.getLogger("audio_energy")

def find_energy_spikes(energy_profile, threshold=0.75, min_gap_seconds=3.0):
    spikes = []
    last_spike_time = -999
    for w in energy_profile:
        if w["energy"] >= threshold and (w["start"] - last_spike_time) >= min_gap_seconds:
            spikes.append({"timestamp": w["start"], "energy": w["energy"]})
            last_spike_time = w["start"]
            logger.info(f"energy_spike t={w['start']} energy={w['energy']}")
    return spikes
```

---

## Checklist for Cursor

- [ ] `backend/app/processors/audio_energy.py` — `extract_energy_profile` +
      `find_energy_spikes`
- [ ] `soundfile` and `numpy` already in requirements from earlier phases —
      confirm no new dependencies needed
- [ ] `chapter_detector.py` — add `detect_chapters_with_energy`, wire it into
      `chapter_tasks.py` in place of the plain `detect_chapters` call
- [ ] `sizzle_finder.py` — add `find_sizzle_moments_with_energy`, wire it into
      `sizzle_tasks.py` in place of the plain `find_sizzle_moments` call
- [ ] `notable_moments` field added to chapter output — surface these as small
      markers on the chapter's thumbnail/preview in the frontend (optional,
      nice-to-have, not blocking)
- [ ] Run the 10-15 video manual tuning pass on `threshold` values before
      treating this as production-validated, same discipline as Phase 8
- [ ] This patch does not change any API contracts — `extract_chapters_task` and
      `generate_sizzle_task` still return the same response shape, just with
      better-detected timestamps
