# Module 02 — Style Cloning & Template Extraction

## Purpose
Given a reference video (Instagram Reel, TikTok, or any URL/file), analyze it using a vision LLM to extract its style fingerprint — layout, text overlays, caption style, color palette, transitions, aspect ratio, pacing — and produce a reusable **template** with placeholder slots. The user then fills in their own footage/images/text.

---

## What a "Template" Means Here

A template is a JSON document describing the structure of the video:
```json
{
  "id": "tmpl_abc123",
  "name": "Cloned from @xyz TikTok",
  "duration": 30,
  "aspect_ratio": "9:16",
  "color_palette": ["#1a1a1a", "#ffffff", "#f5c518"],
  "font": { "family": "Montserrat", "weight": 700, "size": 48 },
  "caption_style": {
    "position": "bottom_third",
    "animation": "word_by_word",
    "highlight_color": "#f5c518",
    "emoji": true
  },
  "layers": [
    { "type": "video_placeholder", "start": 0, "end": 8, "slot": "clip_1", "label": "Opening hook clip" },
    { "type": "text_overlay", "start": 0, "end": 3, "slot": "hook_text", "style": {...} },
    { "type": "video_placeholder", "start": 8, "end": 22, "slot": "clip_2", "label": "Main content" },
    { "type": "transition", "at": 8, "effect": "zoom_in" },
    { "type": "caption_track", "start": 0, "end": 30, "style": "hormozi" },
    { "type": "outro_placeholder", "start": 22, "end": 30, "slot": "clip_3" }
  ],
  "audio": {
    "background_music": true,
    "volume": 0.15
  }
}
```

---

## Files to Create / Modify

### Python API — Style Analyzer

**`apps/api/processors/style_analyzer.py`**
```python
import cv2, subprocess, json, base64, os, io
import numpy as np
from PIL import Image
import google.generativeai as genai
from config import settings

genai.configure(api_key=os.environ["GEMINI_API_KEY"])
model = genai.GenerativeModel("gemini-2.0-flash")

async def analyze_video_style(video_path: str, project_id: str) -> dict:
    """Main entry: given local video path, sample frames, analyze with Gemini, return template JSON."""
    frames = extract_key_frames(video_path, max_frames=15, interval_sec=2)
    scene_cuts = detect_scene_cuts(video_path)
    meta = get_video_meta(video_path)
    palette = extract_color_palette(frames[0] if frames else None)
    style_analysis = await gemini_analyze_frames(frames, meta, scene_cuts)
    template = build_template(style_analysis, meta, palette, scene_cuts)
    return template


def extract_key_frames(video_path: str, max_frames: int = 15, interval_sec: float = 2.0) -> list:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    interval_frames = int(fps * interval_sec)
    frames = []
    frame_idx = 0
    while cap.isOpened() and len(frames) < max_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb)
        frames.append(pil_img)
        frame_idx += interval_frames
    cap.release()
    return frames


def detect_scene_cuts(video_path: str) -> list:
    from scenedetect import detect, ContentDetector
    scene_list = detect(video_path, ContentDetector(threshold=27.0))
    return [scene[0].get_seconds() for scene in scene_list]


def extract_color_palette(frame: Image.Image | None, num_colors: int = 5) -> list:
    if frame is None:
        return ["#000000", "#ffffff"]
    img_array = np.array(frame.resize((150, 150))).reshape(-1, 3).astype(np.float32)
    _, labels, centers = cv2.kmeans(img_array, num_colors, None,
                                     (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2),
                                     10, cv2.KMEANS_RANDOM_CENTERS)
    centers = centers.astype(int)
    return [f"#{r:02x}{g:02x}{b:02x}" for r, g, b in centers]


async def gemini_analyze_frames(frames: list, meta: dict, scene_cuts: list) -> dict:
    frame_parts = []
    for i, frame in enumerate(frames[:8]):
        buf = io.BytesIO()
        frame.save(buf, format="JPEG", quality=80)
        b64 = base64.b64encode(buf.getvalue()).decode()
        frame_parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b64}})

    prompt = f"""
You are a video style analyst. Analyze these {len(frames)} frames from a video and extract its editing style.
Video info: {meta['duration']:.1f}s, {meta['width']}x{meta['height']}, ~{len(scene_cuts)} scene cuts.
Return ONLY valid JSON with this exact structure:
{{
  "caption_style": {{
    "position": "bottom_third|center|top_third",
    "animation": "word_by_word|sentence|fade|pop",
    "has_highlight": true|false,
    "highlight_color": "#hex or null",
    "font_weight": "bold|normal",
    "has_emoji": true|false,
    "background": "none|semi_transparent|solid"
  }},
  "text_overlays": [
    {{"type": "hook|title|lower_third|cta", "style": "description"}}
  ],
  "transitions": ["zoom_in", "cut", "fade", ...],
  "pacing": "fast|medium|slow",
  "hook_style": "question|statement|statistic|story",
  "visual_style": "minimalist|bold|cinematic|ugc|corporate",
  "layout_zones": {{
    "safe_zone_top": 0.15,
    "safe_zone_bottom": 0.2,
    "text_zone": "bottom_third"
  }},
  "estimated_clip_count": 3,
  "has_background_music": true|false,
  "has_sound_effects": true|false
}}
"""
    response = model.generate_content([prompt] + frame_parts)
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()
    return json.loads(raw)


def build_template(style: dict, meta: dict, palette: list, scene_cuts: list) -> dict:
    clip_count = max(style.get("estimated_clip_count", 2), len(scene_cuts) or 2)
    duration = meta["duration"]
    clip_duration = duration / clip_count
    layers = []
    for i in range(clip_count):
        start = i * clip_duration
        end = (i + 1) * clip_duration
        layers.append({
            "type": "video_placeholder",
            "start": round(start, 2), "end": round(end, 2),
            "slot": f"clip_{i+1}",
            "label": "Hook clip" if i == 0 else ("Main content" if i < clip_count - 1 else "Outro"),
        })
        if i < clip_count - 1:
            effect = style.get("transitions", ["cut"])[i % len(style.get("transitions", ["cut"]))]
            layers.append({"type": "transition", "at": round(end, 2), "effect": effect})
    layers.append({"type": "caption_track", "start": 0, "end": duration, "style": style.get("caption_style", {})})
    for overlay in style.get("text_overlays", []):
        layers.append({"type": "text_overlay", "slot": overlay["type"], "label": overlay["style"], "start": 0, "end": 3})
    return {
        "version": "1.0", "duration": round(duration, 2),
        "aspect_ratio": f"{meta['width']}:{meta['height']}",
        "color_palette": palette, "pacing": style.get("pacing", "medium"),
        "visual_style": style.get("visual_style", "ugc"),
        "hook_style": style.get("hook_style", "statement"),
        "layers": layers,
        "audio": {"background_music": style.get("has_background_music", False),
                  "sound_effects": style.get("has_sound_effects", False),
                  "bg_music_volume": 0.12},
        "caption_style": style.get("caption_style", {}),
    }


def get_video_meta(video_path: str) -> dict:
    cmd = [settings.FFPROBE_PATH, "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", video_path]
    data = json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)
    vs = next(s for s in data["streams"] if s["codec_type"] == "video")
    return {"duration": float(data["format"].get("duration", 30)),
            "width": int(vs.get("width", 1080)), "height": int(vs.get("height", 1920))}
```

**`apps/api/routers/style_clone.py`**
```python
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
import uuid, tempfile, os
from config import settings
from processors.style_analyzer import analyze_video_style

router = APIRouter(prefix="/style-clone", tags=["style-clone"])

class StyleCloneRequest(BaseModel):
    video_key: str
    project_id: str
    job_id: str

class StyleCloneResponse(BaseModel):
    job_id: str
    status: str

@router.post("/analyze", response_model=StyleCloneResponse)
async def clone_style(req: StyleCloneRequest, bg: BackgroundTasks):
    bg.add_task(_run_style_analysis, req)
    return {"job_id": req.job_id, "status": "processing"}

async def _run_style_analysis(req: StyleCloneRequest):
    # Download video to temp, analyze, clean up
    import boto3
    from botocore.config import Config as BotoConfig
    s3 = boto3.client("s3", endpoint_url=settings.S3_ENDPOINT_URL,
                      aws_access_key_id=settings.S3_ACCESS_KEY_ID,
                      aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                      config=BotoConfig(signature_version="s3v4"),
                      region_name="us-east-1")
    tmp = tempfile.mktemp(suffix=".mp4")
    s3.download_file(settings.S3_BUCKET_MEDIA, req.video_key, tmp)
    template = await analyze_video_style(tmp, req.project_id)
    os.remove(tmp)
    # Notify via WebSocket / job status
    # The frontend polls GET /api/tasks/{job_id} for result
    return template
```

> **Note**: Requires `GEMINI_API_KEY` in `.env`. This is new functionality — the existing project uses easyocr for caption detection, not a vision LLM.

### FastAPI replaces Node.js for template CRUD

The existing project has no Node.js layer. Template CRUD is handled by the FastAPI directly using SQLAlchemy:

```python
# apps/api/routers/templates.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.template import Template
from pydantic import BaseModel

router = APIRouter(prefix="/templates", tags=["templates"])

class TemplateCreate(BaseModel):
    name: str
    project_id: str | None = None
    data: dict

@router.post("/")
async def create_template(req: TemplateCreate, db: AsyncSession = Depends(get_db)):
    tmpl = Template(name=req.name, project_id=req.project_id, data=req.data)
    db.add(tmpl)
    await db.commit()
    return {"id": str(tmpl.id)}

@router.get("/")
async def list_templates(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(select(Template).order_by(Template.created_at.desc()))
    return [{"id": str(t.id), "name": t.name, "data": t.data} for t in result.scalars()]
```

### Frontend

**`apps/web/components/editor/TemplateGallery.tsx`**
```tsx
'use client';
import { useEffect, useState } from 'react';

interface Template {
  id: string;
  name: string;
  thumbnailUrl?: string;
  data: {
    aspect_ratio: string;
    pacing: string;
    visual_style: string;
    duration: number;
    layers: Array<{ type: string; slot?: string; label?: string }>;
  };
}

interface Props {
  onSelect: (template: Template) => void;
}

export function TemplateGallery({ onSelect }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(setTemplates);
  }, []);

  return (
    <div className="grid grid-cols-3 gap-3">
      {templates.map(t => (
        <div
          key={t.id}
          onClick={() => onSelect(t)}
          className="border rounded-lg p-3 cursor-pointer hover:border-blue-500 transition-colors"
        >
          <div className="aspect-[9/16] bg-gray-100 rounded mb-2 flex items-center justify-center text-xs text-gray-400">
            {t.data.aspect_ratio}
          </div>
          <p className="text-sm font-medium truncate">{t.name}</p>
          <p className="text-xs text-gray-500">{t.data.visual_style} · {Math.round(t.data.duration)}s</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {t.data.layers
              .filter(l => l.type === 'video_placeholder')
              .map((l, i) => (
                <span key={i} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                  {l.label || `Clip ${i+1}`}
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**`apps/web/components/editor/TemplateFiller.tsx`**
```tsx
'use client';
// Renders the template's placeholder slots for the user to fill in.
// Each slot shows: video_placeholder → file picker, text_overlay → text input

interface Slot {
  type: string;
  slot: string;
  label?: string;
  start: number;
  end: number;
}

interface Props {
  template: { layers: Slot[] };
  onFill: (slot: string, value: File | string) => void;
}

export function TemplateFiller({ template, onFill }: Props) {
  const videoSlots = template.layers.filter(l => l.type === 'video_placeholder');
  const textSlots = template.layers.filter(l => l.type === 'text_overlay');

  return (
    <div className="space-y-4 p-4">
      <h3 className="font-semibold text-sm">Fill in your content</h3>

      {videoSlots.map(slot => (
        <div key={slot.slot} className="border rounded-lg p-3">
          <p className="text-sm font-medium mb-1">{slot.label || slot.slot}</p>
          <p className="text-xs text-gray-500 mb-2">{slot.start}s – {slot.end}s</p>
          <input
            type="file"
            accept="video/*,image/*"
            onChange={e => e.target.files?.[0] && onFill(slot.slot, e.target.files[0])}
            className="text-xs"
          />
        </div>
      ))}

      {textSlots.map(slot => (
        <div key={slot.slot} className="border rounded-lg p-3">
          <p className="text-sm font-medium mb-1">{slot.label || slot.slot}</p>
          <input
            type="text"
            placeholder={`Enter ${slot.slot}...`}
            onChange={e => onFill(slot.slot, e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
        </div>
      ))}
    </div>
  );
}
```

---

## Database Schema Addition

```python
# apps/api/models/template.py
import uuid
from typing import Optional
from sqlalchemy import String, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from models.base import BaseModel

class Template(BaseModel):
    __tablename__ = "templates"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    source_job_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    thumb_key: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
```

Add to `models/__init__.py` and run:
```bash
cd apps/api && alembic revision --autogenerate -m 'add template model' && alembic upgrade head
```

---

## Checklist for Cursor

- [ ] `apps/api/processors/style_analyzer.py` with frame extraction + Gemini vision call
- [ ] `apps/api/routers/style_clone.py` router with background task
- [ ] Template JSON schema defined and documented
- [ ] FastAPI template CRUD routes in `apps/api/routers/templates.py`
- [ ] `apps/api/models/template.py` — SQLAlchemy model with JSONB data column
- [ ] Alembic migration for templates table
- [ ] `apps/web/components/editor/TemplateGallery.tsx` component
- [ ] `apps/web/components/editor/TemplateFiller.tsx` component (slot → file/text)
- [ ] PySceneDetect installed (`pip install scenedetect[opencv]`)
- [ ] Gemini API key wired in `.env` (requires `GEMINI_API_KEY`)