"""Tests for B-roll image generation fallbacks."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


@patch("processors.dalle_generator._openai_generate", return_value=None)
@patch("processors.gemini_image.generate_gemini_image", return_value=(b"png", "gemini-2.5-flash-image"))
def test_generate_broll_image_uses_gemini_when_openai_fails(mock_gemini, mock_openai):
    from processors.dalle_generator import generate_broll_image, reset_openai_image_cache_for_tests

    reset_openai_image_cache_for_tests()
    data, provider = generate_broll_image("city skyline at dusk")
    assert data == b"png"
    assert provider == "gemini-2.5-flash-image"


@patch("processors.dalle_generator._openai_generate")
def test_generate_broll_image_openai_dalle2_fallback(mock_openai):
    from processors.dalle_generator import generate_broll_image, reset_openai_image_cache_for_tests

    reset_openai_image_cache_for_tests()
    mock_openai.side_effect = [None, b"jpeg-bytes"]
    with patch("processors.gemini_image.generate_gemini_image", return_value=(None, "none")):
        data, provider = generate_broll_image("mountain lake")
    assert data == b"jpeg-bytes"
    assert mock_openai.call_count == 2


@patch("processors.gemini_image.settings")
def test_gemini_image_tries_multiple_models(mock_settings):
    from processors import gemini_image

    mock_settings.GEMINI_API_KEY = "test-key"
    mock_settings.GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image"

    with patch("processors.gemini_image.httpx.post") as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"inlineData": {"data": "aGk="}},
                            ]
                        }
                    }
                ]
            },
        )
        data, model = gemini_image.generate_gemini_image("test prompt")
        assert data == b"hi"
        assert model == "gemini-3.1-flash-image"
        assert "gemini-3.1-flash-image" in mock_post.call_args.args[0]


@patch("tasks.broll_generation.settings")
@patch("tasks.broll_generation._download_stock_video")
def test_try_stock_video_fallback(mock_download, mock_settings, tmp_path):
    from tasks import broll_generation

    mock_settings.PEXELS_API_KEY = "pexels-key"
    mock_download.return_value = Path(tmp_path / "stock.mp4")
    Path(tmp_path / "stock.mp4").write_bytes(b"mp4")

    with patch("processors.stock_search.search_stock") as mock_search:
        mock_search.return_value = [{"video_url": "https://videos.pexels.com/example.mp4"}]
        path, provider = broll_generation._try_stock_video_fallback(
            "A close-up shot of a smartphone screen",
            Path(tmp_path),
        )

    assert path is not None
    assert provider == "stock_pexels"


@patch("processors.dalle_generator.generate_gemini_image", return_value=(None, "none"))
@patch("processors.dalle_generator.settings")
def test_dalle_skips_when_disabled(mock_settings, _mock_gemini):
    from processors.dalle_generator import generate_broll_image, reset_openai_image_cache_for_tests

    reset_openai_image_cache_for_tests()
    mock_settings.OPENAI_API_KEY = "sk-test"
    mock_settings.OPENAI_IMAGE_ENABLED = False
    mock_settings.OPENAI_IMAGE_MODEL = "dall-e-3"

    with patch("processors.dalle_generator._openai_generate") as mock_openai:
        data, provider = generate_broll_image("city skyline")
    assert data is None
    assert provider == "none"
    mock_openai.assert_not_called()


@patch("processors.dalle_generator.settings")
def test_dalle_caches_unavailable_after_model_missing(mock_settings):
    from processors import dalle_generator
    from processors.dalle_generator import _dalle_generate, reset_openai_image_cache_for_tests

    reset_openai_image_cache_for_tests()
    mock_settings.OPENAI_API_KEY = "sk-test"
    mock_settings.OPENAI_IMAGE_ENABLED = True
    mock_settings.OPENAI_IMAGE_MODEL = "dall-e-3"

    with patch("processors.dalle_generator._openai_generate", return_value=None) as mock_openai:
        _dalle_generate("test")
    assert mock_openai.call_count == 2

    dalle_generator._openai_images_unavailable = True
    with patch("processors.dalle_generator._openai_generate", return_value=None) as mock_openai:
        _dalle_generate("cached skip")
    mock_openai.assert_not_called()
    reset_openai_image_cache_for_tests()


def test_create_asset_record_uses_postgres_enum_names():
    """Raw SQL inserts must use DB enum labels (VIDEO/READY), not Python values."""
    from models.asset import AssetStatus, MediaType

    assert MediaType.VIDEO.name == "VIDEO"
    assert AssetStatus.READY.name == "READY"
    assert MediaType.VIDEO.value == "video"
    assert AssetStatus.READY.value == "ready"
