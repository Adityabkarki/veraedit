"""
ViraEdit — Bundled royalty-free music picker (Phase 05).

Tracks live under apps/api/assets/music_library/ (CC0 / royalty-free).
"""
from __future__ import annotations

import os
import random
from pathlib import Path

MUSIC_MOODS = frozenset({"upbeat", "calm", "dramatic", "corporate"})

MUSIC_LIBRARY: dict[str, list[str]] = {
    "upbeat": [
        "upbeat_1.mp3", "upbeat_2.mp3", "upbeat_3.mp3", "upbeat_4.mp3",
    ],
    "calm": [
        "calm_1.mp3", "calm_2.mp3", "calm_3.mp3", "calm_4.mp3",
    ],
    "dramatic": [
        "dramatic_1.mp3", "dramatic_2.mp3", "dramatic_3.mp3", "dramatic_4.mp3",
    ],
    "corporate": [
        "corporate_1.mp3", "corporate_2.mp3", "corporate_3.mp3", "corporate_4.mp3",
    ],
}

_ASSETS_ROOT = Path(__file__).resolve().parent.parent / "assets" / "music_library"


def music_library_root() -> Path:
    return _ASSETS_ROOT


def pick_music_for_mood(mood: str) -> Path:
    """Return local path to a bundled track matching the mood."""
    tracks = MUSIC_LIBRARY.get(mood, MUSIC_LIBRARY["upbeat"])
    chosen = random.choice(tracks)
    return _ASSETS_ROOT / chosen


def _genre_to_mood(genre: str, energy_arc: str = "") -> str | None:
    """Map Phase 1 audio_profile fields to bundled library moods."""
    text = f"{genre} {energy_arc}".lower()
    if "none" in text or not text.strip():
        return None
    if any(word in text for word in ("epic", "trailer", "dramatic", "cinematic", "intense")):
        return "dramatic"
    if any(word in text for word in ("corporate", "business", "professional")):
        return "corporate"
    if any(word in text for word in ("calm", "lofi", "lo-fi", "ambient", "chill", "soft")):
        return "calm"
    if any(word in text for word in ("upbeat", "energetic", "hip", "pop", "dance", "happy")):
        return "upbeat"
    if "high throughout" in energy_arc.lower() or "builds" in energy_arc.lower():
        return "upbeat"
    return "upbeat"


def pick_music_for_audio_profile(audio_profile: dict) -> Path | None:
    """Pick bundled music from a Director's Blueprint audio_profile, if applicable."""
    genre = str(audio_profile.get("music_genre", "none"))
    energy_arc = str(audio_profile.get("music_energy_arc", ""))
    mood = _genre_to_mood(genre, energy_arc)
    if mood is None:
        return None
    path = pick_music_for_mood(mood)
    return path if path.exists() else None


def should_duck_for_speech(audio_profile: dict) -> bool:
    """True when reference video ducked music under spoken dialogue."""
    behavior = str(audio_profile.get("music_ducking_behavior", "")).lower()
    return "drop" in behavior or "duck" in behavior


def list_tracks_for_mood(mood: str) -> list[Path]:
    """All track paths for a mood (used in tests)."""
    tracks = MUSIC_LIBRARY.get(mood, MUSIC_LIBRARY["upbeat"])
    return [_ASSETS_ROOT / name for name in tracks]


def get_music_track_metadata(track_path: str | Path) -> dict[str, str]:
    """Return basic display metadata for a bundled track file."""
    filename = os.path.basename(str(track_path))
    name_without_ext = os.path.splitext(filename)[0]
    title = name_without_ext.replace("_", " ").title()
    return {"title": title, "filename": filename}


def map_genre_to_mood(genre: str, energy_arc: str = "") -> str:
    """Map free-text genre/energy to bundled library mood tags."""
    genre_lower = genre.lower()
    energy_lower = energy_arc.lower()

    if any(w in genre_lower for w in ("epic", "trailer", "cinematic", "dramatic", "intense")):
        return "dramatic"
    if any(w in genre_lower for w in ("corporate", "professional", "business", "clean")):
        return "corporate"
    if any(w in genre_lower for w in ("lofi", "chill", "ambient", "calm", "soft", "acoustic")):
        return "calm"
    if any(w in genre_lower for w in ("upbeat", "energetic", "pop", "hip hop", "hype", "fun")):
        return "upbeat"

    if "calm" in energy_lower or "low" in energy_lower:
        return "calm"
    if "build" in energy_lower or "peak" in energy_lower or "dramatic" in energy_lower:
        return "dramatic"

    return "upbeat"
