"""
Vision-based edit detection for style transfer.

Samples reference video frames and detects:
  • Caption / text overlay regions (EasyOCR when available, OpenCV fallback)
  • Split-screen and picture-in-picture layouts
  • Static logos in corners
  • Ken Burns / zoom within scenes
  • Transition types at scene cuts (cut, dissolve, zoom, whip)
  • Graphic overlays and lower-thirds

Output feeds build_edit_recipe() for a time-accurate edit template.
"""
from __future__ import annotations

import logging
import pathlib
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional

log = logging.getLogger("viraedit.style_transfer.vision")

# Cap samples so long references stay fast (~2 min analysis budget on CPU)
MAX_SAMPLES = 60
MIN_SAMPLE_INTERVAL_MS = 500


@dataclass
class DetectedEdit:
    """One vision-detected edit on the reference timeline."""
    kind: str
    start_ms: float
    end_ms: float
    label: str = ""
    params: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.5
    content_policy: str = "style_only"

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "start_ms": round(self.start_ms, 1),
            "end_ms": round(self.end_ms, 1),
            "label": self.label,
            "params": self.params,
            "confidence": round(self.confidence, 3),
            "content_policy": self.content_policy,
        }


@dataclass
class VisionAnalysisResult:
    """Aggregated vision findings from a reference video."""
    detected_edits: list[DetectedEdit] = field(default_factory=list)
    effect_ids: list[str] = field(default_factory=list)
    caption_hints: dict[str, Any] = field(default_factory=dict)
    transition_primary: str = "cut"
    uses_text_overlays: bool = False
    overlay_density: str = "sparse"
    uses_arrows_circles: bool = False
    hook_uses_text: bool = False
    hook_type: str = ""
    sample_count: int = 0
    used_easyocr: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "detected_edits": [e.to_dict() for e in self.detected_edits],
            "effect_ids": self.effect_ids,
            "caption_hints": self.caption_hints,
            "transition_primary": self.transition_primary,
            "uses_text_overlays": self.uses_text_overlays,
            "overlay_density": self.overlay_density,
            "sample_count": self.sample_count,
            "used_easyocr": self.used_easyocr,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> "VisionAnalysisResult | None":
        if not d or not isinstance(d, dict):
            return None
        edits = [
            DetectedEdit(
                kind=str(e.get("kind", "graphic")),
                start_ms=float(e.get("start_ms", 0)),
                end_ms=float(e.get("end_ms", e.get("start_ms", 0))),
                label=str(e.get("label", "")),
                params=dict(e.get("params") or {}),
                confidence=float(e.get("confidence", 0.5)),
                content_policy=str(e.get("content_policy", "style_only")),
            )
            for e in d.get("detected_edits", [])
            if isinstance(e, dict)
        ]
        return cls(
            detected_edits=edits,
            effect_ids=list(d.get("effect_ids") or []),
            caption_hints=dict(d.get("caption_hints") or {}),
            transition_primary=str(d.get("transition_primary", "cut")),
            uses_text_overlays=bool(d.get("uses_text_overlays")),
            overlay_density=str(d.get("overlay_density", "sparse")),
            sample_count=int(d.get("sample_count", 0)),
            used_easyocr=bool(d.get("used_easyocr")),
        )


class VisionAnalyzer:
    """Analyze reference video frames for editing patterns."""

    def __init__(
        self,
        max_samples: int = MAX_SAMPLES,
        use_easyocr: bool | None = None,
    ):
        self._max_samples = max_samples
        self._ocr_reader: Any = None
        if use_easyocr is None:
            try:
                from config import settings
                use_easyocr = bool(getattr(settings, "STYLE_EXTRACT_USE_EASYOCR", False))
            except Exception:
                use_easyocr = False
        self._use_easyocr = use_easyocr
        # Cap OCR frames — full-video EasyOCR on CPU can take 10+ minutes
        self._max_ocr_frames = 12 if use_easyocr else 0

    def analyze(
        self,
        video_path: pathlib.Path,
        scenes: list[dict],
        reference_duration_s: float,
    ) -> VisionAnalysisResult:
        try:
            import cv2
            import numpy as np
        except ImportError as exc:
            log.warning("vision_opencv_missing: %s", exc)
            return VisionAnalysisResult()

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            log.warning("vision_video_open_failed: %s", video_path.name)
            return VisionAnalysisResult()

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        total_ms = reference_duration_s * 1000.0
        if total_ms <= 0 and total_frames > 0:
            total_ms = (total_frames / fps) * 1000.0

        sample_times_ms = self._build_sample_times(scenes, total_ms)
        frames: list[tuple[float, Any]] = []
        for t_ms in sample_times_ms:
            frame = self._read_frame_at_ms(cap, fps, t_ms)
            if frame is not None:
                frames.append((t_ms, frame))
        cap.release()

        if not frames:
            return VisionAnalysisResult()

        result = VisionAnalysisResult(sample_count=len(frames))
        used_ocr = False

        ocr_indices = self._pick_ocr_frame_indices(len(frames)) if self._use_easyocr else set()
        text_by_time: list[tuple[float, list[dict]]] = []
        log.info(
            "vision_scan_start: samples=%d easyocr=%s file=%s",
            len(frames), self._use_easyocr, video_path.name,
        )
        for idx, (t_ms, frame) in enumerate(frames):
            if idx == 0 or (idx + 1) % 10 == 0 or idx + 1 == len(frames):
                log.info("vision_scan_progress: %d/%d", idx + 1, len(frames))
            if self._use_easyocr and idx in ocr_indices:
                regions = self._detect_text_regions(frame, allow_ocr=True)
            else:
                regions = self._detect_text_regions_opencv(frame)
            if regions:
                used_ocr = used_ocr or bool(regions[0].get("from_ocr"))
            text_by_time.append((t_ms, regions))

        result.used_easyocr = used_ocr
        result.caption_hints = self._aggregate_caption_hints(text_by_time, frames[0][1].shape)
        result.hook_uses_text = any(
            r.get("role") in ("hook", "overlay", "lower_third")
            for t, regs in text_by_time if t < 8000
            for r in regs
        )

        split_segments = self._detect_split_screen_segments(frames)
        for start_ms, end_ms in split_segments:
            result.detected_edits.append(DetectedEdit(
                kind="split_screen",
                start_ms=start_ms,
                end_ms=end_ms,
                label="Split screen",
                params={"layout": "vertical", "visual_type": "split_screen"},
                confidence=0.75,
                content_policy="style_only",
            ))

        pip_segments = self._detect_pip_segments(frames)
        for start_ms, end_ms, corner in pip_segments:
            result.detected_edits.append(DetectedEdit(
                kind="picture_in_picture",
                start_ms=start_ms,
                end_ms=end_ms,
                label="Picture-in-picture",
                params={"corner": corner, "visual_type": "pip"},
                confidence=0.7,
                content_policy="placeholder",
            ))

        logo_edits = self._detect_logos(frames, total_ms)
        result.detected_edits.extend(logo_edits)

        zoom_edits = self._detect_zoom_segments(frames, scenes)
        result.detected_edits.extend(zoom_edits)

        overlay_edits = self._text_regions_to_edits(text_by_time, total_ms)
        result.detected_edits.extend(overlay_edits)

        transition_edits, primary_trans = self._detect_transitions_at_cuts(
            video_path, scenes, fps,
        )
        result.detected_edits.extend(transition_edits)
        result.transition_primary = primary_trans

        result.uses_text_overlays = len(overlay_edits) > 0 or result.hook_uses_text
        overlay_ratio = len(overlay_edits) / max(len(scenes), 1)
        if overlay_ratio >= 0.5:
            result.overlay_density = "dense"
        elif overlay_ratio >= 0.2:
            result.overlay_density = "moderate"
        else:
            result.overlay_density = "sparse"

        result.detected_edits.sort(key=lambda e: (e.start_ms, e.end_ms))

        from .podcast_shorts import enrich_for_podcast_shorts
        result = enrich_for_podcast_shorts(result, scenes, frames, total_ms, fps)
        result.effect_ids = self._finalize_toolbox_ids(result)

        log.info(
            "vision_analysis_complete: samples=%d edits=%d effects=%d ocr=%s",
            result.sample_count, len(result.detected_edits),
            len(result.effect_ids), result.used_easyocr,
        )
        return result

    def _build_sample_times(self, scenes: list[dict], total_ms: float) -> list[float]:
        times: set[float] = {0.0}
        if total_ms > 0:
            times.add(max(0.0, total_ms - 100))

        for scene in scenes:
            start = float(scene.get("start_ms", 0))
            end = float(scene.get("end_ms", start))
            dur = max(end - start, 1.0)
            times.add(start)
            times.add(start + dur * 0.5)
            times.add(max(start, end - 50))

        sorted_times = sorted(times)
        if len(sorted_times) <= self._max_samples:
            return sorted_times

        step = max(1, len(sorted_times) // self._max_samples)
        return sorted_times[::step][: self._max_samples]

    def _read_frame_at_ms(self, cap: Any, fps: float, t_ms: float) -> Any | None:
        import cv2
        frame_idx = int((t_ms / 1000.0) * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ok, frame = cap.read()
        return frame if ok else None

    def _pick_ocr_frame_indices(self, frame_count: int) -> set[int]:
        """OCR only a spread of frames (hook + mid + end) — not every sample."""
        if frame_count <= 0 or self._max_ocr_frames <= 0:
            return set()
        n = min(self._max_ocr_frames, frame_count)
        if n >= frame_count:
            return set(range(frame_count))
        step = max(1, frame_count // n)
        return set(range(0, frame_count, step)[:n])

    def _get_ocr_reader(self) -> Any | None:
        if self._ocr_reader is not None:
            return self._ocr_reader
        try:
            log.info(
                "vision_easyocr_loading: downloading/loading models — "
                "first run can take 1–2 min on CPU; set STYLE_EXTRACT_USE_EASYOCR=false to skip",
            )
            import easyocr
            self._ocr_reader = easyocr.Reader(["en", "ne"], gpu=False, verbose=False)
            log.info("vision_easyocr_ready")
            return self._ocr_reader
        except Exception as exc:
            log.info("vision_easyocr_unavailable: %s", exc)
            return None

    def _detect_text_regions(self, frame: Any, allow_ocr: bool = True) -> list[dict[str, Any]]:
        import cv2
        import numpy as np

        h, w = frame.shape[:2]
        regions: list[dict[str, Any]] = []

        reader = self._get_ocr_reader() if (allow_ocr and self._use_easyocr) else None
        if reader is not None:
            try:
                small = frame
                scale = 1.0
                if w > 960:
                    scale = 960 / w
                    small = cv2.resize(frame, (960, int(h * scale)))
                results = reader.readtext(small, paragraph=False, detail=1)
                for bbox, _text, conf in results:
                    if conf < 0.25:
                        continue
                    xs = [p[0] for p in bbox]
                    ys = [p[1] for p in bbox]
                    x0, x1 = min(xs) / scale, max(xs) / scale
                    y0, y1 = min(ys) / scale, max(ys) / scale
                    cx = (x0 + x1) / 2 / w
                    cy = (y0 + y1) / 2 / h
                    bh = (y1 - y0) / h
                    regions.append({
                        "bbox_norm": [x0 / w, y0 / h, x1 / w, y1 / h],
                        "center_x": cx,
                        "center_y": cy,
                        "height_norm": bh,
                        "confidence": float(conf),
                        "role": self._classify_text_role(cx, cy, bh),
                        "from_ocr": True,
                    })
            except Exception as exc:
                log.debug("vision_ocr_frame_failed: %s", exc)

        if not regions:
            regions = self._detect_text_regions_opencv(frame)
        return regions

    def _detect_text_regions_opencv(self, frame: Any) -> list[dict[str, Any]]:
        import cv2
        import numpy as np

        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        regions: list[dict[str, Any]] = []
        for cnt in contours:
            x, y, bw, bh = cv2.boundingRect(cnt)
            if bw < w * 0.04 or bh < h * 0.015:
                continue
            if bw > w * 0.92 or bh > h * 0.5:
                continue
            aspect = bw / max(bh, 1)
            if aspect < 1.2 or aspect > 25:
                continue
            cx = (x + bw / 2) / w
            cy = (y + bh / 2) / h
            regions.append({
                "bbox_norm": [x / w, y / h, (x + bw) / w, (y + bh) / h],
                "center_x": cx,
                "center_y": cy,
                "height_norm": bh / h,
                "confidence": 0.4,
                "role": self._classify_text_role(cx, cy, bh / h),
                "from_ocr": False,
            })
        return regions[:8]

    @staticmethod
    def _classify_text_role(cx: float, cy: float, height_norm: float) -> str:
        if cy > 0.72 and height_norm < 0.15:
            return "caption"
        if cy < 0.22:
            return "hook" if cx > 0.25 and cx < 0.75 else "overlay"
        if cy > 0.55 and cy < 0.82 and height_norm < 0.12:
            return "lower_third"
        if cy < 0.45:
            return "overlay"
        return "caption"

    def _aggregate_caption_hints(
        self,
        text_by_time: list[tuple[float, list[dict]]],
        frame_shape: tuple,
    ) -> dict[str, Any]:
        caption_regions = [
            r for _t, regs in text_by_time for r in regs if r.get("role") == "caption"
        ]
        if not caption_regions:
            caption_regions = [
                r for _t, regs in text_by_time for r in regs
            ]
        if not caption_regions:
            return {}

        positions = [r["center_y"] for r in caption_regions]
        mean_y = statistics.mean(positions)
        position = "bottom" if mean_y > 0.6 else "center" if mean_y > 0.35 else "top"
        heights = [r.get("height_norm", 0.05) for r in caption_regions]
        font_size_vw = round(statistics.mean(heights) * 100 * 1.2, 1)

        anim = "none"
        caption_times = [
            (t, r.get("height_norm", 0))
            for t, regs in text_by_time
            for r in regs if r.get("role") == "caption"
        ]
        if len(caption_times) >= 3:
            heights_only = [h for _, h in caption_times]
            if statistics.stdev(heights_only) > 0.015:
                anim = "pop"
            elif len({round(t / 500) for t, _ in caption_times}) > len(caption_times) * 0.6:
                anim = "word-by-word"

        return {
            "position": position,
            "font_size_vw": min(12.0, max(3.5, font_size_vw)),
            "animation": anim,
            "color": "#FFFFFF",
            "stroke": "#000000",
            "stroke_width": 3,
            "max_words_per_line": 3,
            "case": "uppercase" if font_size_vw > 6.5 else "normal",
        }

    def _detect_split_screen_segments(
        self, frames: list[tuple[float, Any]],
    ) -> list[tuple[float, float]]:
        import cv2
        import numpy as np

        segments: list[tuple[float, float]] = []
        in_split = False
        seg_start = 0.0
        last_t = 0.0

        for t_ms, frame in frames:
            h, w = frame.shape[:2]
            mid = w // 2
            left = frame[:, :mid]
            right = frame[:, mid:]
            left_g = cv2.cvtColor(left, cv2.COLOR_BGR2GRAY)
            right_g = cv2.cvtColor(right, cv2.COLOR_BGR2GRAY)
            left_hist = cv2.calcHist([left_g], [0], None, [32], [0, 256])
            right_hist = cv2.calcHist([right_g], [0], None, [32], [0, 256])
            cv2.normalize(left_hist, left_hist)
            cv2.normalize(right_hist, right_hist)
            corr = cv2.compareHist(left_hist, right_hist, cv2.HISTCMP_CORREL)

            center_strip = frame[:, mid - 4: mid + 4]
            edge_density = float(np.mean(cv2.Canny(
                cv2.cvtColor(center_strip, cv2.COLOR_BGR2GRAY), 100, 200,
            ))) / 255.0

            is_split = corr < 0.55 and edge_density > 0.08
            if is_split and not in_split:
                in_split = True
                seg_start = t_ms
            elif not is_split and in_split:
                in_split = False
                if t_ms - seg_start >= MIN_SAMPLE_INTERVAL_MS:
                    segments.append((seg_start, last_t))
            last_t = t_ms

        if in_split and last_t > seg_start:
            segments.append((seg_start, last_t))
        return segments

    def _detect_pip_segments(
        self, frames: list[tuple[float, Any]],
    ) -> list[tuple[float, float, str]]:
        import cv2
        import numpy as np

        corner_boxes = {
            "top_right": lambda h, w: (int(w * 0.62), 0, w, int(h * 0.38)),
            "top_left": lambda h, w: (0, 0, int(w * 0.38), int(h * 0.38)),
            "bottom_right": lambda h, w: (int(w * 0.62), int(h * 0.62), w, h),
        }
        hits: dict[str, list[float]] = defaultdict(list)

        for t_ms, frame in frames:
            h, w = frame.shape[:2]
            main_hist = cv2.calcHist(
                [cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)], [0], None, [24], [0, 256],
            )
            cv2.normalize(main_hist, main_hist)
            for corner, box_fn in corner_boxes.items():
                x0, y0, x1, y1 = box_fn(h, w)
                patch = frame[y0:y1, x0:x1]
                if patch.size == 0:
                    continue
                ph = cv2.calcHist(
                    [cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY)], [0], None, [24], [0, 256],
                )
                cv2.normalize(ph, ph)
                diff = 1.0 - cv2.compareHist(main_hist, ph, cv2.HISTCMP_CORREL)
                edge = float(np.mean(cv2.Canny(
                    cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY), 80, 160,
                ))) / 255.0
                if diff > 0.35 and edge > 0.06:
                    hits[corner].append(t_ms)

        segments: list[tuple[float, float, str]] = []
        for corner, times in hits.items():
            if len(times) < 2:
                continue
            segments.append((min(times), max(times), corner))
        return segments

    def _detect_logos(
        self, frames: list[tuple[float, Any]], total_ms: float,
    ) -> list[DetectedEdit]:
        import cv2
        import numpy as np

        if len(frames) < 3:
            return []

        corner = "top_left"
        h, w = frames[0][1].shape[:2]
        x1, y1 = int(w * 0.18), int(h * 0.14)
        patches = [f[1][:y1, :x1] for _, f in frames[:12] if f is not None and f.ndim == 3]
        if not patches or patches[0].size == 0:
            return []

        diffs: list[float] = []
        for i in range(1, len(patches)):
            a = patches[i - 1]
            b = patches[i]
            if a.ndim == 3:
                a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
            if b.ndim == 3:
                b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
            if a.shape != b.shape:
                continue
            diffs.append(float(np.mean(cv2.absdiff(a, b))) / 255.0)

        stable = statistics.mean(diffs) < 0.04 if diffs else False
        edge_mean = float(np.mean([
            np.mean(cv2.Canny(
                cv2.cvtColor(p, cv2.COLOR_BGR2GRAY) if p.ndim == 3 else p, 80, 160,
            ))
            for p in patches[:5]
            if p.size > 0
        ])) / 255.0

        if not (stable and edge_mean > 0.05):
            return []

        end_ms = min(4000.0, total_ms * 0.06)
        return [DetectedEdit(
            kind="logo",
            start_ms=0.0,
            end_ms=end_ms,
            label="Logo",
            params={
                "visual_type": "logo",
                "corner": corner,
                "suggested_visual": "logo_placeholder",
            },
            confidence=0.72,
            content_policy="placeholder",
        )]

    def _detect_zoom_segments(
        self, frames: list[tuple[float, Any]], scenes: list[dict],
    ) -> list[DetectedEdit]:
        import cv2
        import numpy as np

        edits: list[DetectedEdit] = []
        for scene in scenes[:12]:
            start_ms = float(scene.get("start_ms", 0))
            end_ms = float(scene.get("end_ms", start_ms))
            dur = end_ms - start_ms
            if dur < 3500:
                continue
            mid_ms = start_ms + dur * 0.5
            f0 = self._nearest_frame(frames, start_ms)
            f1 = self._nearest_frame(frames, mid_ms)
            f2 = self._nearest_frame(frames, end_ms - 100)
            if f0 is None or f2 is None:
                continue
            scale_delta = self._estimate_zoom_delta(f0, f2)
            if scale_delta > 0.04:
                edits.append(DetectedEdit(
                    kind="zoom",
                    start_ms=start_ms,
                    end_ms=min(end_ms, start_ms + 6000),
                    label="Zoom / push-in",
                    params={
                        "effect": "ken_burns",
                        "scale_end": round(1.0 + scale_delta, 3),
                    },
                    confidence=min(0.9, 0.5 + scale_delta * 3),
                    content_policy="style_only",
                ))
        return edits

    @staticmethod
    def _nearest_frame(frames: list[tuple[float, Any]], t_ms: float) -> Any | None:
        if not frames:
            return None
        best = min(frames, key=lambda x: abs(x[0] - t_ms))
        return best[1]

    @staticmethod
    def _estimate_zoom_delta(frame_a: Any, frame_b: Any) -> float:
        import cv2
        import numpy as np

        ga = cv2.cvtColor(frame_a, cv2.COLOR_BGR2GRAY)
        gb = cv2.cvtColor(frame_b, cv2.COLOR_BGR2GRAY)
        h, w = ga.shape
        cx, cy = w // 2, h // 2
        r = min(cx, cy) // 2
        if r < 10:
            return 0.0
        crop_a = ga[cy - r: cy + r, cx - r: cx + r]
        crop_b = gb[cy - r: cy + r, cx - r: cx + r]
        if crop_a.size == 0 or crop_b.size == 0:
            return 0.0
        lap_a = float(cv2.Laplacian(crop_a, cv2.CV_64F).var())
        lap_b = float(cv2.Laplacian(crop_b, cv2.CV_64F).var())
        if lap_a <= 0:
            return 0.0
        return max(0.0, (lap_b - lap_a) / lap_a)

    def _text_regions_to_edits(
        self, text_by_time: list[tuple[float, list[dict]]], total_ms: float,
    ) -> list[DetectedEdit]:
        edits: list[DetectedEdit] = []
        role_windows: dict[str, list[float]] = defaultdict(list)

        for t_ms, regions in text_by_time:
            for r in regions:
                role = str(r.get("role", "overlay"))
                if role == "caption":
                    continue
                role_windows[role].append(t_ms)

        for role, times in role_windows.items():
            if not times:
                continue
            kind_map = {
                "hook": ("hook", "Hook text overlay", "placeholder"),
                "lower_third": ("lower_third", "Lower third", "placeholder"),
                "overlay": ("graphic", "Text overlay", "placeholder"),
            }
            kind, label, policy = kind_map.get(role, ("graphic", "Graphic", "placeholder"))
            start_ms = min(times)
            end_ms = min(total_ms, max(times) + 1500)
            if role == "hook":
                end_ms = min(end_ms, 10000.0)
            edits.append(DetectedEdit(
                kind=kind,
                start_ms=start_ms,
                end_ms=end_ms,
                label=label,
                params={
                    "visual_type": role,
                    "suggested_visual": "animated_graphic" if role == "overlay" else role,
                    "text_style": "bold" if role == "hook" else "minimal",
                },
                confidence=0.65,
                content_policy=policy,
            ))
        return edits

    def _detect_transitions_at_cuts(
        self,
        video_path: pathlib.Path,
        scenes: list[dict],
        fps: float,
    ) -> tuple[list[DetectedEdit], str]:
        import cv2
        import numpy as np

        if len(scenes) < 2:
            return [], "cut"

        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return [], "cut"

        trans_counts: Counter[str] = Counter()
        edits: list[DetectedEdit] = []

        for i, scene in enumerate(scenes):
            if i == 0:
                continue
            cut_ms = float(scene.get("start_ms", 0))
            prev_end_ms = float(scenes[i - 1].get("end_ms", cut_ms))
            f_before = self._read_frame_at_ms(cap, fps, max(0, prev_end_ms - 80))
            f_after = self._read_frame_at_ms(cap, fps, cut_ms + 40)
            f_mid = self._read_frame_at_ms(cap, fps, cut_ms - 40)
            if f_before is None or f_after is None:
                continue

            diff_hard = self._frame_diff(f_before, f_after)
            diff_gradual = (
                self._frame_diff(f_before, f_mid) + self._frame_diff(f_mid, f_after)
            ) / 2.0 if f_mid is not None else diff_hard

            motion = self._horizontal_motion(f_before, f_after)
            scale_change = abs(
                self._estimate_zoom_delta(f_before, f_after),
            )

            if scale_change > 0.08:
                t_type = "zoom"
            elif motion > 0.12:
                t_type = "whip_pan"
            elif diff_gradual < diff_hard * 0.65 and diff_hard < 0.45:
                t_type = "dissolve"
            elif diff_hard > 0.55:
                t_type = "cut"
            else:
                t_type = "fade"

            trans_counts[t_type] += 1
            kind = "hard_cut" if t_type == "cut" else f"transition_{t_type}"
            edits.append(DetectedEdit(
                kind=kind,
                start_ms=cut_ms,
                end_ms=cut_ms,
                label=f"{t_type.title()} at cut {i}",
                params={
                    "transition_type": t_type,
                    "duration_ms": 250 if t_type in ("dissolve", "fade", "zoom") else 0,
                },
                confidence=0.68,
                content_policy="style_only",
            ))

        cap.release()
        primary = trans_counts.most_common(1)[0][0] if trans_counts else "cut"
        return edits, primary

    @staticmethod
    def _frame_diff(a: Any, b: Any) -> float:
        import cv2
        import numpy as np
        ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
        gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
        if ga.shape != gb.shape:
            gb = cv2.resize(gb, (ga.shape[1], ga.shape[0]))
        return float(np.mean(cv2.absdiff(ga, gb))) / 255.0

    @staticmethod
    def _horizontal_motion(a: Any, b: Any) -> float:
        import cv2
        import numpy as np
        ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
        gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
        if ga.shape != gb.shape:
            gb = cv2.resize(gb, (ga.shape[1], ga.shape[0]))
        flow = cv2.calcOpticalFlowFarneback(
            ga, gb, None, 0.5, 3, 15, 3, 5, 1.2, 0,
        )
        fx = flow[..., 0]
        return float(np.mean(np.abs(fx))) / max(ga.shape[1], 1)

    @staticmethod
    def _finalize_toolbox_ids(result: VisionAnalysisResult) -> list[str]:
        from .edit_toolbox import discover_tool_ids_from_vision
        merged = discover_tool_ids_from_vision(result.to_dict())
        if merged:
            return merged
        return VisionAnalyzer._collect_effect_ids(result)

    @staticmethod
    def _collect_effect_ids(result: VisionAnalysisResult) -> list[str]:
        ids: list[str] = []
        kinds = {e.kind for e in result.detected_edits}
        if result.caption_hints:
            anim = result.caption_hints.get("animation", "none")
            if anim == "pop":
                ids.append("caption_pop")
            elif anim == "word-by-word":
                ids.append("caption_word_by_word")
            elif anim == "slide":
                ids.append("caption_slide")
            else:
                ids.append("caption_pop")
        if "hard_cut" in kinds or any(k.startswith("transition") for k in kinds):
            primary = result.transition_primary
            ids.append({
                "cut": "hard_cut", "fade": "fade_transition",
                "dissolve": "dissolve_transition", "zoom": "zoom_transition",
                "whip_pan": "whip_pan",
            }.get(primary, "hard_cut"))
        if "zoom" in kinds or "digital_zoom" in kinds:
            ids.append("ken_burns")
        if "broll" in kinds:
            ids.append("broll_insert")
        if "sfx" in kinds:
            ids.append("sfx_on_cut")
        if "music_bed" in kinds:
            ids.append("music_bed")
        if "cta" in kinds:
            ids.append("text_overlay")
        if "jump_cut_pacing" in kinds:
            ids.append("speed_ramp")
        if "split_screen" in kinds:
            ids.append("split_screen")
        if "picture_in_picture" in kinds:
            ids.append("picture_in_picture")
        if "logo" in kinds:
            ids.append("logo_overlay")
        if "lower_third" in kinds:
            ids.append("lower_third")
        if "graphic" in kinds or "hook" in kinds:
            ids.append("text_overlay")
        if result.hook_uses_text:
            ids.append("hook_text_overlay")
        seen: set[str] = set()
        unique: list[str] = []
        for eid in ids:
            if eid not in seen:
                seen.add(eid)
                unique.append(eid)
        return unique
