"""
ViraEdit — Style Transfer unit tests (EP-2.8).

Tests:
  1. TestStyleDNAModels       — data model serialisation and round-trip
  2. TestStylePreset          — preset CRUD helpers (save / load / delete)
  3. TestVideoDownloader      — URL platform detection, error handling
  4. TestStyleExtractorSync   — individual sync extraction methods
  5. TestStyleApplicator      — apply components to timeline dict
  6. TestStyleRouterRegistration — endpoint existence checks
  7. TestStyleTransferPublicAPI  — module import surface

Run:
    python -m pytest tests/unit/test_style_transfer.py -v
"""
from __future__ import annotations

import copy
import pathlib
import sys
import uuid

import pytest

# Ensure the API source tree is on the path
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "apps" / "api"))


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _make_timeline(num_clips: int = 2) -> dict:
    """Build a minimal valid timeline dict for testing."""
    clips = [
        {
            "id": f"clip-{i}",
            "asset_id": "asset-1",
            "source_start": 0.0,
            "source_end": 10.0,
            "timeline_start": float(i * 10),
            "timeline_end": float(i * 10 + 10),
            "speed": 1.0,
            "muted": False,
            "volume": 1.0,
            "effects": [],
            "transitions": {},
            "label": "",
        }
        for i in range(num_clips)
    ]
    return {
        "schema_version": 1,
        "tracks": [
            {
                "id": "track-video-1",
                "type": "video",
                "name": "Main Video",
                "muted": False,
                "locked": False,
                "visible": True,
                "clips": clips,
            },
            {
                "id": "track-audio-1",
                "type": "audio",
                "name": "Main Audio",
                "muted": False,
                "locked": False,
                "visible": True,
                "clips": copy.deepcopy(clips),
            },
            {
                "id": "track-captions",
                "type": "captions",
                "name": "Captions",
                "muted": False,
                "locked": False,
                "visible": True,
                "clips": [
                    {
                        "id": "cap-0",
                        "asset_id": "asset-1",
                        "source_start": 0.0,
                        "source_end": 5.0,
                        "timeline_start": 0.0,
                        "timeline_end": 5.0,
                        "speed": 1.0,
                        "muted": False,
                        "volume": 1.0,
                        "effects": [],
                        "transitions": {},
                        "label": "साथीहरू",
                    }
                ],
            },
        ],
        "global_settings": {
            "resolution": "1920x1080",
            "fps": 30.0,
            "audio_sample_rate": 48000,
            "duration": float(num_clips * 10),
        },
        "metadata": {},
    }


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DATA MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class TestStyleDNAModels:
    """StyleDNA, sub-profiles, serialisation."""

    def test_pacing_profile_defaults(self):
        from tasks.style_transfer.models import PacingProfile
        p = PacingProfile()
        assert p.avg_cut_duration_ms == 3000.0
        assert p.rhythm == "variable"

    def test_color_profile_defaults(self):
        from tasks.style_transfer.models import ColorProfile
        c = ColorProfile()
        assert c.brightness == 0.0
        assert c.temperature == 0.0

    def test_caption_style_profile_defaults(self):
        from tasks.style_transfer.models import CaptionStyleProfile
        c = CaptionStyleProfile()
        assert c.position == "bottom"
        assert c.color == "#FFFFFF"

    def test_style_dna_to_dict_round_trip(self):
        from tasks.style_transfer.models import StyleDNA, ColorProfile, PacingProfile
        dna = StyleDNA(
            color=ColorProfile(brightness=0.15, temperature=-0.1),
            pacing=PacingProfile(cuts_per_minute=25.0, rhythm="constant"),
            source_url="https://youtube.com/test",
        )
        d = dna.to_dict()
        assert d["color"]["brightness"] == 0.15
        assert d["pacing"]["rhythm"] == "constant"
        assert d["source_url"] == "https://youtube.com/test"

    def test_style_dna_from_dict_round_trip(self):
        from tasks.style_transfer.models import StyleDNA, ColorProfile
        original = StyleDNA(
            color=ColorProfile(brightness=0.2, saturation=-0.1),
            source_url="https://tiktok.com/test",
            extracted_at="2024-01-01T00:00:00+00:00",
        )
        restored = StyleDNA.from_dict(original.to_dict())
        assert restored.color.brightness == 0.2
        assert restored.color.saturation == -0.1
        assert restored.source_url == "https://tiktok.com/test"

    def test_style_dna_from_dict_partial(self):
        """Missing sub-profiles should use defaults."""
        from tasks.style_transfer.models import StyleDNA
        dna = StyleDNA.from_dict({"source_url": "test", "color": {"brightness": 0.5}})
        assert dna.color.brightness == 0.5
        assert dna.pacing.cuts_per_minute == 20.0   # default

    def test_style_dna_from_dict_empty(self):
        """Empty dict should produce all-default StyleDNA."""
        from tasks.style_transfer.models import StyleDNA
        dna = StyleDNA.from_dict({})
        assert dna.source_url == ""
        assert dna.color.brightness == 0.0

    def test_style_dna_all_components_present(self):
        from tasks.style_transfer.models import StyleDNA
        dna = StyleDNA()
        d = dna.to_dict()
        for key in ["pacing", "captions", "color", "transitions", "audio", "visuals", "hook", "broll"]:
            assert key in d, f"Missing component: {key}"


# ═══════════════════════════════════════════════════════════════════════════════
# 2. STYLE PRESET
# ═══════════════════════════════════════════════════════════════════════════════

class TestStylePreset:
    """StylePreset CRUD helpers."""

    def test_preset_creates_with_uuid(self):
        from tasks.style_transfer.models import StylePreset
        p = StylePreset(name="Test Style")
        assert len(p.id) == 36  # standard UUID format

    def test_preset_to_dict_contains_all_fields(self):
        from tasks.style_transfer.models import StylePreset, StyleDNA
        p = StylePreset(name="TikTok Style", source_url="https://tiktok.com/test")
        d = p.to_dict()
        for key in ["id", "name", "source_url", "dna", "components", "created_at"]:
            assert key in d

    def test_preset_round_trip(self):
        from tasks.style_transfer.models import StylePreset, StyleDNA, ColorProfile
        original = StylePreset(
            name="YouTube Style",
            source_url="https://youtube.com/watch?v=test",
            dna=StyleDNA(color=ColorProfile(brightness=0.1)),
            components=["color", "transitions"],
        )
        restored = StylePreset.from_dict(original.to_dict())
        assert restored.name == "YouTube Style"
        assert restored.components == ["color", "transitions"]
        assert restored.dna is not None
        assert restored.dna.color.brightness == 0.1

    def test_save_preset_appends(self):
        from tasks.style_transfer.models import StylePreset, save_preset
        p = StylePreset(name="Style A")
        dna_store = {}
        updated = save_preset(dna_store, p)
        assert len(updated["presets"]) == 1
        assert updated["presets"][0]["name"] == "Style A"

    def test_save_preset_replaces_existing(self):
        from tasks.style_transfer.models import StylePreset, save_preset
        p = StylePreset(name="Old Name")
        dna_store = save_preset({}, p)
        # Update the same preset
        p_updated = StylePreset(id=p.id, name="New Name")
        dna_store = save_preset(dna_store, p_updated)
        assert len(dna_store["presets"]) == 1
        assert dna_store["presets"][0]["name"] == "New Name"

    def test_save_multiple_presets(self):
        from tasks.style_transfer.models import StylePreset, save_preset
        store: dict = {}
        for i in range(3):
            store = save_preset(store, StylePreset(name=f"Style {i}"))
        assert len(store["presets"]) == 3

    def test_load_presets_from_empty(self):
        from tasks.style_transfer.models import load_presets
        assert load_presets(None) == []
        assert load_presets({}) == []
        assert load_presets({"presets": []}) == []

    def test_load_presets_returns_correct_count(self):
        from tasks.style_transfer.models import StylePreset, save_preset, load_presets
        store: dict = {}
        store = save_preset(store, StylePreset(name="A"))
        store = save_preset(store, StylePreset(name="B"))
        presets = load_presets(store)
        assert len(presets) == 2

    def test_delete_preset_found(self):
        from tasks.style_transfer.models import StylePreset, save_preset, delete_preset
        p = StylePreset(name="Delete Me")
        store = save_preset({}, p)
        updated, was_found = delete_preset(store, p.id)
        assert was_found is True
        assert len(updated["presets"]) == 0

    def test_delete_preset_not_found(self):
        from tasks.style_transfer.models import delete_preset
        store = {"presets": []}
        updated, was_found = delete_preset(store, "nonexistent-id")
        assert was_found is False

    def test_delete_preset_leaves_others(self):
        from tasks.style_transfer.models import StylePreset, save_preset, delete_preset
        p1 = StylePreset(name="Keep")
        p2 = StylePreset(name="Delete")
        store = save_preset(save_preset({}, p1), p2)
        updated, _ = delete_preset(store, p2.id)
        presets = updated["presets"]
        assert len(presets) == 1
        assert presets[0]["name"] == "Keep"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. VIDEO DOWNLOADER
# ═══════════════════════════════════════════════════════════════════════════════

class TestVideoDownloader:
    """URL parsing and error handling (no actual network calls)."""

    def test_detect_youtube_url(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("https://www.youtube.com/watch?v=abc") == "youtube"
        assert d.detect_platform("youtu.be/abc123") == "youtube"
        assert d.detect_platform("https://www.youtube.com/shorts/abc123") == "youtube"

    def test_detect_tiktok_url(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("https://www.tiktok.com/@creator/video/123") == "tiktok"
        assert d.detect_platform("https://vm.tiktok.com/abc123/") == "tiktok"

    def test_detect_instagram_url(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("https://www.instagram.com/reel/abc/") == "instagram"

    def test_detect_twitter_url(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("https://twitter.com/user/status/123") == "twitter"
        assert d.detect_platform("https://x.com/user/status/123") == "twitter"

    def test_detect_facebook_url(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("https://www.facebook.com/watch?v=123") == "facebook"
        assert d.detect_platform("https://fb.watch/abc123/") == "facebook"

    def test_detect_direct_mp4_url(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("https://example.com/video.mp4") == "direct"

    def test_detect_generic_url(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("https://vimeo.com/123456") == "generic"

    def test_detect_invalid_url_returns_none(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform("") is None
        assert d.detect_platform("   ") is None
        assert d.detect_platform("ftp://example.com/video.mp4") is None

    def test_detect_google_url_returns_none(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.detect_platform(
            "https://www.google.com/httpservice/retry/enablejs?sei=abc"
        ) is None
        assert d.detect_platform("https://www.google.com/search?q=youtube+shorts") is None

    def test_unwrap_google_redirect_to_youtube(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        wrapped = (
            "https://www.google.com/url?q="
            "https%3A%2F%2Fwww.youtube.com%2Fshorts%2Fabc123"
        )
        assert d.detect_platform(wrapped) == "youtube"
        assert "youtube.com/shorts/abc123" in d.normalize_url(wrapped)

    def test_normalize_url_adds_https(self):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        assert d.normalize_url("youtu.be/abc").startswith("https://")

    def test_temp_dir_created(self, tmp_path):
        from tasks.style_transfer.downloader import VideoDownloader
        custom_dir = tmp_path / "style_test"
        d = VideoDownloader(temp_dir=str(custom_dir))
        assert d.temp_dir.exists()

    def test_delete_nonexistent_file_does_not_raise(self, tmp_path):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        # Should not raise even if file doesn't exist
        d.delete(tmp_path / "nonexistent_file.mp4")

    def test_delete_existing_file(self, tmp_path):
        from tasks.style_transfer.downloader import VideoDownloader
        d = VideoDownloader()
        test_file = tmp_path / "test.mp4"
        test_file.write_bytes(b"fake video content")
        d.delete(test_file)
        assert not test_file.exists()

    def test_invalid_url_raises_download_error(self):
        from tasks.style_transfer.downloader import VideoDownloader, VideoDownloadError
        d = VideoDownloader()
        with pytest.raises(VideoDownloadError, match="Invalid URL"):
            d.download("")


# ═══════════════════════════════════════════════════════════════════════════════
# 4. STYLE EXTRACTOR (sync methods only)
# ═══════════════════════════════════════════════════════════════════════════════

class TestStyleExtractorSync:
    """Test synchronous helper methods — no real video file needed."""

    def test_build_pacing_from_scenes(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        scenes = [
            {"start_ms": 0, "end_ms": 2000, "duration_ms": 2000},
            {"start_ms": 2000, "end_ms": 4000, "duration_ms": 2000},
            {"start_ms": 4000, "end_ms": 8000, "duration_ms": 4000},
        ]
        pacing = extractor._build_pacing(scenes)
        # Total 8s, avg cut ~2666ms
        assert 2000 <= pacing.avg_cut_duration_ms <= 4000
        assert pacing.cuts_per_minute > 0

    def test_build_pacing_empty_scenes(self):
        from tasks.style_transfer.extractor import StyleExtractor, PacingProfile
        extractor = StyleExtractor()
        pacing = extractor._build_pacing([])
        # Should return default without crashing
        assert isinstance(pacing, PacingProfile)

    def test_build_pacing_constant_rhythm(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        # All same duration → coefficient of variation = 0 → "constant"
        scenes = [{"start_ms": i * 2000, "end_ms": (i + 1) * 2000, "duration_ms": 2000}
                  for i in range(10)]
        pacing = extractor._build_pacing(scenes)
        assert pacing.rhythm == "constant"

    def test_build_pacing_variable_rhythm(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        # High variance → "variable"
        scenes = [
            {"start_ms": 0, "end_ms": 500, "duration_ms": 500},
            {"start_ms": 500, "end_ms": 5000, "duration_ms": 4500},
            {"start_ms": 5000, "end_ms": 5500, "duration_ms": 500},
            {"start_ms": 5500, "end_ms": 10000, "duration_ms": 4500},
        ]
        pacing = extractor._build_pacing(scenes)
        assert pacing.rhythm in ("variable", "building")

    def test_build_transitions_fast_cut(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        scenes = [{"start_ms": 0, "end_ms": 1000, "duration_ms": 1000}] * 10
        transitions = extractor._build_transitions(scenes)
        assert transitions.primary_type == "cut"

    def test_build_transitions_slow_dissolve(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        # Long avg scene → dissolve
        scenes = [{"start_ms": 0, "end_ms": 5000, "duration_ms": 5000}] * 5
        transitions = extractor._build_transitions(scenes)
        assert transitions.primary_type in ("dissolve", "cut")

    def test_build_hook_reaction_style(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        # 6 scenes in first 10s → reaction
        scenes = [
            {"start_ms": i * 1500, "end_ms": (i + 1) * 1500, "duration_ms": 1500}
            for i in range(6)
        ]
        hook = extractor._build_hook(scenes)
        assert hook.hook_type == "reaction"
        assert hook.uses_text_hook_overlay is True

    def test_build_hook_story_style(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        # 1 long scene → story
        scenes = [{"start_ms": 0, "end_ms": 30000, "duration_ms": 30000}]
        hook = extractor._build_hook(scenes)
        assert hook.hook_type == "story"

    def test_build_broll_high_frequency(self):
        from tasks.style_transfer.extractor import StyleExtractor
        extractor = StyleExtractor()
        # Lots of short scenes (broll cutaways)
        scenes = [
            {"start_ms": 0, "end_ms": 10000, "duration_ms": 10000},  # main
            {"start_ms": 10000, "end_ms": 11000, "duration_ms": 1000},  # short
            {"start_ms": 11000, "end_ms": 21000, "duration_ms": 10000},  # main
            {"start_ms": 21000, "end_ms": 22000, "duration_ms": 1000},  # short
            {"start_ms": 22000, "end_ms": 23000, "duration_ms": 1000},  # short
        ]
        broll = extractor._build_broll(scenes)
        assert broll.frequency in ("medium", "high")

    def test_build_broll_empty_scenes(self):
        from tasks.style_transfer.extractor import StyleExtractor, BrollProfile
        extractor = StyleExtractor()
        result = extractor._build_broll([])
        assert isinstance(result, BrollProfile)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. STYLE APPLICATOR
# ═══════════════════════════════════════════════════════════════════════════════

class TestStyleApplicator:
    """Apply StyleDNA components to timeline dicts."""

    def _make_dna(self, **kwargs):
        from tasks.style_transfer.models import StyleDNA
        return StyleDNA(**kwargs)

    def test_apply_returns_deep_copy(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA
        applicator = StyleApplicator()
        data = _make_timeline()
        original_tracks = copy.deepcopy(data["tracks"])
        result = applicator.apply(data, StyleDNA(), ["color"], strength=1.0)
        # Original must be unchanged
        assert data["tracks"] == original_tracks
        # Result is a different object
        assert result is not data

    def test_apply_color_adds_effect_to_video_clips(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, ColorProfile
        applicator = StyleApplicator()
        dna = StyleDNA(color=ColorProfile(brightness=0.2, saturation=0.1))
        result = applicator.apply(_make_timeline(), dna, ["color"], strength=1.0)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        for clip in video_track["clips"]:
            effect_types = [e["type"] for e in clip["effects"]]
            assert "color_grade" in effect_types

    def test_apply_color_respects_strength(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, ColorProfile
        applicator = StyleApplicator()
        dna = StyleDNA(color=ColorProfile(brightness=0.4))
        result = applicator.apply(_make_timeline(), dna, ["color"], strength=0.5)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        clip = video_track["clips"][0]
        grade = next(e for e in clip["effects"] if e["type"] == "color_grade")
        # 0.4 * 0.5 = 0.2
        assert abs(grade["params"]["brightness"] - 0.2) < 0.001

    def test_apply_color_zero_strength_neutral(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, ColorProfile
        applicator = StyleApplicator()
        dna = StyleDNA(color=ColorProfile(brightness=0.9))
        result = applicator.apply(_make_timeline(), dna, ["color"], strength=0.0)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        clip = video_track["clips"][0]
        grade = next(e for e in clip["effects"] if e["type"] == "color_grade")
        # 0.9 * 0 = 0
        assert grade["params"]["brightness"] == 0.0

    def test_apply_captions_adds_effect_to_caption_clips(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, CaptionStyleProfile
        applicator = StyleApplicator()
        dna = StyleDNA(captions=CaptionStyleProfile(position="center", animation="pop"))
        result = applicator.apply(_make_timeline(), dna, ["captions"], strength=1.0)
        caption_track = next(t for t in result["tracks"] if t["type"] == "captions")
        for clip in caption_track["clips"]:
            effect_types = [e["type"] for e in clip["effects"]]
            assert "caption_style" in effect_types

    def test_apply_captions_sets_track_style(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, CaptionStyleProfile
        applicator = StyleApplicator()
        dna = StyleDNA(captions=CaptionStyleProfile(position="top"))
        result = applicator.apply(_make_timeline(), dna, ["captions"], strength=1.0)
        caption_track = next(t for t in result["tracks"] if t["type"] == "captions")
        assert caption_track["style"]["position"] == "top"

    def test_apply_transitions_sets_out_on_clips(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, TransitionProfile
        applicator = StyleApplicator()
        dna = StyleDNA(transitions=TransitionProfile(primary_type="dissolve", avg_duration_ms=500))
        result = applicator.apply(_make_timeline(), dna, ["transitions"], strength=1.0)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        # All but last clip should have out transition
        for clip in video_track["clips"][:-1]:
            assert "out" in clip["transitions"]
            assert clip["transitions"]["out"]["type"] == "dissolve"

    def test_apply_transitions_zero_strength_cuts(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, TransitionProfile
        applicator = StyleApplicator()
        dna = StyleDNA(transitions=TransitionProfile(primary_type="dissolve", avg_duration_ms=1000))
        result = applicator.apply(_make_timeline(), dna, ["transitions"], strength=0.0)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        for clip in video_track["clips"][:-1]:
            assert clip["transitions"]["out"]["type"] == "cut"
            assert clip["transitions"]["out"]["duration"] == 0.0

    def test_apply_audio_adds_normalize_effect(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, AudioProfile
        applicator = StyleApplicator()
        dna = StyleDNA(audio=AudioProfile(music_energy="high", normalization_target_lufs=-14.0))
        result = applicator.apply(_make_timeline(), dna, ["audio"], strength=1.0)
        audio_track = next(t for t in result["tracks"] if t["type"] == "audio")
        for clip in audio_track["clips"]:
            effect_types = [e["type"] for e in clip["effects"]]
            assert "audio_normalize" in effect_types

    def test_apply_pacing_stores_in_metadata(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, PacingProfile
        applicator = StyleApplicator()
        dna = StyleDNA(pacing=PacingProfile(
            cuts_per_minute=30.0,
            rhythm="constant",
            avg_cut_duration_ms=3000.0,
        ))
        result = applicator.apply(_make_timeline(), dna, ["pacing"], strength=0.8)
        assert "pacing_target" in result["metadata"]
        assert result["metadata"]["pacing_target"]["cuts_per_minute"] == 30.0
        assert result["metadata"]["pacing_target"]["strength"] == 0.8
        assert "pacing_applied" in result["metadata"]

    def test_apply_pacing_splits_long_clips(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, PacingProfile
        applicator = StyleApplicator()
        dna = StyleDNA(pacing=PacingProfile(avg_cut_duration_ms=3000.0))
        result = applicator.apply(_make_timeline(num_clips=2), dna, ["pacing"], strength=1.0)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        assert len(video_track["clips"]) > 2
        for clip in video_track["clips"]:
            effect_types = [e["type"] for e in clip["effects"]]
            assert "style_pacing" in effect_types
        audio_track = next(t for t in result["tracks"] if t["type"] == "audio")
        assert len(audio_track["clips"]) == len(video_track["clips"])

    def test_apply_hook_adds_overlay(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, HookProfile
        applicator = StyleApplicator()
        dna = StyleDNA(hook=HookProfile(
            hook_type="reaction",
            uses_text_hook_overlay=True,
            hook_duration_s=4.0,
        ))
        result = applicator.apply(_make_timeline(), dna, ["hook"], strength=1.0)
        assert "hook_style" in result["metadata"]
        overlay = next(t for t in result["tracks"] if t["type"] == "overlay")
        assert len(overlay["clips"]) == 1
        fx = overlay["clips"][0]["effects"][0]
        assert fx["type"] == "visual_overlay"
        assert fx["params"]["visual_type"] == "hook_rewrite"

    def test_apply_visuals_adds_overlays(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, VisualProfile
        applicator = StyleApplicator()
        dna = StyleDNA(visuals=VisualProfile(
            uses_text_overlays=True,
            overlay_density="moderate",
            text_style="bold",
        ))
        result = applicator.apply(_make_timeline(), dna, ["visuals"], strength=1.0)
        assert "visual_style" in result["metadata"]
        overlay = next(t for t in result["tracks"] if t["type"] == "overlay")
        assert len(overlay["clips"]) >= 2

    def test_apply_broll_adds_markers(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, BrollProfile
        applicator = StyleApplicator()
        dna = StyleDNA(broll=BrollProfile(frequency="high", avg_broll_duration_ms=2500.0))
        result = applicator.apply(_make_timeline(), dna, ["broll"], strength=1.0)
        assert "broll_style" in result["metadata"]
        overlay = next(t for t in result["tracks"] if t["type"] == "overlay")
        assert len(overlay["clips"]) >= 2
        assert overlay["clips"][0]["effects"][0]["params"]["visual_type"] == "broll_insert"

    def test_apply_low_strength_skips_overlays(self):
        """Low strength should store metadata but skip overlay clips."""
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, HookProfile, BrollProfile
        applicator = StyleApplicator()
        dna = StyleDNA(
            hook=HookProfile(uses_text_hook_overlay=True),
            broll=BrollProfile(frequency="high"),
        )
        result = applicator.apply(_make_timeline(), dna, ["hook", "broll"], strength=0.2)
        overlay_tracks = [t for t in result["tracks"] if t["type"] == "overlay"]
        assert not overlay_tracks or all(len(t["clips"]) == 0 for t in overlay_tracks)

    def test_apply_empty_components_no_change(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA
        applicator = StyleApplicator()
        data = _make_timeline()
        result = applicator.apply(data, StyleDNA(), [], strength=1.0)
        # No components applied — tracks unchanged (effects still empty)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        for clip in video_track["clips"]:
            assert clip["effects"] == []

    def test_apply_multiple_components(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, ColorProfile, CaptionStyleProfile
        applicator = StyleApplicator()
        dna = StyleDNA(
            color=ColorProfile(brightness=0.1),
            captions=CaptionStyleProfile(position="center"),
        )
        result = applicator.apply(_make_timeline(), dna, ["color", "captions"], strength=1.0)
        # Both should be applied
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        assert any(e["type"] == "color_grade" for e in video_track["clips"][0]["effects"])
        caption_track = next(t for t in result["tracks"] if t["type"] == "captions")
        assert any(e["type"] == "caption_style" for e in caption_track["clips"][0]["effects"])

    def test_apply_color_replaces_existing_effect(self):
        """Applying color twice should not duplicate effects."""
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, ColorProfile
        applicator = StyleApplicator()
        dna1 = StyleDNA(color=ColorProfile(brightness=0.1))
        dna2 = StyleDNA(color=ColorProfile(brightness=0.3))
        result1 = applicator.apply(_make_timeline(), dna1, ["color"], strength=1.0)
        result2 = applicator.apply(result1, dna2, ["color"], strength=1.0)
        video_track = next(t for t in result2["tracks"] if t["type"] == "video")
        for clip in video_track["clips"]:
            color_effects = [e for e in clip["effects"] if e["type"] == "color_grade"]
            assert len(color_effects) == 1  # not duplicated
            assert abs(color_effects[0]["params"]["brightness"] - 0.3) < 0.001

    def test_strength_clamped_to_0_1(self):
        from tasks.style_transfer.applicator import StyleApplicator
        from tasks.style_transfer.models import StyleDNA, ColorProfile
        applicator = StyleApplicator()
        dna = StyleDNA(color=ColorProfile(brightness=0.5))
        # Strength > 1.0 should be clamped to 1.0
        result = applicator.apply(_make_timeline(), dna, ["color"], strength=2.0)
        video_track = next(t for t in result["tracks"] if t["type"] == "video")
        grade = next(e for e in video_track["clips"][0]["effects"] if e["type"] == "color_grade")
        assert abs(grade["params"]["brightness"] - 0.5) < 0.001  # clamped to 1.0 * 0.5


# ═══════════════════════════════════════════════════════════════════════════════
# 6. ROUTER REGISTRATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestStyleRouterRegistration:
    """Check that all expected routes are in the FastAPI app."""

    def test_styles_router_imported(self):
        from routers import styles
        assert hasattr(styles, "router")

    def test_styles_router_prefix(self):
        from routers.styles import router
        assert router.prefix == "/api/v1/projects"

    def test_style_library_route_exists(self):
        from routers.styles import router
        paths = [r.path for r in router.routes]
        assert any("style-library" in p for p in paths)

    def test_style_extract_route_exists(self):
        from routers.styles import router
        paths = [r.path for r in router.routes]
        assert any("style-extract" in p for p in paths)

    def test_style_apply_route_exists(self):
        from routers.styles import router
        paths = [r.path for r in router.routes]
        assert any("style-apply" in p for p in paths)

    def test_style_library_delete_route_exists(self):
        from routers.styles import router
        paths = [r.path for r in router.routes]
        # The delete route contains both style-library and preset_id param
        assert any("style-library" in p and "preset_id" in p for p in paths)

    def test_styles_router_in_main_app(self):
        """styles router must be imported and included in main.py."""
        import inspect
        import main
        source = inspect.getsource(main)
        assert "styles" in source, "styles router not imported in main.py"
        assert "styles.router" in source, "styles.router not included in main.py"


# ═══════════════════════════════════════════════════════════════════════════════
# 7. PUBLIC API SURFACE
# ═══════════════════════════════════════════════════════════════════════════════

class TestStyleTransferPublicAPI:
    """Verify the public module surface is importable and correct."""

    def test_package_importable(self):
        from tasks import style_transfer
        assert hasattr(style_transfer, "StyleExtractor")
        assert hasattr(style_transfer, "StyleApplicator")
        assert hasattr(style_transfer, "VideoDownloader")

    def test_style_dna_importable(self):
        from tasks.style_transfer import StyleDNA
        assert callable(StyleDNA)

    def test_style_preset_importable(self):
        from tasks.style_transfer import StylePreset
        assert callable(StylePreset)

    def test_video_downloader_importable(self):
        from tasks.style_transfer import VideoDownloader, VideoDownloadError
        assert callable(VideoDownloader)
        assert issubclass(VideoDownloadError, Exception)

    def test_style_extractor_importable(self):
        from tasks.style_transfer import StyleExtractor
        extractor = StyleExtractor()
        assert hasattr(extractor, "extract")

    def test_style_applicator_importable(self):
        from tasks.style_transfer import StyleApplicator
        applicator = StyleApplicator()
        assert hasattr(applicator, "apply")

    def test_style_applicator_is_pure_function(self):
        """apply() must return a new dict and not mutate the input."""
        from tasks.style_transfer import StyleApplicator, StyleDNA
        applicator = StyleApplicator()
        data = _make_timeline()
        original_id = id(data)
        result = applicator.apply(data, StyleDNA(), ["color"], strength=0.5)
        assert id(result) != original_id

    def test_style_extractor_has_all_components(self):
        from tasks.style_transfer.extractor import ALL_COMPONENTS
        expected = {"pacing", "color", "captions", "transitions", "audio", "hook", "visuals", "broll"}
        assert set(ALL_COMPONENTS) == expected


class TestStyleExtractTaskSql:
    """Brand save SQL must use CAST(:dna AS jsonb) — :dna::jsonb breaks SQLAlchemy binds."""

    def test_save_preset_sql_uses_cast_not_postgres_shorthand(self):
        import inspect
        from tasks import style_extract_task

        source = inspect.getsource(style_extract_task._save_preset_to_brand)
        assert "CAST(:dna AS jsonb)" in source
        assert ":dna::jsonb" not in source
        assert "name" in source
        assert "DEFAULT_BRAND_NAME" in source


class TestStyleApplyTimelineFields:
    """style-apply must use Timeline.name (DB column), not label."""

    def test_apply_style_uses_timeline_name_field(self):
        import inspect
        from routers import styles

        source = inspect.getsource(styles.apply_style)
        assert "name=version_name" in source
        assert "label=label" not in source
        assert "new_tl.label" not in source
