"""
ViraEdit — Style Transfer package (EP-2.8).

Extracts editing style (pacing, color, captions, transitions) from a
reference video URL or file and applies it to the user's project timeline.

Public API:
    from tasks.style_transfer import StyleExtractor, StyleApplicator, VideoDownloader
    from tasks.style_transfer.models import StyleDNA, StylePreset
"""
from .downloader import VideoDownloader, VideoDownloadError
from .extractor import StyleExtractor
from .applicator import StyleApplicator
from .models import (
    StyleDNA,
    StylePreset,
    PacingProfile,
    CaptionStyleProfile,
    ColorProfile,
    TransitionProfile,
    AudioProfile,
    VisualProfile,
    HookProfile,
    BrollProfile,
)

__all__ = [
    "VideoDownloader",
    "VideoDownloadError",
    "StyleExtractor",
    "StyleApplicator",
    "StyleDNA",
    "StylePreset",
    "PacingProfile",
    "CaptionStyleProfile",
    "ColorProfile",
    "TransitionProfile",
    "AudioProfile",
    "VisualProfile",
    "HookProfile",
    "BrollProfile",
]
