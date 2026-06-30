"""
Unit tests for shorts extractor pipeline (Phase 03).

Run: pytest tests/unit/test_shorts_extractor.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


@pytest.mark.asyncio
async def test_extract_shorts_for_platforms_mocked(monkeypatch, tmp_path):
    from processors import shorts_extractor

    async def fake_find(transcript, **kwargs):
        return [{
            "start": 0,
            "end": 20,
            "title": "Test clip",
            "score": 0.9,
            "suggested_caption_style": "hormozi",
        }]

    monkeypatch.setattr(shorts_extractor, "find_viral_moments", fake_find)
    monkeypatch.setattr(shorts_extractor, "get_duration", lambda _p: 60.0)
    monkeypatch.setattr(
        shorts_extractor,
        "apply_cuts_precise",
        lambda i, o, c, force_reencode=False: o.write_bytes(b"vid"),
    )
    monkeypatch.setattr(shorts_extractor, "render_captions", lambda i, o, w, style: o.write_bytes(b"cap"))
    monkeypatch.setattr(
        shorts_extractor,
        "reframe_video",
        lambda i, o, w, h, mode: (o.write_bytes(b"ref") or str(o), None),
    )
    monkeypatch.setattr(shorts_extractor, "export_for_platform", lambda i, o, p: o.write_bytes(b"exp"))

    video = tmp_path / "source.mp4"
    video.write_bytes(b"fake")
    work = tmp_path / "work"

    results = await shorts_extractor.extract_shorts_for_platforms(
        video,
        {"words": [{"word": "hello", "start": 0, "end": 1}]},
        ["tiktok", "youtube_shorts"],
        work,
        max_clips=1,
    )

    assert "tiktok" in results
    assert "youtube_shorts" in results
    assert len(results["tiktok"]) == 1
    assert results["tiktok"][0]["title"] == "Test clip"
