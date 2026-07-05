"""
Unit tests for audio analysis plan attachment service.

Run: pytest tests/unit/test_audio_analysis_service.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestPlanNeedsAudioAnalysis:
    def test_detects_podcast_equalizer(self):
        from services.audio_analysis_service import plan_needs_audio_analysis

        plan = {"elements": [{"type": "symmetric_audio_strip"}]}
        assert plan_needs_audio_analysis(plan) is True

    def test_ignores_non_reactive(self):
        from services.audio_analysis_service import plan_needs_audio_analysis

        plan = {"elements": [{"type": "metric_ticker"}]}
        assert plan_needs_audio_analysis(plan) is False


class TestAttachAudioAnalysis:
    def test_short_clip_gets_client_src(self, monkeypatch):
        from services import audio_analysis_service as svc

        monkeypatch.setattr(
            svc.storage_sync,
            "get_presigned_url",
            lambda key, expires=3600, filename=None: f"https://minio.test/{key}",
        )

        plan = {
            "fps": 30,
            "elements": [{"type": "circular_orbit_equalizer", "props": {}}],
        }
        out = svc.attach_audio_analysis_to_plan(
            plan,
            project_id="proj-1",
            storage_key="projects/p/raw/vid.mp4",
            duration_seconds=120.0,
        )
        assert out["audio"]["analysisPath"] == "client_visualizeAudio"
        assert out["audio"]["src"].startswith("https://minio.test/")
        assert out["audio"]["durationSeconds"] == 120.0

    def test_long_clip_embeds_sidecar_when_present(self, monkeypatch):
        from services import audio_analysis_service as svc

        track = {
            "schemaVersion": 1,
            "sourceHash": svc.source_hash_from_key("projects/p/raw/long.mp4"),
            "fps": 30,
            "bandCount": 16,
            "frames": [{"frame": 0, "overallAmplitude": 0.5, "bands": [0.5], "isTransient": False}],
            "peakAmplitude": 0.5,
            "meta": {"analysisPath": "server_librosa", "generatedAt": "2026-01-01"},
        }

        def fake_load(project_id, source_hash, fps, band_count):
            return track

        monkeypatch.setattr(svc, "load_sidecar_track", fake_load)

        plan = {"fps": 30, "elements": [{"type": "symmetric_audio_strip", "props": {}}]}
        out = svc.attach_audio_analysis_to_plan(
            plan,
            project_id="proj-1",
            storage_key="projects/p/raw/long.mp4",
            duration_seconds=3600.0,
        )
        assert out["audio"]["analysisPath"] == "server_librosa"
        assert out["audio"]["track"]["frames"]

    def test_skips_when_no_reactive_elements(self):
        from services.audio_analysis_service import attach_audio_analysis_to_plan

        plan = {"elements": [{"type": "strategy_funnel"}]}
        out = attach_audio_analysis_to_plan(
            plan,
            project_id="p",
            storage_key="k",
            duration_seconds=60,
        )
        assert "audio" not in out


class TestQueueLongFormPrecompute:
    def test_queues_over_threshold(self, monkeypatch):
        from services.audio_analysis_service import queue_long_form_precompute

        sent: dict = {}

        def fake_send_task(name, kwargs=None, queue=None):
            sent["name"] = name
            sent["kwargs"] = kwargs
            sent["queue"] = queue

        import celery_app as celery_mod

        monkeypatch.setattr(celery_mod.celery_app, "send_task", fake_send_task)

        queue_long_form_precompute("proj", "key.mp4", 240.0)
        assert sent["name"] == "tasks.audio_analysis.precompute"
        assert sent["queue"] == "analysis"

    def test_skips_short_clip(self, monkeypatch):
        from services.audio_analysis_service import queue_long_form_precompute

        called = {"v": False}

        def fake_send_task(*a, **k):
            called["v"] = True

        import celery_app as celery_mod

        monkeypatch.setattr(celery_mod.celery_app, "send_task", fake_send_task)
        queue_long_form_precompute("proj", "key.mp4", 60.0)
        assert called["v"] is False
