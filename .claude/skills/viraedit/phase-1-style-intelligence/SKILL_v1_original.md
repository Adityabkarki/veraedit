# Phase 1 — Style Intelligence (Gemini-Powered Deep Style Fingerprinting)

## Why this replaces the old Style Cloning module

The earlier style-cloning implementation extracted a shallow fingerprint (caption
position, pacing, transitions) and built a template with generic `video_placeholder`
slots. The slot had no real description of *what* footage belongs there — so when
matching the user's assets against it, the system had nothing concrete to match
against, and silently fell back to whatever was on hand.

This phase replaces that with **Gemini 2.0 Flash video understanding** (Gemini can
natively ingest video, not just sampled frames) to produce a richer fingerprint where
every slot has a structured requirement, not just a time range.

---

## Why Gemini specifically (not GPT-4o) for this step

Gemini 2.0 Flash supports native video input (you can hand it the actual video file/URL,
not just sampled JPEG frames), which captures motion, pacing, and transition style far
more accurately than frame sampling. This is the right tool for the "watch this video and
describe its editing style" job. GPT-4o-mini remains the right tool for transcript-based
reasoning elsewhere in the app (chapters, virality scoring) — we are not replacing OpenAI,
we are using each model for what it's actually better at.

---

## New Template Schema (Slot-Level Requirements)

Every slot now carries a **requirement descriptor**, not just a label:

```python
# backend/app/schemas/template.py
from pydantic import BaseModel
from typing import Optional, Literal

class SlotRequirement(BaseModel):
    """What kind of asset this slot needs — used for matching in Phase 2."""
    shot_type: str               # matches AssetTags.shot_type vocabulary
    energy_level: str            # matches AssetTags.energy_level
    min_duration: float
    max_duration: float
    needs_face: bool = False
    setting_hint: Optional[str] = None
    description: str             # human-readable: "Energetic close-up reacting to camera"

class TemplateSlot(BaseModel):
    slot_id: str
    type: Literal["video_placeholder", "text_overlay", "image_placeholder", "logo_placeholder"]
    start: float
    end: float
    label: str
    requirement: Optional[SlotRequirement] = None   # None for text/transition slots

class StyleTemplate(BaseModel):
    version: str = "2.0"
    source_url: Optional[str]
    duration: float
    aspect_ratio: str
    color_palette: list[str]
    pacing: Literal["fast", "medium", "slow"]
    visual_style: str
    caption_style: dict
    music_mood: Optional[str] = None      # "upbeat", "calm", "dramatic", "none"
    slots: list[TemplateSlot]
    transitions: list[dict]               # [{"at": 8.0, "effect": "zoom_in"}]
```

---

## Files to Create

### `backend/app/processors/gemini_style_analyzer.py`

```python
import os, json, base64
import google.generativeai as genai
from ..config import settings
from ..services.ai_budget import budget

genai.configure(api_key=settings.gemini_api_key)

_FINGERPRINT_PROMPT = """You are an expert video editor analyzing a reference video to
create a reusable EDITING TEMPLATE. Someone with ZERO video editing skills will use this
template to make their own version by swapping in their own footage and text — so every
slot description must be precise and concrete enough that an automated system can find
or generate a matching clip.

Watch the full video and return ONLY valid JSON (no markdown) in this exact schema:

{
  "duration": 30.0,
  "aspect_ratio": "9:16",
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "pacing": "fast|medium|slow",
  "visual_style": "minimalist|bold|cinematic|ugc|corporate",
  "music_mood": "upbeat|calm|dramatic|none",
  "caption_style": {
    "position": "bottom_third|center|top_third",
    "animation": "word_by_word|sentence|fade",
    "has_highlight": true,
    "highlight_color": "#hex or null",
    "has_emoji": true
  },
  "slots": [
    {
      "slot_id": "clip_1",
      "type": "video_placeholder",
      "start": 0.0,
      "end": 3.5,
      "label": "Opening hook",
      "requirement": {
        "shot_type": "talking_head",
        "energy_level": "high_energy",
        "min_duration": 3.0,
        "max_duration": 4.0,
        "needs_face": true,
        "setting_hint": "indoor or studio",
        "description": "Energetic close-up of speaker reacting directly to camera with surprised expression"
      }
    },
    {
      "slot_id": "hook_text",
      "type": "text_overlay",
      "start": 0.0,
      "end": 3.0,
      "label": "Hook headline text",
      "requirement": null
    }
  ],
  "transitions": [
    {"at": 3.5, "effect": "zoom_in"}
  ]
}

Rules for slot requirements:
- shot_type must be one of: talking_head, b_roll, screen_recording, product_shot,
  text_card, logo, establishing_shot, action, interview
- energy_level must be one of: calm, moderate, high_energy
- Be SPECIFIC in description — not "main content" but "Close-up of hands typing on
  laptop keyboard, screen recording style, calm pacing"
- Every video_placeholder slot MUST have a requirement object
- text_overlay and transition entries have requirement: null
"""


async def analyze_reference_video(video_path_or_url: str, is_url: bool = False) -> dict:
    """
    Use Gemini 2.0 Flash native video understanding to produce a rich style template.
    Accepts either a local file path or a URL Gemini can fetch directly.
    """
    model = genai.GenerativeModel("gemini-2.0-flash")

    # Estimate cost: Gemini video input ~$0.002 per video-second analyzed (approx)
    budget.record(0.05)  # flat estimate per analysis call; refine once usage data exists

    if is_url:
        # Gemini File API can fetch directly for supported URLs; otherwise
        # the caller should have already downloaded it via yt-dlp (Module 01)
        video_file = genai.upload_file(path=video_path_or_url)
    else:
        video_file = genai.upload_file(path=video_path_or_url)

    # Wait for processing
    import time
    while video_file.state.name == "PROCESSING":
        time.sleep(2)
        video_file = genai.get_file(video_file.name)

    if video_file.state.name == "FAILED":
        raise RuntimeError("Gemini failed to process the reference video")

    response = model.generate_content(
        [_FINGERPRINT_PROMPT, video_file],
        generation_config={"temperature": 0.2, "max_output_tokens": 2000},
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:-1])

    template = json.loads(raw)

    # Cleanup uploaded file from Gemini's storage
    genai.delete_file(video_file.name)

    return template
```

### `backend/app/tasks/style_tasks.py`

```python
import json, os
from .celery_app import celery_app
from ..processors.gemini_style_analyzer import analyze_reference_video
from ..services.storage import storage_sync
from ..models.job import update_job_sync
from ..config import settings
import asyncio

@celery_app.task(bind=True, time_limit=300)
def analyze_style_task(self, job_id: str, video_key: str, project_id: str, workspace_id: str):
    update_job_sync(job_id, status="processing", result={"step": "analyzing_with_gemini"})
    try:
        local_path = storage_sync.download_to_temp(video_key, job_id)
        template = asyncio.run(analyze_reference_video(local_path))

        template_key = f"workspaces/{workspace_id}/templates/{job_id}.json"
        storage_sync.client.put_object(
            Bucket=settings.s3_bucket_name, Key=template_key,
            Body=json.dumps(template).encode(), ContentType="application/json",
        )

        update_job_sync(job_id, status="done", result={
            "template_key": template_key,
            "template": template,
        })
        if os.path.exists(local_path):
            os.remove(local_path)
    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
```

### `backend/app/routers/style_intelligence.py`

```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from ..database import get_db
from ..models.job import Job
from ..tasks.ingest_tasks import ingest_url_task  # reuse Module 01 download
from ..tasks.style_tasks import analyze_style_task
from ..config import settings

router = APIRouter(prefix="/api/style-intelligence", tags=["style-intelligence"])

class AnalyzeReferenceRequest(BaseModel):
    url: str | None = None         # Instagram/TikTok/YouTube link
    video_key: str | None = None   # OR an already-uploaded video
    project_id: str
    workspace_id: str

@router.post("/analyze")
async def analyze(req: AnalyzeReferenceRequest, db: AsyncSession = Depends(get_db)):
    """
    Single entry point: paste a link OR pick an uploaded video, get back
    a rich, slot-level style template within ~30-60 seconds.
    """
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="STYLE_INTELLIGENCE", status="queued",
              project_id=req.project_id, payload=req.dict())
    db.add(job)
    await db.commit()

    if req.url:
        # Chain: download URL first, then analyze
        download_job_id = str(uuid.uuid4())
        ingest_url_task.delay(download_job_id, req.url, req.project_id)
        # The chain continuation is handled by polling — see chained task below
        from ..tasks.style_tasks import chain_download_then_analyze
        chain_download_then_analyze.delay(job_id, download_job_id, req.project_id, req.workspace_id)
    else:
        analyze_style_task.delay(job_id, req.video_key, req.project_id, req.workspace_id)

    return {"job_id": job_id}
```

### Chained task for URL references — `backend/app/tasks/style_tasks.py` (append)

```python
@celery_app.task(bind=True, time_limit=600)
def chain_download_then_analyze(self, job_id: str, download_job_id: str,
                                 project_id: str, workspace_id: str):
    """Polls the download job, then kicks off style analysis once it's done."""
    import time
    from ..models.job import get_job_sync

    update_job_sync(job_id, status="processing", result={"step": "downloading_reference"})

    for _ in range(60):  # up to 5 minutes
        dl_job = get_job_sync(download_job_id)
        if dl_job and dl_job.status == "done":
            video_key = dl_job.result["video_key"]
            analyze_style_task.apply(args=[job_id, video_key, project_id, workspace_id])
            return
        if dl_job and dl_job.status == "failed":
            update_job_sync(job_id, status="failed", error="Reference video download failed")
            return
        time.sleep(5)

    update_job_sync(job_id, status="failed", error="Reference download timed out")
```

### Add `get_job_sync` helper to `backend/app/models/job.py`

```python
def get_job_sync(job_id: str):
    with _SyncSession() as session:
        return session.get(Job, job_id)
```

---

## Config Addition

```python
# backend/app/config.py — add this field
gemini_api_key: str = ""
```

```env
# .env — add this line
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## Frontend: Reference Input (the ONLY input the non-editor sees)

### `frontend/components/editor/ReferenceInput.tsx`

```tsx
"use client";
import { useState } from "react";
import { useJobPoller } from "@/hooks/useJobPoller";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Props {
  projectId: string;
  workspaceId: string;
  onTemplateReady: (template: any) => void;
}

export function ReferenceInput({ projectId, workspaceId, onTemplateReady }: Props) {
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  const { status } = useJobPoller(jobId, (result) => {
    if (result?.template) onTemplateReady(result.template);
  });

  const analyze = async () => {
    const res = await fetch(`${API}/api/style-intelligence/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({ url, project_id: projectId, workspace_id: workspaceId }),
    });
    const { job_id } = await res.json();
    setJobId(job_id);
  };

  const STEP_LABELS: Record<string, string> = {
    downloading_reference: "Downloading the video you shared...",
    analyzing_with_gemini: "Studying the style — pacing, captions, cuts...",
  };

  return (
    <div className="max-w-lg mx-auto py-12 text-center space-y-4">
      <h2 className="text-xl font-semibold">Paste a video you like</h2>
      <p className="text-sm text-gray-500">
        Any TikTok, Instagram Reel, or YouTube link. We'll study its style and build
        your video to match — you just bring your own footage and text.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-lg px-4 py-3 text-sm"
          placeholder="https://www.tiktok.com/@..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={analyze}
          disabled={!url || status === "processing"}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Analyze
        </button>
      </div>
      {status === "processing" && (
        <p className="text-sm text-blue-600 animate-pulse">
          {STEP_LABELS[/* read from result */ "analyzing_with_gemini"] || "Working..."}
        </p>
      )}
    </div>
  );
}
```

---

## Checklist for Cursor

- [ ] `GEMINI_API_KEY` added to `.env` and `config.py`
- [ ] `google-generativeai` package added to `requirements.txt`
- [ ] `backend/app/schemas/template.py` — `SlotRequirement`, `TemplateSlot`, `StyleTemplate`
- [ ] `backend/app/processors/gemini_style_analyzer.py` — native video upload + analysis
- [ ] `backend/app/tasks/style_tasks.py` — `analyze_style_task` + `chain_download_then_analyze`
- [ ] `get_job_sync` helper added to `job.py`
- [ ] `backend/app/routers/style_intelligence.py` — single `/analyze` endpoint handling
      both URL and pre-uploaded video inputs
- [ ] `ReferenceInput.tsx` — the single-field entry point, no other inputs visible
- [ ] Every slot in the output template has a `requirement` object with concrete,
      descriptive text — this is what makes Phase 2 matching possible
- [ ] Gemini file cleanup (`genai.delete_file`) called after every analysis to avoid
      storage buildup on Gemini's side
