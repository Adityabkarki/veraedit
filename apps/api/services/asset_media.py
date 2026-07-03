"""Resolve which MinIO object to use for playback vs export."""
from __future__ import annotations

from models.asset import Asset, MediaType, ProxyStatus


def source_storage_key(asset: Asset) -> str:
    """Full-quality original — used for export/render."""
    return asset.storage_key


def playback_storage_key(asset: Asset) -> str:
    """Edit/preview stream — proxy when ready, otherwise original."""
    if (
        asset.media_type == MediaType.VIDEO
        and asset.proxy_status == ProxyStatus.READY
        and asset.proxy_storage_key
    ):
        return asset.proxy_storage_key
    return asset.storage_key


def should_generate_proxy(asset: Asset) -> bool:
    return asset.media_type == MediaType.VIDEO
