"""
ViraEdit — Bundled royalty-free music picker (Phase 05).

Tracks live under apps/api/assets/music_library/ (CC0 / royalty-free).
"""
from __future__ import annotations

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


def list_tracks_for_mood(mood: str) -> list[Path]:
    """All track paths for a mood (used in tests)."""
    tracks = MUSIC_LIBRARY.get(mood, MUSIC_LIBRARY["upbeat"])
    return [_ASSETS_ROOT / name for name in tracks]
