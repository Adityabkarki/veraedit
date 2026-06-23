"""Tests for SFX catalog service."""
from __future__ import annotations

from services.sfx_library import json_catalog_items, resolve_sfx_slug


def test_json_catalog_has_whoosh_and_shutter():
    items = json_catalog_items()
    slugs = {i["slug"] for i in items}
    assert "whoosh" in slugs
    assert "shutter_click" in slugs
    assert "sub_bass" in slugs
    assert len(items) >= 10


def test_resolve_sfx_slug_maps_legacy_types():
    assert resolve_sfx_slug("click") == "shutter_click"
    assert resolve_sfx_slug("whoosh") == "whoosh"
    assert resolve_sfx_slug("sub_bass_thud") == "sub_bass"
    assert resolve_sfx_slug("sfx", tool_id="sfx_shutter_click") == "shutter_click"


def test_catalog_items_have_preview_urls():
    for item in json_catalog_items():
        assert item["preview_url"].startswith("/sfx/")
        assert item["preview_url"].endswith(".mp3")
