"""
Unit tests for frame-accurate audio analysis sidecar (Path B).

Run: pytest tests/unit/test_audio_analysis_track.py -v
"""
import importlib.util
import os
import sys
from unittest.mock import patch

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

HAS_LIBROSA = importlib.util.find_spec("librosa") is not None


@pytest.mark.skipif(not HAS_LIBROSA, reason="librosa not installed in test environment")
class TestBuildAudioAnalysisTrack:
    def test_produces_normalized_frames(self, tmp_path):
        import soundfile as sf
        from processors.audio_analysis_track import build_audio_analysis_track

        rate = 44100
        duration = 2.0
        t = np.linspace(0, duration, int(rate * duration), endpoint=False)
        envelope = 0.2 + 0.8 * np.maximum(0, np.sin(t * np.pi * 1.6))
        audio = (envelope * np.sin(2 * np.pi * 200 * t) * 0.4).astype(np.float32)
        wav = tmp_path / "speech.wav"
        sf.write(wav.as_posix(), audio, rate)

        track = build_audio_analysis_track(wav, fps=30, band_count=8)
        assert track["schemaVersion"] == 1
        assert track["bandCount"] == 8
        assert len(track["frames"]) == 60
        amps = [f["overallAmplitude"] for f in track["frames"]]
        assert max(amps) <= 1.0
        assert min(amps) >= 0.0
        assert max(amps) - min(amps) > 0.05
        assert all(len(f["bands"]) == 8 for f in track["frames"])

    def test_detects_transients_on_emphasis(self, tmp_path):
        import soundfile as sf
        from processors.audio_analysis_track import build_audio_analysis_track

        rate = 44100
        n = rate * 2
        audio = np.zeros(n, dtype=np.float32)
        audio[rate // 2 : rate // 2 + 2000] = 0.9
        audio[rate + rate // 2 : rate + rate // 2 + 2000] = 0.95
        wav = tmp_path / "bursts.wav"
        sf.write(wav.as_posix(), audio, rate)

        track = build_audio_analysis_track(wav, fps=30, band_count=8)
        transients = [f["isTransient"] for f in track["frames"]]
        assert any(transients)


@pytest.mark.skipif(not HAS_LIBROSA, reason="librosa not installed in test environment")
class TestBuildFromMedia:
    def test_extracts_audio_from_video_path(self, tmp_path):
        from processors.audio_analysis_track import build_from_media

        video = tmp_path / "clip.mp4"
        video.write_bytes(b"fake")

        rate = 44100
        audio = np.sin(2 * np.pi * 300 * np.linspace(0, 1, rate)).astype(np.float32) * 0.3

        def fake_extract(src, dest):
            import soundfile as sf
            sf.write(dest.as_posix(), audio, rate)

        with patch(
            "processors.audio_analysis_track.extract_audio_wav",
            side_effect=fake_extract,
        ):
            track = build_from_media(video, fps=30, band_count=8)

        assert track["meta"]["analysisPath"] == "server_librosa"
        assert len(track["frames"]) >= 1
