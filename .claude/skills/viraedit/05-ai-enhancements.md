# Module 05 — AI Enhancements (Color, Audio, Background Removal, B-Roll)

## Stack
- FastAPI + Celery tasks
- FFmpeg at `settings.ffmpeg_path` for all video processing
- `noisereduce` + `soundfile` for audio denoising
- `rembg` for background removal
- Pexels API for B-roll search
- OpenAI `gpt-4o-mini` for contextual B-roll suggestions
- LUT files bundled in `backend/luts/` directory

---

## Files to Create / Modify

### `backend/app/processors/enhancer.py`
```python
import subprocess, os, json
import numpy as np
import soundfile as sf
import noisereduce as nr
from ..config import settings

# ─── COLOR ────────────────────────────────────────────────────
def auto_color_correct(input_path: str, output_path: str) -> str:
    subprocess.run([
        settings.ffmpeg_path, "-i", input_path,
        "-vf", "eq=contrast=1.05:brightness=0.02:saturation=1.1,"
               "curves=all='0/0 0.5/0.55 1/1',"
               "unsharp=5:5:0.8:5:5:0.0",
        "-c:a", "copy", output_path, "-y"
    ], check=True, capture_output=True)
    return output_path


AVAILABLE_LUTS = [
    "cinematic_warm", "cinematic_cold", "vintage_film",
    "corporate_clean", "dark_moody", "bright_airy",
]

def apply_lut(input_path: str, output_path: str, lut_name: str = "cinematic_warm") -> str:
    # LUTs stored at backend/luts/{name}.cube
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    lut_path = os.path.join(base_dir, "luts", f"{lut_name}.cube")
    if not os.path.exists(lut_path):
        raise FileNotFoundError(f"LUT not found: {lut_path}")
    subprocess.run([
        settings.ffmpeg_path, "-i", input_path,
        "-vf", f"lut3d={lut_path}", "-c:a", "copy",
        output_path, "-y"
    ], check=True, capture_output=True)
    return output_path


# ─── AUDIO ────────────────────────────────────────────────────
def audio_level_and_denoise(input_path: str, output_path: str) -> str:
    """Extract audio → denoise → loudnorm → merge back."""
    tmp_raw = input_path + ".raw.wav"
    tmp_clean = input_path + ".clean.wav"

    # Extract audio
    subprocess.run([
        settings.ffmpeg_path, "-i", input_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
        tmp_raw, "-y"
    ], check=True, capture_output=True)

    # Denoise
    data, rate = sf.read(tmp_raw)
    if data.ndim > 1:
        noise = data[:int(rate * 0.5)]
        clean = nr.reduce_noise(y=data.T, sr=rate, y_noise=noise.T, stationary=False).T
    else:
        noise = data[:int(rate * 0.5)]
        clean = nr.reduce_noise(y=data, sr=rate, y_noise=noise, stationary=False)
    sf.write(tmp_clean, clean, rate)

    # Merge clean audio + loudnorm + high-pass filter
    subprocess.run([
        settings.ffmpeg_path,
        "-i", input_path, "-i", tmp_clean,
        "-c:v", "copy",
        "-af", "highpass=f=80,loudnorm=I=-16:LRA=11:TP=-1.5",
        "-map", "0:v:0", "-map", "1:a:0",
        output_path, "-y"
    ], check=True, capture_output=True)

    for p in [tmp_raw, tmp_clean]:
        if os.path.exists(p): os.remove(p)
    return output_path


# ─── BACKGROUND REMOVAL ───────────────────────────────────────
def blur_background_video(input_path: str, output_path: str) -> str:
    """
    Blur-fill background: scale up + blur for bg, overlay original centered.
    Fast alternative to per-frame rembg (which is slow on CPU).
    """
    vf = (
        "[0:v]scale=iw*1.2:ih*1.2,boxblur=20:5[bg];"
        "[0:v]scale=iw:ih[fg];"
        "[bg][fg]overlay=(W-w)/2:(H-h)/2"
    )
    subprocess.run([
        settings.ffmpeg_path, "-i", input_path,
        "-filter_complex", vf, "-c:a", "copy",
        output_path, "-y"
    ], check=True, capture_output=True)
    return output_path


def remove_background_image(image_path: str, output_path: str) -> str:
    """Remove background from a single image using rembg."""
    from rembg import remove
    with open(image_path, "rb") as f:
        out_bytes = remove(f.read())
    with open(output_path, "wb") as f:
        f.write(out_bytes)
    return output_path


# ─── B-ROLL ───────────────────────────────────────────────────
import requests

def search_broll(query: str, count: int = 6) -> list:
    """Search Pexels for B-roll clips."""
    import os
    api_key = os.environ.get("PEXELS_API_KEY", "")
    if not api_key:
        return []
    resp = requests.get(
        "https://api.pexels.com/videos/search",
        headers={"Authorization": api_key},
        params={"query": query, "per_page": count, "orientation": "portrait"},
        timeout=10,
    )
    if resp.status_code != 200: return []
    videos = resp.json().get("videos", [])
    results = []
    for v in videos:
        files = v.get("video_files", [])
        hd = next((f for f in files if f.get("quality") == "hd"), files[0] if files else None)
        if hd:
            results.append({
                "id": v["id"], "duration": v["duration"],
                "thumbnail": v.get("image"), "url": hd["link"],
                "width": hd.get("width"), "height": hd.get("height"),
            })
    return results


def insert_broll(main_path: str, broll_url: str, insert_at: float,
                 broll_duration: float, output_path: str) -> str:
    """Splice a B-roll clip into main video at insert_at timestamp."""
    import urllib.request, uuid
    tmp = main_path + f".broll_{uuid.uuid4().hex[:8]}.mp4"
    broll_trimmed = main_path + ".broll_trim.mp4"
    part_a = main_path + ".part_a.mp4"
    part_b = main_path + ".part_b.mp4"
    concat_file = main_path + ".broll_concat.txt"

    urllib.request.urlretrieve(broll_url, tmp)

    subprocess.run([settings.ffmpeg_path, "-i", tmp, "-t", str(broll_duration),
                    "-c", "copy", broll_trimmed, "-y"], check=True, capture_output=True)
    subprocess.run([settings.ffmpeg_path, "-i", main_path, "-t", str(insert_at),
                    "-c", "copy", part_a, "-y"], check=True, capture_output=True)
    subprocess.run([settings.ffmpeg_path, "-i", main_path, "-ss", str(insert_at + broll_duration),
                    "-c", "copy", part_b, "-y"], check=True, capture_output=True)

    with open(concat_file, "w") as f:
        f.write(f"file '{part_a}'\nfile '{broll_trimmed}'\nfile '{part_b}'\n")

    subprocess.run([settings.ffmpeg_path, "-f", "concat", "-safe", "0",
                    "-i", concat_file, "-c", "copy", output_path, "-y"],
                   check=True, capture_output=True)

    for p in [tmp, broll_trimmed, part_a, part_b, concat_file]:
        if os.path.exists(p): os.remove(p)
    return output_path


async def suggest_broll_keywords(segments: list) -> list:
    """Use GPT-4o-mini to suggest B-roll search terms per transcript segment."""
    from openai import AsyncOpenAI
    from ..services.ai_budget import budget
    text = "\n".join(f"[{s['start']:.1f}s-{s['end']:.1f}s]: {s['text']}" for s in segments[:20])
    c = AsyncOpenAI(api_key=settings.openai_api_key)
    budget.record(0.0001)
    resp = await c.chat.completions.create(
        model=settings.openai_model_fast,
        messages=[{"role": "user", "content":
            f"Suggest B-roll search terms for each segment. Return JSON array: "
            f'[{{"segment_start":0.0,"segment_end":5.0,"search_term":"team meeting office"}}]\n\n{text}'}],
        max_tokens=400, temperature=0.2,
    )
    raw = resp.choices[0].message.content.strip().lstrip("```json").rstrip("```")
    return json.loads(raw)
```

### `backend/app/tasks/enhance_tasks.py` (full file)
```python
import os, asyncio
from .celery_app import celery_app
from ..processors.enhancer import (
    auto_color_correct, apply_lut, audio_level_and_denoise,
    blur_background_video, insert_broll, AVAILABLE_LUTS,
)
from ..processors.text_editor import apply_cuts  # reuse from module 04
from ..services.storage import storage_sync
from ..models.job import update_job_sync
from ..config import settings

@celery_app.task(bind=True)
def enhance_task(self, job_id: str, video_key: str, project_id: str,
                 operations: list, lut: str = None):
    """
    operations: list of strings, e.g. ["color", "audio", "background_blur"]
    Applies each operation in sequence on the video.
    """
    update_job_sync(job_id, status="processing")
    try:
        current = storage_sync.download_to_temp(video_key, job_id)
        for op in operations:
            out = current.replace(".mp4", f"_{op}.mp4")
            if op == "color":
                apply_lut(current, out, lut) if lut else auto_color_correct(current, out)
            elif op == "audio":
                audio_level_and_denoise(current, out)
            elif op == "background_blur":
                blur_background_video(current, out)
            if os.path.exists(out):
                current = out

        out_key = f"projects/{project_id}/enhanced/{job_id}.mp4"
        storage_sync.put_file(out_key, current, "video/mp4")
        url = storage_sync.get_presigned_url(out_key)
        update_job_sync(job_id, status="done", result={"output_key": out_key, "url": url})
    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))

@celery_app.task(bind=True)
def insert_broll_task(self, job_id: str, video_key: str, broll_url: str,
                       insert_at: float, broll_duration: float, project_id: str):
    update_job_sync(job_id, status="processing")
    try:
        local = storage_sync.download_to_temp(video_key, job_id)
        out_path = local.replace(".mp4", "_broll.mp4")
        insert_broll(local, broll_url, insert_at, broll_duration, out_path)
        out_key = f"projects/{project_id}/enhanced/{job_id}_broll.mp4"
        storage_sync.put_file(out_key, out_path, "video/mp4")
        url = storage_sync.get_presigned_url(out_key)
        update_job_sync(job_id, status="done", result={"output_key": out_key, "url": url})
    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))

@celery_app.task(bind=True)
def apply_cuts_task(self, job_id: str, video_key: str, cuts: list, project_id: str):
    update_job_sync(job_id, status="processing")
    try:
        local = storage_sync.download_to_temp(video_key, job_id)
        out = local.replace(".mp4", "_edited.mp4")
        apply_cuts(local, out, cuts)
        out_key = f"projects/{project_id}/edited/{job_id}.mp4"
        storage_sync.put_file(out_key, out, "video/mp4")
        url = storage_sync.get_presigned_url(out_key)
        update_job_sync(job_id, status="done", result={"output_key": out_key, "url": url})
    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
```

### `backend/app/routers/enhance.py`
```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.job import Job
from ..tasks.enhance_tasks import enhance_task, insert_broll_task
from ..processors.enhancer import search_broll, suggest_broll_keywords, AVAILABLE_LUTS

router = APIRouter(prefix="/api/enhance", tags=["enhance"])

class EnhanceRequest(BaseModel):
    video_key: str
    project_id: str
    operations: list  # ["color", "audio", "background_blur"]
    lut: Optional[str] = None

class BRollSearchRequest(BaseModel):
    query: str
    count: int = 6

class BRollSuggestRequest(BaseModel):
    segments: list

class BRollInsertRequest(BaseModel):
    video_key: str
    broll_url: str
    insert_at: float
    broll_duration: float
    project_id: str

@router.get("/luts")
def list_luts():
    return {"luts": AVAILABLE_LUTS}

@router.post("/run")
async def run_enhance(req: EnhanceRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="ENHANCE", status="queued", project_id=req.project_id)
    db.add(job); await db.commit()
    enhance_task.delay(job_id, req.video_key, req.project_id, req.operations, req.lut)
    return {"job_id": job_id}

@router.post("/broll/search")
def broll_search(req: BRollSearchRequest):
    return {"results": search_broll(req.query, req.count)}

@router.post("/broll/suggest")
async def broll_suggest(req: BRollSuggestRequest):
    suggestions = await suggest_broll_keywords(req.segments)
    return {"suggestions": suggestions}

@router.post("/broll/insert")
async def broll_insert(req: BRollInsertRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="BROLL_INSERT", status="queued", project_id=req.project_id)
    db.add(job); await db.commit()
    insert_broll_task.delay(job_id, req.video_key, req.broll_url,
                             req.insert_at, req.broll_duration, req.project_id)
    return {"job_id": job_id}
```

---

## LUT Files

Place 6 free `.cube` LUT files in `backend/luts/`:
- Download from: Ground Control Free LUTs, RocketStock Free LUTs
- File names must match `AVAILABLE_LUTS` list exactly
- Each file is ~40KB plain text — safe to commit to git

---

## Add to `.env`
```env
PEXELS_API_KEY=your_pexels_api_key_here
```

---

## Checklist for Cursor

- [ ] `backend/app/processors/enhancer.py` — all 6 functions
- [ ] `backend/app/tasks/enhance_tasks.py` — enhance, insert_broll, apply_cuts tasks
- [ ] `backend/app/routers/enhance.py` — 5 endpoints
- [ ] `backend/luts/` directory with 6 `.cube` files
- [ ] `PEXELS_API_KEY` added to `.env` and `config.py`
- [ ] `noisereduce`, `soundfile`, `rembg`, `requests` in requirements
- [ ] All FFmpeg calls use `settings.ffmpeg_path`
- [ ] Frontend `BRollPanel.tsx` — search + insert UI
- [ ] Frontend `EnhancementPanel.tsx` — color/audio/bg checkboxes + LUT picker