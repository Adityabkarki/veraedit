#!/usr/bin/env python3
"""
One-time migration: re-encode JSON AudioAnalysisTrack sidecars as binary blobs (Phase 13).

Run against staging first:
    PYTHONPATH=apps/api python scripts/migrate_audio_analysis_binary.py --dry-run
    PYTHONPATH=apps/api python scripts/migrate_audio_analysis_binary.py
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "apps" / "api"))

from processors.audio_analysis_binary import decode_sidecar_payload, encode_analysis_track
from processors.storage_helpers import storage_sync
from services.audio_analysis_service import sidecar_storage_key

log = logging.getLogger("migrate_audio_analysis_binary")


def list_json_sidecar_keys(prefix: str = "projects/") -> list[str]:
    keys: list[str] = []
    paginator = storage_sync.client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=storage_sync.bucket, Prefix=prefix):
        for obj in page.get("Contents") or []:
            key = str(obj["Key"])
            if key.endswith(".json") and "/audio-analysis/" in key:
                keys.append(key)
    return keys


def migrate_key(key: str, *, dry_run: bool) -> bool:
    resp = storage_sync.client.get_object(Bucket=storage_sync.bucket, Key=key)
    raw = resp["Body"].read()
    track = decode_sidecar_payload(raw)
    if not track or not track.get("frames"):
        log.warning("skip_unreadable key=%s", key)
        return False

    parts = key.replace(".json", "").split("_")
    if len(parts) < 3:
        log.warning("skip_unexpected_key key=%s", key)
        return False

    source_hash = parts[-3].split("/")[-1]
    binary_key = key.replace(".json", ".vae.bin.gz")
    payload = encode_analysis_track(track)
    json_size = len(raw)
    binary_size = len(payload)
    log.info(
        "migrate key=%s json=%d binary=%d ratio=%.2f",
        key,
        json_size,
        binary_size,
        binary_size / max(json_size, 1),
    )

    if dry_run:
        return True

    storage_sync.put_object(
        binary_key,
        payload,
        content_type="application/vnd.viraedit.audio-analysis+binary",
    )
    return True


def main() -> int:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="Migrate audio analysis JSON → binary")
    parser.add_argument("--dry-run", action="store_true", help="Report only, no writes")
    parser.add_argument("--prefix", default="projects/", help="MinIO key prefix")
    args = parser.parse_args()

    keys = list_json_sidecar_keys(args.prefix)
    log.info("found %d json sidecars under %s", len(keys), args.prefix)
    migrated = sum(migrate_key(k, dry_run=args.dry_run) for k in keys)
    log.info("done migrated=%d/%d dry_run=%s", migrated, len(keys), args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
