"""Tests for ElevenLabs API key validation."""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../apps/api"))

from services.elevenlabs_health import validate_api_key_format


class TestElevenLabsKeyFormat:

    def test_sk_key_valid(self):
        assert validate_api_key_format("sk_" + "a" * 48) is None

    def test_short_hex_dashboard_id_rejected(self):
        err = validate_api_key_format("5a15de7008b66e7eb3d8b63799b9b69d")
        assert err is not None

    def test_64_char_hex_secret_accepted(self):
        key = "51479bfd99b952f18e22d35a4ef6918ef51e12908e7c22dee0b327e8ea05654b"
        assert validate_api_key_format(key) is None

    def test_empty_rejected(self):
        assert validate_api_key_format("") is not None
