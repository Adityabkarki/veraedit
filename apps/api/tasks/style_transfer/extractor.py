"""
ViraEdit — Style Extractor (EP-2.8 / T-2.8.2).

Analyzes a reference video and extracts its editing style as a StyleDNA.

All extraction methods are independent — run in parallel via asyncio.gather().
Each method has a try/except so one failing component doesn't block others.

Extraction components:
  pacing     → PySceneDetect scene detection → cuts/min, rhythm
  color      → OpenCV frame sampling → brightness, contrast, temperature
  captions   → OpenCV edge detection → text position, color presence
  transitions→ Scene duration distribution → primary cut type
  audio      → FFmpeg PCM extraction → music energy level
  hook       → First-10s scene count → hook type classification
  visuals    → Frame edge density → overlay density
  broll      → Short scene ratio → b-roll frequency

Cost: $0.00 — all local processing, no API calls.
(Hook LLM classification from the reference file is omitted for zero cost.)
"""
from __future__ import annotations

import asyncio
import logging
import pathlib
import statistics
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Optional

from .models import (
    AudioProfile,
    BrollProfile,
    CaptionStyleProfile,
    ColorProfile,
    HookProfile,
    PacingProfile,
    StyleDNA,
    TransitionProfile,
    VisualProfile,
)

log = logging.getLogger("viraedit.style_transfer.extractor")

ALL_COMPONENTS = [
    "pacing", "color", "captions", "transitions",
    "audio", "hook", "visuals", "broll", "vision",
]


class StyleExtractor:
    """
    Analyzes a reference video file and extracts a StyleDNA.

    Usage:
        extractor = StyleExtractor()
        dna = await extractor.extract(
            video_path,
            components=["captions", "color"],  # None = all
            source_url="https://...",
        )
    """

    async def extract(
        self,
        video_path: pathlib.Path,
        components: Optional[list[str]] = None,
        source_url: str = "",
        source_title: str = "",
    ) -> StyleDNA:
        """
        Extract style from a video file.

        Args:
            video_path:   Local path to the video file.
            components:   List of components to extract, or None for all.
            source_url:   Original URL (stored in StyleDNA metadata).
            source_title: Video title (stored in StyleDNA metadata).

        Returns:
            StyleDNA with all requested components populated.
            Failed components use sensible defaults (logged at WARNING level).
        """
        active = set(components if components is not None else ALL_COMPONENTS)

        log.info(
            "style_extraction_start: file=%s components=%s",
            video_path.name, sorted(active),
        )

        # Scene detection is shared between pacing, transitions, hook, and broll
        scenes: list[dict] = []
        needs_scenes = active & {"pacing", "transitions", "hook", "broll", "vision"}
        if needs_scenes:
            scenes = await self._extract_scenes(video_path)

        # Run all remaining extractions in parallel
        coroutines: dict[str, Any] = {}
        if "color" in active:
            coroutines["color"] = self._extract_color(video_path)
        if "audio" in active:
            coroutines["audio"] = self._extract_audio(video_path)
        if "captions" in active:
            coroutines["captions"] = self._extract_captions(video_path)
        if "visuals" in active:
            coroutines["visuals"] = self._extract_visuals(video_path)
        if "vision" in active:
            coroutines["vision"] = self._extract_vision(video_path, scenes)

        keys = list(coroutines.keys())
        parallel_results = await asyncio.gather(
            *coroutines.values(), return_exceptions=True
        )
        results: dict[str, Any] = dict(zip(keys, parallel_results))

        # Log failures (non-fatal)
        for key, val in results.items():
            if isinstance(val, Exception):
                log.warning(
                    "style_component_failed: component=%s error=%s", key, val
                )

        def _ok(key: str, profile_cls):
            val = results.get(key)
            return val if isinstance(val, profile_cls) else profile_cls()

        vision_result = results.get("vision")
        if isinstance(vision_result, Exception):
            vision_result = None

        dna = StyleDNA(
            pacing=self._build_pacing(scenes) if "pacing" in active else PacingProfile(),
            captions=_ok("captions", CaptionStyleProfile),
            color=_ok("color", ColorProfile),
            transitions=self._build_transitions(scenes) if "transitions" in active else TransitionProfile(),
            audio=_ok("audio", AudioProfile),
            visuals=_ok("visuals", VisualProfile),
            hook=self._build_hook(scenes) if "hook" in active else HookProfile(),
            broll=self._build_broll(scenes) if "broll" in active else BrollProfile(),
            source_url=source_url,
            source_title=source_title,
            extracted_at=datetime.now(timezone.utc).isoformat(),
        )

        if vision_result is not None:
            self._merge_vision_into_dna(dna, vision_result)

        self._last_vision = vision_result

        log.info(
            "style_extraction_complete: source=%s pacing=%.0fms cuts/min=%.1f color_brightness=%.3f",
            source_url or video_path.name,
            dna.pacing.avg_cut_duration_ms,
            dna.pacing.cuts_per_minute,
            dna.color.brightness,
        )
        return dna

    def build_edit_recipe(
        self,
        dna: StyleDNA,
        video_path: pathlib.Path,
        scenes: list[dict] | None = None,
        vision=None,
    ):
        """Build normalized edit recipe from extracted DNA + scene list + vision."""
        from .edit_recipe import build_edit_recipe

        if scenes is None:
            scenes = self._detect_scenes_sync(video_path)
        ref_s = self._reference_duration_s(video_path, scenes)
        if vision is None:
            vision = getattr(self, "_last_vision", None)
        return build_edit_recipe(dna, scenes, ref_s, vision=vision)

    @staticmethod
    def _merge_vision_into_dna(dna: StyleDNA, vision) -> None:
        """Enrich StyleDNA profiles with vision findings."""
        hints = vision.caption_hints or {}
        if hints.get("position"):
            dna.captions.position = str(hints["position"])
        if hints.get("animation"):
            dna.captions.animation = str(hints["animation"])
        if hints.get("font_size_vw"):
            dna.captions.font_size_vw = float(hints["font_size_vw"])
        if hints.get("case"):
            dna.captions.case = str(hints["case"])
        if hints.get("color"):
            dna.captions.color = str(hints["color"])
        if hints.get("stroke"):
            dna.captions.stroke = str(hints["stroke"])
        if hints.get("stroke_width"):
            dna.captions.stroke_width = int(hints["stroke_width"])

        if vision.transition_primary:
            dna.transitions.primary_type = vision.transition_primary
            if vision.transition_primary in ("dissolve", "fade", "zoom"):
                dna.transitions.avg_duration_ms = 250.0

        dna.visuals.uses_text_overlays = (
            dna.visuals.uses_text_overlays or vision.uses_text_overlays
        )
        dna.visuals.overlay_density = vision.overlay_density or dna.visuals.overlay_density
        if vision.hook_uses_text:
            dna.hook.uses_text_hook_overlay = True

    async def _extract_vision(
        self, video_path: pathlib.Path, scenes: list[dict],
    ):
        from .vision_analyzer import VisionAnalyzer

        loop = asyncio.get_event_loop()
        ref_s = self._reference_duration_s(video_path, scenes)
        return await loop.run_in_executor(
            None,
            lambda: VisionAnalyzer().analyze(video_path, scenes, ref_s),
        )

    def _reference_duration_s(
        self, video_path: pathlib.Path, scenes: list[dict],
    ) -> float:
        if scenes:
            return max(float(s.get("end_ms", 0)) for s in scenes) / 1000.0
        try:
            import cv2
            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
            cap.release()
            if frames > 0 and fps > 0:
                return frames / fps
        except Exception:
            pass
        return 30.0

    # ── Scene detection ───────────────────────────────────────────────────────

    async def _extract_scenes(self, video_path: pathlib.Path) -> list[dict]:
        """Run PySceneDetect in a thread (CPU-bound)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._detect_scenes_sync, video_path)

    @staticmethod
    def _timecode_to_ms(timecode) -> float:
        """Convert PySceneDetect FrameTimecode to milliseconds (API varies by version)."""
        if hasattr(timecode, "get_milliseconds"):
            return float(timecode.get_milliseconds())
        return float(timecode.get_seconds()) * 1000.0

    def _detect_scenes_sync(self, video_path: pathlib.Path) -> list[dict]:
        """Synchronous scene detection via PySceneDetect."""
        try:
            from scenedetect import detect, ContentDetector
            scenes = detect(str(video_path), ContentDetector(threshold=27.0))
            result = [
                {
                    "start_ms": self._timecode_to_ms(start),
                    "end_ms": self._timecode_to_ms(end),
                    "duration_ms": self._timecode_to_ms(end) - self._timecode_to_ms(start),
                }
                for start, end in scenes
            ]
            log.info("scenes_detected: count=%d file=%s", len(result), video_path.name)
            return result
        except Exception as exc:
            log.warning("scene_detect_failed: %s", exc)
            return []

    # ── Pacing / transitions / hook / broll (derived from scenes) ─────────────

    def _build_pacing(self, scenes: list[dict]) -> PacingProfile:
        """Derive pacing metrics from scene list."""
        if not scenes:
            return PacingProfile()
        durations = [s["duration_ms"] for s in scenes]
        total_ms = sum(durations)
        avg_dur = statistics.mean(durations)
        variance = statistics.stdev(durations) if len(durations) > 1 else 0.0
        cuts_pm = (len(scenes) / (total_ms / 60_000)) if total_ms > 0 else 0.0
        # Classify rhythm by coefficient of variation
        cv = variance / avg_dur if avg_dur > 0 else 0.0
        rhythm = "constant" if cv < 0.3 else "variable" if cv < 0.7 else "building"
        return PacingProfile(
            avg_cut_duration_ms=round(avg_dur, 1),
            cuts_per_minute=round(cuts_pm, 2),
            rhythm=rhythm,
            rhythm_variance=round(variance, 1),
        )

    def _build_transitions(self, scenes: list[dict]) -> TransitionProfile:
        """Infer primary transition type from scene pacing."""
        if not scenes:
            return TransitionProfile()
        avg_dur = statistics.mean(s["duration_ms"] for s in scenes)
        # Fast-cut videos use hard cuts; slower videos may use dissolves
        primary = "cut" if avg_dur < 3000 else "dissolve"
        return TransitionProfile(primary_type=primary, avg_duration_ms=0.0)

    def _build_hook(self, scenes: list[dict]) -> HookProfile:
        """Classify hook structure from scene count in first 10 seconds."""
        hook_scenes = [s for s in scenes if s["start_ms"] < 10_000]
        n_cuts = len(hook_scenes)
        if n_cuts >= 5:
            hook_type = "reaction"
        elif n_cuts >= 2:
            hook_type = "bold_claim"
        else:
            hook_type = "story"
        return HookProfile(
            hook_type=hook_type,
            hook_duration_s=min(10.0, n_cuts * 2.0) if n_cuts else 5.0,
            uses_text_hook_overlay=n_cuts >= 3,
        )

    def _build_broll(self, scenes: list[dict]) -> BrollProfile:
        """Estimate b-roll frequency: short scenes are often cutaways."""
        if not scenes:
            return BrollProfile()
        durations = [s["duration_ms"] for s in scenes]
        avg_dur = statistics.mean(durations)
        short_count = sum(1 for d in durations if d < avg_dur / 2)
        broll_ratio = short_count / len(durations)
        freq = "low" if broll_ratio < 0.15 else "medium" if broll_ratio < 0.40 else "high"
        return BrollProfile(
            frequency=freq,
            avg_broll_duration_ms=round(avg_dur / 2, 1),
        )

    # ── Color analysis ────────────────────────────────────────────────────────

    async def _extract_color(self, video_path: pathlib.Path) -> ColorProfile:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._extract_color_sync, video_path)

    def _extract_color_sync(self, video_path: pathlib.Path) -> ColorProfile:
        """Sample frames via OpenCV and compute color statistics."""
        try:
            import cv2
            import numpy as np

            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            sample_interval = max(1, int(fps * 2))  # 1 sample per 2 seconds
            frames_data: list[tuple[float, float, float]] = []  # (brightness, sat, hue)

            for frame_idx in range(0, min(total_frames, int(fps * 120)), sample_interval):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                if not ret:
                    break
                hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV).astype(float)
                h_mean = float(np.mean(hsv[:, :, 0]))   # 0–180
                s_mean = float(np.mean(hsv[:, :, 1]))   # 0–255
                v_mean = float(np.mean(hsv[:, :, 2]))   # 0–255
                frames_data.append((v_mean, s_mean, h_mean))

            cap.release()

            if not frames_data:
                return ColorProfile()

            v_vals = [f[0] for f in frames_data]
            s_vals = [f[1] for f in frames_data]
            h_vals = [f[2] for f in frames_data]

            brightness = (statistics.mean(v_vals) / 255.0) - 0.5   # delta from neutral
            contrast = statistics.stdev(v_vals) / 255.0 if len(v_vals) > 1 else 0.0
            saturation = (statistics.mean(s_vals) / 255.0) - 0.5
            # Hue 0–30 or 150–180 = warm (reds/oranges), 90–150 = cool (blues/greens)
            mean_h = statistics.mean(h_vals)
            # Normalize: warm reds/yellows → positive, cool blues → negative
            if mean_h < 30 or mean_h > 150:
                temperature = 0.2   # warm
            elif 60 < mean_h < 120:
                temperature = -0.2  # cool
            else:
                temperature = 0.0

            return ColorProfile(
                brightness=round(brightness, 3),
                contrast=round(contrast, 3),
                saturation=round(saturation, 3),
                temperature=temperature,
            )
        except Exception as exc:
            log.warning("color_extract_failed: %s", exc)
            return ColorProfile()

    # ── Audio analysis ────────────────────────────────────────────────────────

    async def _extract_audio(self, video_path: pathlib.Path) -> AudioProfile:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._extract_audio_sync, video_path)

    def _extract_audio_sync(self, video_path: pathlib.Path) -> AudioProfile:
        """Extract first 60 seconds of audio via FFmpeg and measure energy."""
        try:
            import subprocess
            import numpy as np

            # Extract mono PCM at 16 kHz (60s max)
            cmd = [
                "ffmpeg", "-i", video_path.as_posix(),
                "-ac", "1", "-ar", "16000",
                "-f", "f32le", "-t", "60",
                "pipe:1",
            ]
            proc = subprocess.run(
                cmd,
                capture_output=True,
                timeout=30,
            )
            if proc.returncode != 0 or len(proc.stdout) < 4096:
                return AudioProfile()

            audio = np.frombuffer(proc.stdout, dtype=np.float32)
            rms = float(np.sqrt(np.mean(audio ** 2)))

            if rms < 0.02:
                energy = "none"
            elif rms < 0.08:
                energy = "low"
            elif rms < 0.15:
                energy = "medium"
            else:
                energy = "high"

            log.info("audio_extracted: rms=%.4f energy=%s", rms, energy)
            return AudioProfile(music_energy=energy)
        except Exception as exc:
            log.warning("audio_extract_failed: %s", exc)
            return AudioProfile()

    # ── Caption detection ─────────────────────────────────────────────────────

    async def _extract_captions(self, video_path: pathlib.Path) -> CaptionStyleProfile:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._extract_captions_sync, video_path)

    def _extract_captions_sync(self, video_path: pathlib.Path) -> CaptionStyleProfile:
        """
        Sample frames and detect text region position using edge density.
        Analyzes bottom/center/top thirds of frame for text-like regions.
        """
        try:
            import cv2
            import numpy as np

            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            sample_interval = max(1, int(fps))  # 1 sample per second
            positions: list[str] = []
            bright_fractions: list[float] = []

            for frame_idx in range(0, min(total_frames, int(fps * 60)), sample_interval):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                if not ret:
                    break
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                edges = cv2.Canny(gray, 100, 200)

                # Edge count in each vertical third
                h3 = height // 3
                top_e = int(np.sum(edges[:h3, :]))
                mid_e = int(np.sum(edges[h3: 2 * h3, :]))
                bot_e = int(np.sum(edges[2 * h3:, :]))

                if bot_e > top_e and bot_e > mid_e:
                    positions.append("bottom")
                elif mid_e > top_e:
                    positions.append("center")
                else:
                    positions.append("top")

                # Detect bright/white text
                bright = float(np.sum(gray > 220)) / gray.size
                bright_fractions.append(bright)

            cap.release()

            if not positions:
                return CaptionStyleProfile()

            position = Counter(positions).most_common(1)[0][0]
            is_bright = (
                (sum(bright_fractions) / len(bright_fractions)) > 0.02
                if bright_fractions else False
            )

            return CaptionStyleProfile(
                position=position,
                color="#FFFFFF" if is_bright else "#FFFF00",
            )
        except Exception as exc:
            log.warning("captions_extract_failed: %s", exc)
            return CaptionStyleProfile()

    # ── Visual overlay density ────────────────────────────────────────────────

    async def _extract_visuals(self, video_path: pathlib.Path) -> VisualProfile:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._extract_visuals_sync, video_path)

    def _extract_visuals_sync(self, video_path: pathlib.Path) -> VisualProfile:
        """Detect visual overlay frequency from edge density in the top half of frames."""
        try:
            import cv2
            import numpy as np

            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            sample_interval = max(1, int(fps * 2))
            overlay_frames = 0
            total_samples = 0

            for frame_idx in range(0, min(total_frames, int(fps * 120)), sample_interval):
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
                ret, frame = cap.read()
                if not ret:
                    break
                total_samples += 1
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                h = gray.shape[0]
                top_half = gray[:h // 2, :]
                edges = cv2.Canny(top_half, 100, 200)
                # Edge density > 5% in top half suggests text/graphic overlay
                edge_density = float(np.sum(edges)) / (top_half.size * 255)
                if edge_density > 0.05:
                    overlay_frames += 1

            cap.release()

            if total_samples == 0:
                return VisualProfile()

            ratio = overlay_frames / total_samples
            if ratio < 0.10:
                density = "sparse"
            elif ratio < 0.40:
                density = "moderate"
            else:
                density = "dense"

            return VisualProfile(
                uses_text_overlays=ratio > 0.10,
                overlay_density=density,
            )
        except Exception as exc:
            log.warning("visuals_extract_failed: %s", exc)
            return VisualProfile()
