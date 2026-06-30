"""
Unit tests for text_editor processor (Module 04).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


def test_cuts_to_keep_no_cuts():
    from processors.text_editor import cuts_to_keep

    assert cuts_to_keep([], 10.0) == [{"start": 0.0, "end": 10.0}]


def test_cuts_to_keep_removes_middle():
    from processors.text_editor import cuts_to_keep

    cuts = [{"start": 2.0, "end": 4.0}]
    keep = cuts_to_keep(cuts, 10.0)
    assert keep == [{"start": 0.0, "end": 2.0}, {"start": 4.0, "end": 10.0}]


def test_detect_fillers_nepali():
    from processors.text_editor import detect_fillers

    words = [
        {"word": "हैन", "start": 1.0, "end": 1.4},
        {"word": "hello", "start": 2.0, "end": 2.3},
        {"word": "um", "start": 3.0, "end": 3.2},
    ]
    cuts = detect_fillers(words, language="ne")
    assert len(cuts) == 2
    assert cuts[0]["reason"] == "filler"


def test_detect_fillers_english_only():
    from processors.text_editor import detect_fillers

    words = [{"word": "हैन", "start": 1.0, "end": 1.4}]
    cuts = detect_fillers(words, language="en")
    assert len(cuts) == 0


def test_nepali_filler_set_includes_required_words():
    from processors.text_editor import FILLERS_NE

    for word in ("हैन", "अनि", "भने", "त", "हो", "नि"):
        assert word in FILLERS_NE


def test_detect_silences_parses_ffmpeg_output(monkeypatch):
    from processors.text_editor import detect_silences

    class FakeResult:
        stderr = (
            "[silencedetect] silence_start: 1.5\n"
            "[silencedetect] silence_end: 2.8 | silence_duration: 1.3\n"
            "[silencedetect] silence_start: 5.0\n"
            "[silencedetect] silence_end: 6.2 | silence_duration: 1.2\n"
        )

    monkeypatch.setattr(
        "processors.text_editor.subprocess.run",
        lambda *a, **k: FakeResult(),
    )
    silences = detect_silences("/fake/video.mp4")
    assert len(silences) == 2
    assert silences[0] == {"start": 1.5, "end": 2.8}
