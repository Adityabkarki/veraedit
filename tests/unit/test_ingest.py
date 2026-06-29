"""
ViraEdit — Unit tests for video ingestion (Module 01).

Run: pytest tests/unit/test_ingest.py -v
"""
import json
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestParseFrameRate:
    def test_fraction_parsing(self):
        from processors.downloader import parse_frame_rate

        assert parse_frame_rate("30/1") == 30.0
        assert abs(parse_frame_rate("30000/1001") - 29.97) < 0.01

    def test_float_parsing(self):
        from processors.downloader import parse_frame_rate

        assert parse_frame_rate("24.0") == 24.0

    def test_invalid_returns_default(self):
        from processors.downloader import parse_frame_rate

        assert parse_frame_rate(None) == 30.0
        assert parse_frame_rate("bad") == 30.0


class TestExtractMetadata:
    def test_extract_metadata_parses_ffprobe_json(self, tmp_path):
        from processors.downloader import extract_metadata

        video = tmp_path / "sample.mp4"
        video.write_bytes(b"fake")

        ffprobe_output = {
            "format": {"duration": "120.5", "size": "1048576"},
            "streams": [
                {
                    "codec_type": "video",
                    "width": 1920,
                    "height": 1080,
                    "r_frame_rate": "30/1",
                    "codec_name": "h264",
                },
                {"codec_type": "audio", "codec_name": "aac"},
            ],
        }

        with patch("processors.downloader.subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                stdout=json.dumps(ffprobe_output),
                returncode=0,
            )
            meta = extract_metadata(video)

        assert meta["duration"] == 120.5
        assert meta["width"] == 1920
        assert meta["height"] == 1080
        assert meta["fps"] == 30.0
        assert meta["codec"] == "h264"
        assert meta["file_size"] == 1048576
        assert meta["has_audio"] is True


class TestIngestSchemas:
    def test_ingest_url_request(self):
        from schemas.ingest import IngestURLRequest

        req = IngestURLRequest(
            url="https://www.youtube.com/watch?v=abc",
            project_id="550e8400-e29b-41d4-a716-446655440000",
        )
        assert "youtube" in req.url

    def test_ingest_response(self):
        from schemas.ingest import IngestResponse

        resp = IngestResponse(job_id="job-1", status="queued")
        assert resp.status == "queued"


class TestStorageHelpers:
    def test_put_object_calls_boto3(self):
        from processors import storage_helpers

        mock_client = MagicMock()
        with patch.object(storage_helpers, "boto3") as mock_boto:
            mock_boto.client.return_value = mock_client
            store = storage_helpers.S3Storage()
            store.put_object("projects/p1/raw/x.mp4", b"data", "video/mp4")

        mock_client.put_object.assert_called_once()
        call_kwargs = mock_client.put_object.call_args.kwargs
        assert call_kwargs["Key"] == "projects/p1/raw/x.mp4"
        assert call_kwargs["Body"] == b"data"


class TestJobModel:
    def test_job_type_enum_values(self):
        from models.job import JobStatus, JobType

        assert JobType.INGEST_URL.value == "INGEST_URL"
        assert JobStatus.QUEUED.value == "queued"
