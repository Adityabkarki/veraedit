"""
Unit tests for RMS audio energy analysis (Phase 04 patch).

Run: pytest tests/unit/test_audio_energy.py -v
"""
import os
import sys
from unittest.mock import patch

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestFindEnergySpikes:
    def test_detects_spikes_with_gap(self):
        from processors.audio_energy import find_energy_spikes

        profile = [
            {"start": 0.0, "end": 0.5, "energy": 0.3},
            {"start": 0.5, "end": 1.0, "energy": 0.9},
            {"start": 1.0, "end": 1.5, "energy": 0.85},
            {"start": 6.0, "end": 6.5, "energy": 0.95},
        ]
        spikes = find_energy_spikes(profile, threshold=0.75, min_gap_seconds=3.0)
        assert len(spikes) == 2
        assert spikes[0]["timestamp"] == 0.5
        assert spikes[1]["timestamp"] == 6.0

    def test_suppresses_nearby_spikes(self):
        from processors.audio_energy import find_energy_spikes

        profile = [
            {"start": 0.0, "end": 0.5, "energy": 0.9},
            {"start": 0.5, "end": 1.0, "energy": 0.92},
            {"start": 1.0, "end": 1.5, "energy": 0.88},
            {"start": 5.0, "end": 5.5, "energy": 0.95},
        ]
        spikes = find_energy_spikes(profile, threshold=0.75, min_gap_seconds=3.0)
        assert len(spikes) == 2
        assert spikes[0]["timestamp"] == 0.0
        assert spikes[1]["timestamp"] == 5.0


class TestExtractEnergyProfile:
    def test_normalizes_energy_to_unit_range(self, tmp_path):
        from processors.audio_energy import extract_energy_profile

        video = tmp_path / "sample.mp4"
        video.write_bytes(b"fake")

        rate = 16000
        duration_samples = rate * 2
        quiet = np.zeros(duration_samples // 2, dtype=np.float32)
        loud = np.ones(duration_samples // 2, dtype=np.float32) * 0.8
        audio = np.concatenate([quiet, loud])

        def fake_run(cmd, check, capture_output):
            wav_path = tmp_path / "sample.mp4_energy_tmp.wav"
            import soundfile as sf

            sf.write(wav_path.as_posix(), audio, rate)

        with patch("processors.audio_energy.subprocess.run", side_effect=fake_run):
            windows = extract_energy_profile(video, window_seconds=0.5)

        assert windows
        assert max(w["energy"] for w in windows) == 1.0
        assert min(w["energy"] for w in windows) < 0.5
