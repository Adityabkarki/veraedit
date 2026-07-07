"""Phase 17 — unified Director export must carry SFX URLs (SFX Attribution Law)."""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

from tasks.render_task import _build_director_sfx_urls


def _timeline_with_sfx(sound_ids: list[str]) -> dict:
    return {
        "tracks": {
            "sfx": [
                {"id": f"sfx-{i}", "soundId": sid, "startFrame": i * 30, "volume": 0.5}
                for i, sid in enumerate(sound_ids)
            ],
        },
    }


def test_builds_http_urls_for_catalog_sounds():
    urls = _build_director_sfx_urls(_timeline_with_sfx(["whoosh", "pop"]))
    assert set(urls) == {"whoosh", "pop"}
    for sound_id, url in urls.items():
        assert url.startswith("http")
        assert url.endswith(f"/sfx/{sound_id}.mp3")


def test_deduplicates_repeated_sound_ids():
    urls = _build_director_sfx_urls(_timeline_with_sfx(["pop", "pop", "pop"]))
    assert list(urls) == ["pop"]


def test_skips_sounds_without_local_files():
    urls = _build_director_sfx_urls(_timeline_with_sfx(["no_such_sound", "riser"]))
    assert "no_such_sound" not in urls
    assert "riser" in urls


def test_empty_or_missing_track_yields_no_urls():
    assert _build_director_sfx_urls({"tracks": {}}) == {}
    assert _build_director_sfx_urls({"tracks": {"sfx": []}}) == {}
    assert _build_director_sfx_urls({"tracks": {"sfx": [{"id": "x"}]}}) == {}


def test_every_variant_pool_sound_has_a_real_file():
    """Every soundId the TS variant pools can emit must resolve to a local file."""
    from services.sfx_library import local_sfx_path

    pool_sounds = [
        "whoosh", "whoosh_arrow", "whoosh_cinematic", "whoosh_rocket",
        "pop", "shutter_click", "camera_flash", "riser", "notification",
        "swipe", "glitch", "sub_bass", "impact_hit", "impact_cinematic",
    ]
    for sound_id in pool_sounds:
        assert local_sfx_path(sound_id) is not None, f"missing SFX file: {sound_id}"
