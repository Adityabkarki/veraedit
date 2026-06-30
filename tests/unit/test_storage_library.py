"""
Unit tests for library storage helpers (Phase 00).

Run: pytest tests/unit/test_storage_library.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "apps", "api"))


class TestLibraryStorageHelpers:
    def test_make_library_storage_key(self):
        from storage import make_library_storage_key

        key = make_library_storage_key("user-1", "asset-2", "clip.mp4")
        assert key == "users/user-1/library/asset-2/clip.mp4"

    def test_validate_library_image(self):
        from storage import validate_library_file

        mime = validate_library_file("photo.jpg", "image/jpeg", 1024)
        assert mime == "image/jpeg"

    def test_validate_library_video(self):
        from storage import validate_library_file

        mime = validate_library_file("clip.mp4", "video/mp4", 1024)
        assert mime == "video/mp4"

    def test_rejects_audio_for_library(self):
        from exceptions import UnsupportedFileTypeError
        from storage import validate_library_file

        with pytest.raises(UnsupportedFileTypeError):
            validate_library_file("song.mp3", "audio/mpeg", 1024)
