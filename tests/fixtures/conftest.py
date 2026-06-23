"""
Pytest configuration and shared fixtures for ViraEdit tests.
"""

import json
import os
import pytest
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent
PROJECT_ROOT = FIXTURES_DIR.parents[1]

# ── Environment setup ─────────────────────────────────────────

def pytest_configure(config):
    """Set test environment variables before any tests run."""
    os.environ.setdefault("APP_ENV", "test")
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+asyncpg://viraedit:viraedit_dev_password@localhost:5433/viraedit_test"
    )
    os.environ.setdefault("REDIS_URL", "redis://localhost:6380/0")
    os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9002")
    os.environ.setdefault("S3_ACCESS_KEY", "testadmin")
    os.environ.setdefault("S3_SECRET_KEY", "testadmin123")
    os.environ.setdefault("S3_BUCKET_NAME", "viraedit-test")
    os.environ.setdefault("WHISPER_LANGUAGE", "ne")


# ── Sample data fixtures ──────────────────────────────────────

@pytest.fixture
def sample_transcript():
    path = FIXTURES_DIR / "sample_transcript.json"
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    # Minimal fallback for tests that just need structure
    return {
        "language": "ne",
        "duration": 30.0,
        "words": [
            {"word": "नमस्ते", "start": 0.0, "end": 0.5, "confidence": 0.95},
            {"word": "साथीहरू", "start": 0.6, "end": 1.2, "confidence": 0.92},
            {"word": "आज", "start": 1.3, "end": 1.6, "confidence": 0.98},
            {"word": "हामी", "start": 1.7, "end": 2.0, "confidence": 0.96},
        ],
        "text": "नमस्ते साथीहरू आज हामी",
    }


@pytest.fixture
def sample_scenes():
    path = FIXTURES_DIR / "sample_scenes.json"
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return [
        {
            "id": "scene-001",
            "start_ms": 0,
            "end_ms": 10000,
            "intent": "hook",
            "emotion": "excited",
            "energy_score": 0.85,
            "retention_score": 0.78,
            "summary_nepali": "भिडियोको परिचय",
            "summary_english": "Video introduction",
        }
    ]


@pytest.fixture
def sample_timeline():
    path = FIXTURES_DIR / "sample_timeline.json"
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return {
        "version": 1,
        "fps": 30,
        "width": 1920,
        "height": 1080,
        "duration_frames": 900,  # 30 seconds
        "tracks": [
            {
                "id": "track-video-1",
                "type": "video",
                "name": "Video 1",
                "clips": [
                    {
                        "id": "clip-001",
                        "asset_id": "asset-001",
                        "start_frame": 0,
                        "end_frame": 900,
                        "source_start_frame": 0,
                        "source_end_frame": 900,
                    }
                ]
            }
        ]
    }
