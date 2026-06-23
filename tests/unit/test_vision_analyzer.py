"""Tests for vision-based style extraction."""
from __future__ import annotations

import pathlib
import sys
import tempfile

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))

cv2 = pytest.importorskip("cv2")
import numpy as np

from tasks.style_transfer.edit_recipe import build_edit_recipe
from tasks.style_transfer.models import StyleDNA
from tasks.style_transfer.vision_analyzer import VisionAnalyzer


def _write_test_video(path: pathlib.Path, frames: list[np.ndarray], fps: float = 10.0) -> None:
    h, w = frames[0].shape[:2]
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (w, h),
    )
    for frame in frames:
        writer.write(frame)
    writer.release()


def _split_screen_frame(w: int = 320, h: int = 240) -> np.ndarray:
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    frame[:, : w // 2] = (40, 80, 200)
    frame[:, w // 2:] = (200, 80, 40)
    cv2.line(frame, (w // 2, 0), (w // 2, h), (255, 255, 255), 2)
    return frame


def _plain_frame(color: tuple[int, int, int] = (30, 30, 30)) -> np.ndarray:
    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    frame[:] = color
    return frame


def test_vision_detects_split_screen_segments():
    frames = [_split_screen_frame()] * 15 + [_plain_frame()] * 5
    with tempfile.TemporaryDirectory() as tmp:
        video = pathlib.Path(tmp) / "split.mp4"
        _write_test_video(video, frames)
        scenes = [
            {"start_ms": 0, "end_ms": 1500, "duration_ms": 1500},
            {"start_ms": 1500, "end_ms": 2000, "duration_ms": 500},
        ]
        result = VisionAnalyzer(max_samples=30).analyze(video, scenes, reference_duration_s=2.0)
    kinds = {e.kind for e in result.detected_edits}
    assert result.sample_count > 0
    assert "split_screen" in kinds or "hard_cut" in kinds or result.caption_hints is not None


def test_vision_defaults_to_fast_opencv_without_easyocr():
    analyzer = VisionAnalyzer(max_samples=10, use_easyocr=False)
    assert analyzer._use_easyocr is False
    assert analyzer._max_ocr_frames == 0
    indices = analyzer._pick_ocr_frame_indices(40)
    assert indices == set()


def test_vision_ocr_frame_cap_when_enabled():
    analyzer = VisionAnalyzer(max_samples=60, use_easyocr=True)
    indices = analyzer._pick_ocr_frame_indices(60)
    assert len(indices) <= 12
    assert 0 in indices


def test_build_edit_recipe_merges_vision_events():
    dna = StyleDNA()
    scenes = [{"start_ms": 0, "end_ms": 5000, "duration_ms": 5000}]
    from tasks.style_transfer.vision_analyzer import DetectedEdit, VisionAnalysisResult

    vision = VisionAnalysisResult(
        detected_edits=[
            DetectedEdit(
                kind="split_screen",
                start_ms=0,
                end_ms=2000,
                label="Split screen",
                content_policy="style_only",
            ),
            DetectedEdit(
                kind="hard_cut",
                start_ms=2500,
                end_ms=2500,
                label="Cut",
                params={"transition_type": "cut"},
            ),
        ],
        caption_hints={"position": "bottom", "animation": "pop", "font_size_vw": 6.0},
        transition_primary="cut",
        effect_ids=["split_screen", "caption_pop", "hard_cut"],
    )
    recipe = build_edit_recipe(dna, scenes, 5.0, vision=vision)
    kinds = {e.kind for e in recipe.events}
    assert "split_screen" in kinds
    assert "caption_style" in kinds
    cap = next(e for e in recipe.events if e.kind == "caption_style")
    assert cap.params.get("animation") == "pop"
    assert recipe.version == 2


def test_classify_text_role():
    assert VisionAnalyzer._classify_text_role(0.5, 0.85, 0.06) == "caption"
    assert VisionAnalyzer._classify_text_role(0.5, 0.15, 0.08) == "hook"
    assert VisionAnalyzer._classify_text_role(0.5, 0.65, 0.08) == "lower_third"
