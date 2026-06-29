# Module 07 — Auto-Reframe & Multi-Platform Export

## Stack
- FastAPI + Celery tasks
- MediaPipe face detection for face-tracking reframe
- OpenCV for frame-by-frame crop pipeline
- FFmpeg at `settings.ffmpeg_path` for all video operations
- MinIO for storing reframed/exported videos
- Presigned download URLs (24hr)

---

## Platform Presets

| Platform | Width | Height | FPS | Bitrate |
|---|---|---|---|---|
| tiktok | 1080 | 1920 | 30 | 4M |
| instagram_reels | 1080 | 1920 | 30 | 3.5M |
| youtube_shorts | 1080 | 1920 | 60 | 8M |
| linkedin | 1920 | 1080 | 30 | 5M |
| instagram_post | 1080 | 1080 | 30 | 3.5M |
| youtube | 1920 | 1080 | 60 | 8M |

---

## Files to Create / Modify

### `backend/app/processors/reframer.py`
```python
import subprocess, os, cv2
import numpy as np
import mediapipe as mp
from ..config import settings

PLATFORM_PRESETS = {
    "tiktok":           {"width": 1080, "height": 1920, "fps": 30, "vbitrate": "4M"},
    "instagram_reels":  {"width": 1080, "height": 1920, "fps": 30, "vbitrate": "3.5M"},
    "youtube_shorts":   {"width": 1080, "height": 1920, "fps": 60, "vbitrate": "8M"},
    "linkedin":         {"width": 1920, "height": 1080, "fps": 30, "vbitrate": "5M"},
    "instagram_post":   {"width": 1080, "height": 1080, "fps": 30, "vbitrate": "3.5M"},
    "youtube":          {"width": 1920, "height": 1080, "fps": 60, "vbitrate": "8M"},
}


def reframe_video(
    input_path: str,
    output_path: str,
    target_w: int = 1080,
    target_h: int = 1920,
    mode: str = "face_track",  # "face_track" | "center_crop" | "blur_fill"
) -> str:
    if mode == "center_crop":
        return _center_crop(input_path, output_path, target_w, target_h)
    elif mode == "blur_fill":
        return _blur_fill(input_path, output_path, target_w, target_h)
    else:
        return _face_track(input_path, output_path, target_w, target_h)


def _center_crop(input_path: str, output_path: str, w: int, h: int) -> str:
    subprocess.run([
        settings.ffmpeg_path, "-i", input_path,
        "-vf", f"crop={w}:{h}:(in_w-{w})/2:(in_h-{h})/2,scale={w}:{h}",
        "-c:a", "copy", output_path, "-y"
    ], check=True, capture_output=True)
    return output_path


def _blur_fill(input_path: str, output_path: str, w: int, h: int) -> str:
    """Scale to fit + blur background fill. Great for landscape→portrait."""
    vf = (f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,"
          f"crop={w}:{h},boxblur=20:5[bg];"
          f"[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease[fg];"
          f"[bg][fg]overlay=(W-w)/2:(H-h)/2")
    subprocess.run([
        settings.ffmpeg_path, "-i", input_path,
        "-filter_complex", vf, "-c:a", "copy",
        output_path, "-y"
    ], check=True, capture_output=True)
    return output_path


def _face_track(input_path: str, output_path: str, target_w: int, target_h: int) -> str:
    """MediaPipe face detection → smooth crop path → OpenCV write → audio merge."""
    from scipy.ndimage import uniform_filter1d
    mp_face = mp.solutions.face_detection

    cap = cv2.VideoCapture(input_path)
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Crop window dimensions
    crop_h = orig_h
    crop_w = int(orig_h * (target_w / target_h))
    if crop_w > orig_w:
        crop_w = orig_w
        crop_h = int(orig_w * (target_h / target_w))

    # Sample every 5th frame for face detection
    face_cx_by_frame: dict = {}
    with mp_face.FaceDetection(model_selection=0, min_detection_confidence=0.5) as fd:
        idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            if idx % 5 == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = fd.process(rgb)
                if result.detections:
                    bb = result.detections[0].location_data.relative_bounding_box
                    cx = int((bb.xmin + bb.width / 2) * orig_w)
                    face_cx_by_frame[idx] = cx
            idx += 1
    cap.release()

    if not face_cx_by_frame:
        return _center_crop(input_path, output_path, target_w, target_h)

    # Interpolate face positions for every frame
    all_cx = []
    last = orig_w // 2
    for i in range(total):
        if i in face_cx_by_frame: last = face_cx_by_frame[i]
        all_cx.append(last)

    # Smooth with 1-second window
    smoothed = uniform_filter1d(all_cx, size=max(1, int(fps))).tolist()
    clamped = [max(crop_w // 2, min(orig_w - crop_w // 2, int(cx))) for cx in smoothed]

    # Write cropped video with OpenCV
    tmp_video = output_path + ".noaudio.mp4"
    cap = cv2.VideoCapture(input_path)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_video, fourcc, fps, (target_w, target_h))
    idx = 0
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break
        cx = clamped[idx] if idx < len(clamped) else orig_w // 2
        x1 = max(0, min(orig_w - crop_w, cx - crop_w // 2))
        y1 = 0
        cropped = frame[y1:y1 + crop_h, x1:x1 + crop_w]
        resized = cv2.resize(cropped, (target_w, target_h))
        writer.write(resized)
        idx += 1
    cap.release(); writer.release()

    # Merge original audio
    subprocess.run([
        settings.ffmpeg_path, "-i", tmp_video, "-i", input_path,
        "-c:v", "copy", "-c:a", "aac",
        "-map", "0:v:0", "-map", "1:a:0",
        output_path, "-y"
    ], check=True, capture_output=True)
    if os.path.exists(tmp_video): os.remove(tmp_video)
    return output_path


def export_for_platform(input_path: str, output_path: str, platform: str = "tiktok") -> str:
    """Encode video with platform-optimized settings."""
    p = PLATFORM_PRESETS.get(platform, PLATFORM_PRESETS["tiktok"])
    subprocess.run([
        settings.ffmpeg_path, "-i", input_path,
        "-c:v", "libx264", "-preset", "fast",
        "-b:v", p["vbitrate"],
        "-r", str(p["fps"]),
        "-vf", (f"scale={p['width']}:{p['height']}:force_original_aspect_ratio=decrease,"
                f"pad={p['width']}:{p['height']}:(ow-iw)/2:(oh-ih)/2"),
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-movflags", "+faststart",
        output_path, "-y"
    ], check=True, capture_output=True)
    return output_path


def apply_watermark(video_path: str, output_path: str, watermark_path: str,
                    position: str = "bottom_right", opacity: float = 0.7, margin: int = 30) -> str:
    pos_map = {
        "top_left":     f"{margin}:{margin}",
        "top_right":    f"main_w-overlay_w-{margin}:{margin}",
        "bottom_left":  f"{margin}:main_h-overlay_h-{margin}",
        "bottom_right": f"main_w-overlay_w-{margin}:main_h-overlay_h-{margin}",
    }
    overlay_pos = pos_map.get(position, pos_map["bottom_right"])
    wm_filter = f"[1:v]format=rgba,colorchannelmixer=aa={opacity}[wm]"
    overlay = f"[0:v][wm]overlay={overlay_pos}"
    subprocess.run([
        settings.ffmpeg_path, "-i", video_path, "-i", watermark_path,
        "-filter_complex", f"{wm_filter};{overlay}",
        "-c:a", "copy", output_path, "-y"
    ], check=True, capture_output=True)
    return output_path


def prepend_intro(video_path: str, intro_path: str, output_path: str) -> str:
    concat = video_path + ".intro_concat.txt"
    with open(concat, "w") as f:
        f.write(f"file '{intro_path}'\nfile '{video_path}'\n")
    subprocess.run([settings.ffmpeg_path, "-f", "concat", "-safe", "0",
                    "-i", concat, "-c", "copy", output_path, "-y"],
                   check=True, capture_output=True)
    if os.path.exists(concat): os.remove(concat)
    return output_path


def append_outro(video_path: str, outro_path: str, output_path: str) -> str:
    concat = video_path + ".outro_concat.txt"
    with open(concat, "w") as f:
        f.write(f"file '{video_path}'\nfile '{outro_path}'\n")
    subprocess.run([settings.ffmpeg_path, "-f", "concat", "-safe", "0",
                    "-i", concat, "-c", "copy", output_path, "-y"],
                   check=True, capture_output=True)
    if os.path.exists(concat): os.remove(concat)
    return output_path
```

### `backend/app/tasks/enhance_tasks.py` (add reframe + export tasks)
```python
@celery_app.task(bind=True)
def reframe_task(self, job_id: str, video_key: str, project_id: str,
                 target_w: int, target_h: int, mode: str):
    from ..processors.reframer import reframe_video
    update_job_sync(job_id, status="processing")
    try:
        local = storage_sync.download_to_temp(video_key, job_id)
        out = local.replace(".mp4", f"_reframed.mp4")
        reframe_video(local, out, target_w, target_h, mode)
        out_key = f"projects/{project_id}/reframed/{job_id}.mp4"
        storage_sync.put_file(out_key, out, "video/mp4")
        url = storage_sync.get_presigned_url(out_key)
        update_job_sync(job_id, status="done", result={"output_key": out_key, "url": url})
    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))

@celery_app.task(bind=True)
def export_task(self, job_id: str, video_key: str, project_id: str,
                platforms: list, workspace_id: str = None):
    from ..processors.reframer import export_for_platform, apply_watermark
    update_job_sync(job_id, status="processing")
    try:
        local = storage_sync.download_to_temp(video_key, job_id)
        exports = []
        for platform in platforms:
            out = local.replace(".mp4", f"_export_{platform}.mp4")
            export_for_platform(local, out, platform)
            # Apply workspace watermark if set
            if workspace_id:
                _apply_workspace_watermark(out, workspace_id)
            out_key = f"projects/{project_id}/exports/{job_id}_{platform}.mp4"
            storage_sync.put_file(out_key, out, "video/mp4")
            dl_url = storage_sync.get_presigned_url(out_key, expires=86400)
            exports.append({"platform": platform, "key": out_key, "url": dl_url})
            if os.path.exists(out): os.remove(out)
        update_job_sync(job_id, status="done", result={"exports": exports})
    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
```

### `backend/app/routers/reframe.py`
```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from ..database import get_db
from ..models.job import Job
from ..tasks.enhance_tasks import reframe_task, export_task
from ..processors.reframer import PLATFORM_PRESETS

router = APIRouter(prefix="/api/reframe", tags=["reframe"])

ASPECT_TO_WH = {
    "9:16": (1080, 1920), "16:9": (1920, 1080),
    "1:1": (1080, 1080), "4:5": (1080, 1350),
}

class ReframeRequest(BaseModel):
    video_key: str
    project_id: str
    target_aspect: str = "9:16"
    mode: str = "face_track"  # face_track | center_crop | blur_fill

class ExportRequest(BaseModel):
    video_key: str
    project_id: str
    platforms: List[str]  # ["tiktok", "instagram_reels"]
    workspace_id: Optional[str] = None

@router.get("/platforms")
def list_platforms():
    return {"platforms": list(PLATFORM_PRESETS.keys()), "presets": PLATFORM_PRESETS}

@router.post("/run")
async def reframe(req: ReframeRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    w, h = ASPECT_TO_WH.get(req.target_aspect, (1080, 1920))
    job = Job(id=job_id, type="REFRAME", status="queued", project_id=req.project_id)
    db.add(job); await db.commit()
    reframe_task.delay(job_id, req.video_key, req.project_id, w, h, req.mode)
    return {"job_id": job_id}

@router.post("/export")
async def export(req: ExportRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="EXPORT", status="queued", project_id=req.project_id)
    db.add(job); await db.commit()
    export_task.delay(job_id, req.video_key, req.project_id, req.platforms, req.workspace_id)
    return {"job_id": job_id}
```

---

## Checklist for Cursor

- [ ] `backend/app/processors/reframer.py` — all 6 functions
- [ ] `reframe_task` + `export_task` in `enhance_tasks.py`
- [ ] `backend/app/routers/reframe.py`
- [ ] `mediapipe` + `scipy` + `opencv-python-headless` in requirements
- [ ] All FFmpeg calls use `settings.ffmpeg_path`
- [ ] Export presigned URLs set to 86400s (24hr) for download links
- [ ] `ExportPanel.tsx` frontend with platform checkboxes
- [ ] Reframe mode selector: Face Track / Center Crop / Blur Fill