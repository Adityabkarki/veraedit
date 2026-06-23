"""
ViraEdit — Video Downloader for Style Transfer (EP-2.8 / T-2.8.1).

Downloads reference videos from social media URLs for style analysis.
Uses yt-dlp — supports YouTube, TikTok, Instagram, Twitter/X.
Downloads at 480p (style analysis doesn't need HD).
Auto-deletes files after extraction.

Supported URLs:
  - YouTube:          https://youtube.com/watch?v=...  / https://youtu.be/...
  - TikTok:          https://tiktok.com/@user/video/...
  - Instagram Reels:  https://instagram.com/reel/...
  - Twitter/X:       https://twitter.com/.../status/...
  - Direct MP4:      https://example.com/video.mp4

Usage:
    downloader = VideoDownloader()
    try:
        path = downloader.download("https://youtube.com/watch?v=abc123")
        # ... extract style ...
    finally:
        downloader.delete(path)
"""
from __future__ import annotations

import logging
import pathlib
import re
import tempfile
import uuid
from typing import Optional
from urllib.parse import parse_qs, unquote, urlparse

log = logging.getLogger("viraedit.style_transfer.downloader")

# Known platforms (also used for preset naming)
SUPPORTED_PLATFORMS: dict[str, str] = {
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "tiktok.com": "tiktok",
    "instagram.com": "instagram",
    "twitter.com": "twitter",
    "x.com": "twitter",
    "facebook.com": "facebook",
    "fb.watch": "facebook",
    "fb.com": "facebook",
}

VIDEO_EXTENSIONS = (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi")

# Search engines and non-video hosts — never pass to yt-dlp as "generic"
BLOCKED_HOST_SUFFIXES: tuple[str, ...] = (
    "google.com",
    "google.com.np",
    "google.co.uk",
    "googleusercontent.com",
    "gstatic.com",
    "bing.com",
    "duckduckgo.com",
    "yahoo.com",
    "search.yahoo.com",
    "baidu.com",
)

# Maximum video length for style analysis (30 minutes)
MAX_DURATION_SECONDS = 1800


class VideoDownloadError(Exception):
    """Raised when a video cannot be downloaded for style analysis."""
    pass


class VideoDownloader:
    """
    Downloads reference videos from URLs for style analysis.

    Design rules:
    - Downloads at 480p (lowest quality that preserves style info)
    - Saves to a temp directory (auto-created)
    - Caller is responsible for calling .delete() after extraction
    - Private/age-restricted videos fail with a clear error message
    - Videos over 30 minutes are rejected (style analysis only needs a sample)
    """

    def __init__(self, temp_dir: Optional[str] = None):
        self._temp_dir = pathlib.Path(temp_dir or tempfile.gettempdir()) / "viraedit_style"
        self._temp_dir.mkdir(parents=True, exist_ok=True)
        self._last_video_info: dict | None = None

    @property
    def temp_dir(self) -> pathlib.Path:
        return self._temp_dir

    def normalize_url(self, url: str) -> str:
        """Strip whitespace and ensure a scheme so urlparse works."""
        cleaned = (url or "").strip()
        if not cleaned:
            return ""
        if not re.match(r"^https?://", cleaned, re.I):
            if re.match(r"^[a-z][a-z0-9+.-]*://", cleaned, re.I):
                return cleaned  # non-http scheme — leave as-is for detect_platform to reject
            cleaned = f"https://{cleaned}"
        return self.unwrap_redirect_url(cleaned)

    def unwrap_redirect_url(self, url: str) -> str:
        """
        Unwrap search-engine redirect links (common when copying from Google results).
        Returns the inner video URL when found, otherwise the original URL.
        """
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower().split(":")[0]
        if host.startswith("www."):
            host = host[4:]

        if host.endswith("google.com") and parsed.path in ("/url", "/imgres"):
            for key in ("url", "q", "u"):
                raw = parse_qs(parsed.query).get(key, [None])[0]
                if raw:
                    target = unquote(raw).strip()
                    if target.startswith(("http://", "https://")):
                        return self.unwrap_redirect_url(target)

        return url

    def _host_blocked(self, host: str) -> bool:
        h = host.lower()
        if h.startswith("www."):
            h = h[4:]
        if h.startswith("m."):
            h = h[2:]
        return any(h == suffix or h.endswith(f".{suffix}") for suffix in BLOCKED_HOST_SUFFIXES)

    def get_last_video_info(self) -> dict:
        """Metadata from the most recent download (title, uploader, duration, …)."""
        return dict(self._last_video_info or {})

    def fetch_video_title(self, url: str) -> str:
        """Fetch video title without downloading (for template naming)."""
        try:
            import yt_dlp
        except ImportError:
            return ""
        normalized = self.normalize_url(url)
        if not normalized or self.detect_platform(normalized) is None:
            return ""
        meta_opts = {
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "playlistend": 1,
            "ignoreconfig": True,
            "skip_download": True,
        }
        try:
            with yt_dlp.YoutubeDL(meta_opts) as ydl:
                info = ydl.extract_info(normalized, download=False)
                title = str(info.get("title") or "").strip()
                self._last_video_info = info
                return title
        except Exception:
            return ""

    def detect_platform(self, url: str) -> Optional[str]:
        """
        Detect which platform a URL belongs to.
        Returns the platform name, 'direct' for file URLs, 'generic' for other
        http(s) links yt-dlp may support, or None if not a valid URL.
        """
        normalized = self.normalize_url(url)
        if not normalized:
            return None

        parsed = urlparse(normalized)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return None

        host = parsed.netloc.lower().split(":")[0]
        if host.startswith("www."):
            host = host[4:]
        if host.startswith("m."):
            host = host[2:]

        if self._host_blocked(host):
            return None

        for domain, platform in SUPPORTED_PLATFORMS.items():
            if host == domain or host.endswith(f".{domain}"):
                return platform

        path_lower = (parsed.path or "").lower()
        if any(path_lower.endswith(ext) for ext in VIDEO_EXTENSIONS):
            return "direct"
        if any(f"{ext}?" in normalized.lower() for ext in VIDEO_EXTENSIONS):
            return "direct"

        # Any other http(s) URL — let yt-dlp attempt (Vimeo, Reddit, Drive public links, etc.)
        return "generic"

    def download(self, url: str) -> pathlib.Path:
        """
        Download video at 480p for style analysis.

        Args:
            url: Public video URL (YouTube, TikTok, Instagram, Twitter, or direct MP4)

        Returns:
            pathlib.Path to the downloaded file.

        Raises:
            VideoDownloadError: If the video cannot be downloaded (private, unavailable,
                too long, unsupported platform, or yt-dlp not installed).
        """
        try:
            import yt_dlp
        except ImportError:
            raise VideoDownloadError(
                "yt-dlp is not installed. Run: pip install yt-dlp"
            )

        platform = self.detect_platform(url)
        if platform is None:
            raise VideoDownloadError(
                "Invalid URL. Paste a full link starting with https:// "
                "(YouTube, TikTok, Instagram, Facebook, or a direct .mp4 URL)."
            )

        download_url = self.normalize_url(url)
        file_id = str(uuid.uuid4())[:8]
        output_template = str(self._temp_dir / f"style_ref_{file_id}.%(ext)s")

        ydl_opts: dict = {
            # Prefer a single combined stream; fall back to video+audio merge (needs ffmpeg).
            "format": (
                "best[height<=480][vcodec!*=none][acodec!*=none]/"
                "best[height<=720][vcodec!*=none][acodec!*=none]/"
                "best[height<=480]+bestaudio/best[height<=720]+bestaudio/best"
            ),
            "merge_output_format": "mp4",
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "playlistend": 1,             # only first item if URL expands to a list
            "ignoreconfig": True,         # never inherit --max-downloads from user config
        }

        meta_opts = {**ydl_opts, "skip_download": True}

        try:
            # Separate yt-dlp instances — reusing one session for metadata + download
            # can trip max_downloads when merging video+audio streams.
            with yt_dlp.YoutubeDL(meta_opts) as ydl_meta:
                info = ydl_meta.extract_info(download_url, download=False)
                self._last_video_info = info
                duration = info.get("duration") or 0
                if duration > MAX_DURATION_SECONDS:
                    raise VideoDownloadError(
                        f"Video is {duration // 60} minutes long. "
                        f"Style analysis supports videos up to {MAX_DURATION_SECONDS // 60} minutes."
                    )

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([download_url])
                filename = ydl.prepare_filename(info)
                path = pathlib.Path(filename)

                # yt-dlp sometimes changes the extension after post-processing
                if not path.exists():
                    candidates = sorted(
                        self._temp_dir.glob(f"style_ref_{file_id}.*"),
                        key=lambda p: p.stat().st_mtime,
                        reverse=True,
                    )
                    if candidates:
                        path = candidates[0]
                    else:
                        raise VideoDownloadError(
                            "Download reported success but the file was not found."
                        )

                size_mb = path.stat().st_size / (1024 * 1024)
                log.info(
                    "style_video_downloaded: platform=%s size_mb=%.1f file=%s",
                    platform, size_mb, path.name,
                )
                return path

        except VideoDownloadError:
            raise
        except Exception as exc:
            error_str = str(exc)
            # Map common yt-dlp error messages to friendly user-facing messages
            if any(k in error_str for k in ("Private video", "Sign in", "age")):
                raise VideoDownloadError(
                    "This video is private or age-restricted and cannot be downloaded."
                )
            if "Video unavailable" in error_str or "removed" in error_str.lower():
                raise VideoDownloadError(
                    "This video is no longer available."
                )
            if "Unable to extract" in error_str:
                raise VideoDownloadError(
                    "Could not read this URL. Make sure it's a public video link."
                )
            if "max-downloads" in error_str.lower() or "max_downloads" in error_str.lower():
                raise VideoDownloadError(
                    "Could not download this video (format merge issue). Try a different link or a shorter clip."
                )
            if "Unsupported URL" in error_str or "unsupported url" in error_str.lower():
                raise VideoDownloadError(
                    "This link is not a supported video URL. Paste a direct YouTube, TikTok, "
                    "Instagram Reels, or Facebook video link — not a Google search or redirect page."
                )
            log.error("style_video_download_failed: url=%s error=%s", url, error_str)
            raise VideoDownloadError(f"Download failed: {error_str}")

    def delete(self, path: pathlib.Path) -> None:
        """
        Delete a downloaded video file after style extraction.
        Safe to call even if the file doesn't exist.
        """
        try:
            path.unlink(missing_ok=True)
            log.info("style_video_deleted: %s", path.name)
        except Exception as exc:
            log.warning("style_video_delete_failed: %s — %s", path.name, exc)
