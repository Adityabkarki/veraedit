#!/usr/bin/env python3
"""
Weekly canary: verify yt-dlp can still download from major platforms.

Run manually or via cron:
  python scripts/canary_download_test.py

Set CANARY_YOUTUBE_URL, CANARY_TIKTOK_URL, CANARY_INSTAGRAM_URL in the environment
to point at known-public test videos. Skips URLs that are unset.
"""
from __future__ import annotations

import os
import sys
import tempfile
import uuid
from pathlib import Path

# Allow running from repo root
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

CANARY_URLS = {
    "youtube": os.environ.get("CANARY_YOUTUBE_URL", ""),
    "tiktok": os.environ.get("CANARY_TIKTOK_URL", ""),
    "instagram": os.environ.get("CANARY_INSTAGRAM_URL", ""),
}


def main() -> int:
    from processors.downloader import download_video

    failures: list[str] = []
    skipped: list[str] = []

    for platform, url in CANARY_URLS.items():
        if not url.strip():
            skipped.append(platform)
            continue
        job_id = f"canary_{platform}_{uuid.uuid4().hex[:8]}"
        try:
            path = download_video(url.strip(), job_id)
            if not path.exists() or path.stat().st_size < 1024:
                failures.append(f"{platform}: file missing or too small")
            else:
                print(f"OK  {platform}: {path.stat().st_size} bytes")
        except Exception as exc:
            failures.append(f"{platform}: {exc}")
        finally:
            tmp = Path(tempfile.gettempdir()) / "viraedit" / job_id
            if tmp.exists():
                for p in tmp.iterdir():
                    p.unlink(missing_ok=True)
                tmp.rmdir()

    if skipped:
        print(f"Skipped (no URL set): {', '.join(skipped)}")

    if failures:
        print("CANARY FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1

    if len(skipped) == len(CANARY_URLS):
        print("No canary URLs configured — set CANARY_*_URL env vars.")
        return 0

    print("All configured canary downloads succeeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
