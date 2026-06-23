"""Tests for podcast / Shorts micro-content style profile."""
from __future__ import annotations

import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

cv2 = pytest.importorskip("cv2")
import numpy as np

from tasks.style_transfer.podcast_shorts import (
    classify_shorts_archetype,
    enrich_for_podcast_shorts,
)
from tasks.style_transfer.vision_analyzer import DetectedEdit, VisionAnalysisResult


def _fast_scenes(n: int = 20, dur_ms: float = 2000.0) -> list[dict]:
    scenes = []
    t = 0.0
    for _ in range(n):
        scenes.append({
            "start_ms": t,
            "end_ms": t + dur_ms,
            "duration_ms": dur_ms,
        })
        t += dur_ms
    return scenes


def test_classify_podcast_short_from_fast_cuts():
    scenes = _fast_scenes(24, 2500.0)
    total_ms = scenes[-1]["end_ms"]
    vision = VisionAnalysisResult()
    assert classify_shorts_archetype(scenes, total_ms, vision) == "podcast_short"


def test_enrich_adds_shorts_edit_kinds():
    scenes = _fast_scenes(18, 2800.0)
    total_ms = scenes[-1]["end_ms"]
    vision = VisionAnalysisResult()
    # UI-like frame (bright rectangles)
    ui = np.ones((240, 320, 3), dtype=np.uint8) * 230
    ui[40:200, 40:280] = (255, 255, 255)
    # Talking-head-ish frame
    head = np.zeros((240, 320, 3), dtype=np.uint8)
    head[80:200, 100:220] = (180, 140, 120)
    frames = [(float(s["start_ms"] + 400), ui) for s in scenes[:6]]
    frames += [(float(s["start_ms"] + 400), head) for s in scenes[6:]]
    enriched = enrich_for_podcast_shorts(vision, scenes, frames, total_ms, fps=30.0)
    kinds = {e.kind for e in enriched.detected_edits}
    assert enriched.caption_hints.get("position") == "center"
    assert "hook" in kinds
    assert "cta" in kinds
    assert "jump_cut_pacing" in kinds
    assert "music_bed" in kinds
    assert "digital_zoom" in kinds or "broll" in kinds


def test_generic_archetype_skips_enrichment():
    scenes = [{"start_ms": 0, "end_ms": 30_000, "duration_ms": 30_000}]
    vision = VisionAnalysisResult()
    out = enrich_for_podcast_shorts(vision, scenes, [], 30_000.0, fps=30.0)
    assert out.caption_hints == vision.caption_hints
    assert len(out.detected_edits) == len(vision.detected_edits)
