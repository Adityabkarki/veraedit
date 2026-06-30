"""
ViraEdit — Platform reframe and export helpers (Phase 03 / Phase 08 hardening).
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Literal

from config import settings
from processors.text_editor import get_duration
from tasks.shorts_engine import short_crop_filter

ReframeWarning = Literal[
    "low_face_detection_used_center_crop",
    "face_tracking_unavailable_used_center_crop",
]

PLATFORM_SPECS: dict[str, dict] = {
    "tiktok": {"width": 1080, "height": 1920, "max_duration": 60},
    "instagram_reels": {"width": 1080, "height": 1920, "max_duration": 90},
    "youtube_shorts": {"width": 1080, "height": 1920, "max_duration": 60},
    "facebook_reels": {"width": 1080, "height": 1920, "max_duration": 90},
    "facebook_feed": {"width": 1080, "height": 1080, "max_duration": 120},
}

FACE_DETECTION_MIN_RATIO = 0.3
REFRAME_WARNING_MESSAGES: dict[str, str] = {
    "low_face_detection_used_center_crop": (
        "We couldn't reliably track a face in this clip, so we centered it instead."
    ),
    "face_tracking_unavailable_used_center_crop": (
        "Face tracking isn't available on this machine — we used a centered crop instead."
    ),
}


def reframe_video(
    input_path: str | Path,
    output_path: str | Path,
    width: int = 1080,
    height: int = 1920,
    mode: str = "face_track",
) -> tuple[str, str | None]:
    """
    Reframe horizontal video to vertical.

    Returns (output_path, warning_code_or_none). warning_code maps to
    REFRAME_WARNING_MESSAGES for user-facing copy.
    """
    in_path = Path(input_path)
    out_path = Path(output_path)

    if mode == "face_track":
        try:
            return _face_track_reframe(in_path, out_path, width, height)
        except ImportError:
            _center_crop_reframe(in_path, out_path, width, height)
            return out_path.as_posix(), "face_tracking_unavailable_used_center_crop"
        except Exception:
            _center_crop_reframe(in_path, out_path, width, height)
            return out_path.as_posix(), "low_face_detection_used_center_crop"

    _center_crop_reframe(in_path, out_path, width, height)
    return out_path.as_posix(), None


def _center_crop_reframe(
    in_path: Path,
    out_path: Path,
    width: int,
    height: int,
) -> str:
    vf = short_crop_filter(0.5, width, height)
    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i", in_path.as_posix(),
            "-vf", vf,
            "-c:a", "copy",
            out_path.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    return out_path.as_posix()


def _face_track_reframe(
    in_path: Path,
    out_path: Path,
    target_w: int,
    target_h: int,
) -> tuple[str, str | None]:
    import cv2
    import mediapipe as mp
    import numpy as np
    from scipy.ndimage import uniform_filter1d

    mp_face = mp.solutions.face_detection
    cap = cv2.VideoCapture(in_path.as_posix())
    if not cap.isOpened():
        raise RuntimeError("Could not open video for face tracking")

    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 1920
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 1080
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    crop_h = orig_h
    crop_w = int(orig_h * (target_w / target_h))
    if crop_w > orig_w:
        crop_w = orig_w
        crop_h = int(orig_w * (target_h / target_w))

    face_cx_by_frame: dict[int, int] = {}
    sample_every = 5

    with mp_face.FaceDetection(model_selection=1, min_detection_confidence=0.4) as fd:
        idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if idx % sample_every == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = fd.process(rgb)
                if result.detections:
                    bb = result.detections[0].location_data.relative_bounding_box
                    cx = int((bb.xmin + bb.width / 2) * orig_w)
                    face_cx_by_frame[idx] = cx
            idx += 1
    cap.release()

    sampled_frames = max(1, total // sample_every)
    detection_ratio = len(face_cx_by_frame) / sampled_frames

    if detection_ratio < FACE_DETECTION_MIN_RATIO:
        _center_crop_reframe(in_path, out_path, target_w, target_h)
        return out_path.as_posix(), "low_face_detection_used_center_crop"

    # Interpolate pan positions across all frames
    frame_indices = sorted(face_cx_by_frame.keys())
    if not frame_indices:
        _center_crop_reframe(in_path, out_path, target_w, target_h)
        return out_path.as_posix(), "low_face_detection_used_center_crop"

    all_idx = np.arange(total)
    known_idx = np.array(frame_indices)
    known_cx = np.array([face_cx_by_frame[i] for i in frame_indices])
    pan_cx = np.interp(all_idx, known_idx, known_cx)
    pan_cx = uniform_filter1d(pan_cx, size=min(15, max(3, total // 30)))

    # Write reframed video frame-by-frame (short clips only — acceptable for shorts pipeline)
    cap = cv2.VideoCapture(in_path.as_posix())
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    temp_path = out_path.with_suffix(".tracking.mp4")
    writer = cv2.VideoWriter(temp_path.as_posix(), fourcc, fps, (target_w, target_h))

    idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret or idx >= total:
            break
        cx = int(pan_cx[idx])
        x1 = max(0, min(cx - crop_w // 2, orig_w - crop_w))
        cropped = frame[0:crop_h, x1:x1 + crop_w]
        resized = cv2.resize(cropped, (target_w, target_h))
        writer.write(resized)
        idx += 1

    cap.release()
    writer.release()

    subprocess.run(
        [
            settings.FFMPEG_PATH,
            "-i", temp_path.as_posix(),
            "-i", in_path.as_posix(),
            "-map", "0:v:0",
            "-map", "1:a?",
            "-c:v", "libx264",
            "-preset", "fast",
            "-c:a", "copy",
            out_path.as_posix(),
            "-y",
        ],
        check=True,
        capture_output=True,
    )
    if temp_path.exists():
        temp_path.unlink()

    return out_path.as_posix(), None


def export_for_platform(
    input_path: str | Path,
    output_path: str | Path,
    platform: str,
) -> str:
    """Export a clip capped to platform duration/resolution."""
    in_path = Path(input_path)
    out_path = Path(output_path)
    spec = PLATFORM_SPECS.get(platform, PLATFORM_SPECS["tiktok"])
    max_dur = float(spec["max_duration"])
    width = int(spec["width"])
    height = int(spec["height"])

    duration = get_duration(in_path)
    trim_args: list[str] = []
    if duration > max_dur + 0.1:
        trim_args = ["-t", str(max_dur)]

    if platform == "facebook_feed":
        vf = f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"
    else:
        vf = f"scale={width}:{height},setsar=1"

    cmd = [
        settings.FFMPEG_PATH,
        "-i", in_path.as_posix(),
        *trim_args,
        "-vf", vf,
        "-c:a", "aac",
        "-b:a", "128k",
        out_path.as_posix(),
        "-y",
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path.as_posix()
