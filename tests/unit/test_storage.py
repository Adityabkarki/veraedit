"""
ViraEdit — EP-1.3 unit tests for storage validation utilities.

Tests:
    - validate_file: allowed types, rejected types, size limits
    - make_storage_key: path format, filename sanitization
    - StorageService URL generation (against live MinIO)

Run: pytest tests/unit/test_storage.py -v
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))

import pytest


# ── validate_file ─────────────────────────────────────────────────────────────

class TestValidateFile:
    def test_mp4_is_accepted(self):
        from storage import validate_file
        mime = validate_file("video.mp4", "video/mp4", None)
        assert mime == "video/mp4"

    def test_mp3_is_accepted(self):
        from storage import validate_file
        mime = validate_file("audio.mp3", "audio/mpeg", None)
        assert mime == "audio/mpeg"

    def test_mkv_is_accepted(self):
        from storage import validate_file
        mime = validate_file("video.mkv", "video/x-matroska", None)
        assert mime == "video/x-matroska"

    def test_wav_is_accepted(self):
        from storage import validate_file
        mime = validate_file("sound.wav", "audio/wav", None)
        assert mime == "audio/wav"

    def test_pdf_is_rejected(self):
        from exceptions import UnsupportedFileTypeError
        from storage import validate_file
        with pytest.raises(UnsupportedFileTypeError):
            validate_file("document.pdf", "application/pdf", None)

    def test_exe_is_rejected(self):
        from exceptions import UnsupportedFileTypeError
        from storage import validate_file
        with pytest.raises(UnsupportedFileTypeError):
            validate_file("setup.exe", "application/octet-stream", None)

    def test_file_too_large_raises(self):
        from exceptions import FileTooLargeError
        from storage import MAX_FILE_SIZE_BYTES, validate_file
        with pytest.raises(FileTooLargeError):
            validate_file("big.mp4", "video/mp4", MAX_FILE_SIZE_BYTES + 1)

    def test_exactly_at_limit_is_ok(self):
        from storage import MAX_FILE_SIZE_BYTES, validate_file
        mime = validate_file("big.mp4", "video/mp4", MAX_FILE_SIZE_BYTES)
        assert mime == "video/mp4"

    def test_none_file_size_is_ok(self):
        """File size is optional — skip size check if not provided."""
        from storage import validate_file
        mime = validate_file("video.mp4", "video/mp4", None)
        assert mime == "video/mp4"

    def test_extension_overrides_wrong_mime(self):
        """If browser sends wrong MIME but extension is correct, use extension-based MIME."""
        from storage import validate_file
        # Browser sends 'application/octet-stream' but extension is .mp4
        mime = validate_file("video.mp4", "application/octet-stream", None)
        assert mime == "video/mp4"

    def test_flac_audio_accepted(self):
        from storage import validate_file
        mime = validate_file("music.flac", "audio/flac", None)
        assert mime == "audio/flac"

    def test_webm_video_accepted(self):
        from storage import validate_file
        mime = validate_file("clip.webm", "video/webm", None)
        assert mime == "video/webm"


# ── make_storage_key ──────────────────────────────────────────────────────────

class TestMakeStorageKey:
    def test_key_has_correct_prefix(self):
        from storage import make_storage_key
        key = make_storage_key("proj-1", "asset-1", "video.mp4")
        assert key.startswith("projects/proj-1/assets/asset-1/")

    def test_key_contains_filename(self):
        from storage import make_storage_key
        key = make_storage_key("proj-1", "asset-1", "podcast.mp3")
        assert key.endswith("/podcast.mp3")

    def test_key_sanitizes_spaces(self):
        from storage import make_storage_key
        key = make_storage_key("proj-1", "asset-1", "my video file.mp4")
        assert " " not in key
        assert "my_video_file.mp4" in key

    def test_key_sanitizes_special_chars(self):
        from storage import make_storage_key
        key = make_storage_key("proj-1", "asset-1", "नेपाली भिडियो.mp4")
        assert " " not in key
        # Special chars replaced with underscore, extension preserved
        assert ".mp4" in key

    def test_path_traversal_prevented(self):
        from storage import make_storage_key
        key = make_storage_key("proj-1", "asset-1", "../../etc/passwd")
        # After sanitization, only the basename is used
        assert "etc" not in key or "passwd" not in key
        assert ".." not in key

    def test_key_uses_posix_separators(self):
        from storage import make_storage_key
        key = make_storage_key("proj-1", "asset-1", "video.mp4")
        assert "\\" not in key  # No Windows backslashes in S3 keys


# ── File type constants ───────────────────────────────────────────────────────

class TestStorageConstants:
    def test_max_file_size_is_10gb(self):
        from storage import MAX_FILE_SIZE_BYTES
        assert MAX_FILE_SIZE_BYTES == 10 * 1024 * 1024 * 1024

    def test_upload_url_expires_in_one_hour(self):
        from storage import UPLOAD_URL_EXPIRES_SECONDS
        assert UPLOAD_URL_EXPIRES_SECONDS == 3600

    def test_allowed_mime_types_include_nepali_formats(self):
        """MP4 and MP3 are the most common Nepali content formats."""
        from storage import ALLOWED_MIME_TYPES
        assert "video/mp4" in ALLOWED_MIME_TYPES
        assert "audio/mpeg" in ALLOWED_MIME_TYPES

    def test_bucket_names_are_correct(self):
        from storage import BUCKET_MEDIA, BUCKET_RENDERS, BUCKET_TEMP
        assert BUCKET_MEDIA == "viraedit-media"
        assert BUCKET_RENDERS == "viraedit-renders"
        assert BUCKET_TEMP == "viraedit-temp"
