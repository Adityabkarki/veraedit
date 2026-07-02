"""
Unit tests for caption_renderer (Module 03).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_caption_style_names():
    from processors.caption_renderer import CAPTION_STYLE_NAMES

    assert CAPTION_STYLE_NAMES == [
        "hormozi",
        "mrbeast",
        "minimal",
        "nepali_bold",
        "kinetic",
    ]


def test_segments_from_words_groups_phrases():
    from processors.caption_renderer import segments_from_words

    words = [
        {"word": "hello", "start": 0.0, "end": 0.5},
        {"word": "world", "start": 0.5, "end": 1.0},
        {"word": "again", "start": 2.0, "end": 2.5},
    ]
    segs = segments_from_words(words)
    assert len(segs) == 2
    assert segs[0]["text"] == "hello world"
    assert segs[1]["text"] == "again"


def test_words_to_srt_format():
    from processors.caption_renderer import words_to_srt

    srt = words_to_srt([
        {"text": "नमस्ते", "start": 0.0, "end": 1.2},
        {"text": "Hello", "start": 1.5, "end": 2.0},
    ])
    assert "1\n" in srt
    assert "00:00:00,000 -->" in srt
    assert "नमस्ते" in srt


def test_write_ass_creates_karaoke_tags(tmp_path: Path):
    from processors.caption_renderer import STYLE_PRESETS, _write_ass

    ass_path = tmp_path / "test.ass"
    words = [
        {"word": "test", "start": 0.0, "end": 0.4},
        {"word": "word", "start": 0.4, "end": 0.8},
    ]
    _write_ass(words, STYLE_PRESETS["minimal"], ass_path)
    content = ass_path.read_text(encoding="utf-8")
    assert "[Script Info]" in content
    assert "\\k" in content
    assert "test" in content


def test_css_color_to_ass_hex_yellow():
    from processors.caption_renderer import css_color_to_ass

    assert css_color_to_ass("#FFFF00") == "&H0000FFFF"
    assert css_color_to_ass("#FFFFFF") == "&H00FFFFFF"


def test_css_color_to_ass_rgba_background():
    from processors.caption_renderer import css_color_to_ass

    ass = css_color_to_ass("rgba(0,0,0,0.75)")
    assert ass.startswith("&H")


def test_caption_style_from_metadata_maps_yellow_color():
    from tasks.export_timeline import caption_style_from_metadata

    overrides = caption_style_from_metadata({
        "metadata": {
            "caption_editor_preset": "nepali-bold",
            "caption_burn_style": "nepali_bold",
            "caption_style": {
                "color": "#FFFF00",
                "position": "center",
                "background_color": "rgba(0,0,0,0.72)",
            },
        },
    })
    assert overrides["primary_color"] == "&H0000FFFF"
    assert overrides["position"] == "center"
    assert overrides.get("border_style") == 3


def test_write_ass_uses_custom_yellow(tmp_path: Path):
    from processors.caption_renderer import merge_caption_preset, _write_ass

    preset = merge_caption_preset("nepali_bold", {
        "primary_color": "&H0000FFFF",
        "position": "center",
    })
    ass_path = tmp_path / "yellow.ass"
    _write_ass(
        [{"word": "नमस्ते", "start": 0.0, "end": 1.0}],
        preset,
        ass_path,
    )
    content = ass_path.read_text(encoding="utf-8")
    assert "&H0000FFFF" in content
    assert ",5," in content or ",5,40" in content  # center alignment
