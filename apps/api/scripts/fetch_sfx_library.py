"""
Download royalty-free SFX (Mixkit) into the app bundle + optional DB seed.

Run:
    cd apps/api
    python -m scripts.fetch_sfx_library

Or:
    scripts\\fetch_sfx.bat
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

DATA_PATH = Path(__file__).parent.parent / "data" / "sfx_catalog.json"
WEB_SFX_DIR = Path(__file__).parent.parent.parent / "web" / "public" / "sfx"
API_SFX_DIR = Path(__file__).parent.parent / "static" / "sfx"


def mixkit_preview_url(mixkit_id: int) -> str:
    return f"https://assets.mixkit.co/active_storage/sfx/{mixkit_id}/{mixkit_id}-preview.mp3"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "ViraEdit-SFX-Fetch/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if len(data) < 500:
        raise RuntimeError(f"Download too small ({len(data)} bytes): {url}")
    dest.write_bytes(data)
    print(f"  OK {dest.name} ({len(data) // 1024} KB)")


def main() -> int:
    catalog = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    items = catalog.get("items", [])
    if not items:
        print("No items in sfx_catalog.json")
        return 1

    WEB_SFX_DIR.mkdir(parents=True, exist_ok=True)
    API_SFX_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {len(items)} SFX files (Mixkit preview MP3s)...")
    for item in items:
        slug = item["slug"]
        mixkit_id = int(item["mixkit_id"])
        url = mixkit_preview_url(mixkit_id)
        filename = f"{slug}.mp3"
        try:
            download(url, WEB_SFX_DIR / filename)
            download(url, API_SFX_DIR / filename)
            item["file_name"] = filename
            item["source_url"] = url
        except Exception as exc:
            print(f"  FAIL {slug}: {exc}")
            return 1

    DATA_PATH.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Done. Files in {WEB_SFX_DIR}")
    print("Next: python -m scripts.seed_sfx_library  (optional DB seed)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
