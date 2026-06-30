# Phase 0 — Asset Library & Tagging (Foundation for Everything Else)

## Why this phase exists

Style cloning failed because the system had no structured understanding of *what kind*
of asset the user actually owns. To match a reference video's "clip_1: close-up talking
head, energetic" slot against the user's library, every user asset needs machine-readable
attributes — not just a filename. Without this, asset matching is impossible to do
correctly, and the system is forced to guess or silently substitute, which is the exact
bug you found.

This phase must be built and working before Phase 1 (Style Intelligence) and Phase 2
(Gap Resolution) can function correctly. Nothing downstream works without this.

---

## What Gets Tagged

Every asset (video clip, image, logo) in a user's workspace library gets auto-tagged
on upload. Tags are stored once and reused for every future template-matching
operation — the user never manually tags anything.

### Asset Tag Schema

```python
# backend/app/schemas/asset_tags.py
from pydantic import BaseModel
from typing import Optional, Literal

class AssetTags(BaseModel):
    # What is shown
    shot_type: Literal[
        "talking_head", "b_roll", "screen_recording", "product_shot",
        "text_card", "logo", "establishing_shot", "action", "interview", "unknown"
    ]
    subject_count: int                    # 0 = no people, 1 = solo, 2+ = group
    has_face: bool
    setting: Literal["indoor", "outdoor", "studio", "office", "unknown"]

    # Mood / energy — used to match reference pacing
    energy_level: Literal["calm", "moderate", "high_energy"]
    emotion: Literal["neutral", "happy", "serious", "excited", "informative", "unknown"]

    # Visual properties
    dominant_colors: list[str]            # hex codes
    aspect_ratio: str                     # "16:9", "9:16", "1:1", etc.
    is_landscape_orientation: bool

    # Content hints
    has_text_overlay: bool
    has_spoken_audio: bool = False
    duration_seconds: Optional[float] = None

    # Free-text description for fuzzy matching fallback
    description: str                      # 1-sentence description

    # Confidence
    tagging_confidence: float             # 0-1
```

### SQLAlchemy Model

```python
# backend/app/models/asset_library.py
from sqlalchemy import Column, String, JSON, DateTime
from sqlalchemy.sql import func
from ..database import Base
import uuid

class LibraryAsset(Base):
    """
    Every asset a workspace owns (uploaded or previously AI-generated), tagged
    once on ingestion and reused for all future template matching.
    """
    __tablename__ = "library_assets"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, nullable=False, index=True)
    storage_key = Column(String, nullable=False)         # MinIO key
    thumb_key = Column(String)
    asset_type = Column(String, nullable=False)           # "video" | "image" | "logo"
    source = Column(String, default="uploaded")            # "uploaded" | "ai_generated"
    tags = Column(JSON, nullable=False)                    # AssetTags as dict
    used_in_templates = Column(JSON, default=list)         # template_ids that used this asset
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

---

## Files to Create

### `backend/app/processors/asset_tagger.py`

```python
import base64, io, json, os
import cv2
from PIL import Image
from openai import AsyncOpenAI
from ..config import settings
from ..services.ai_budget import budget

client = AsyncOpenAI(api_key=settings.openai_api_key)

_TAGGING_PROMPT = """Analyze this visual asset and return ONLY valid JSON (no markdown) matching this exact schema:
{
  "shot_type": "talking_head|b_roll|screen_recording|product_shot|text_card|logo|establishing_shot|action|interview|unknown",
  "subject_count": 0,
  "has_face": false,
  "setting": "indoor|outdoor|studio|office|unknown",
  "energy_level": "calm|moderate|high_energy",
  "emotion": "neutral|happy|serious|excited|informative|unknown",
  "dominant_colors": ["#hex1", "#hex2"],
  "aspect_ratio": "16:9",
  "is_landscape_orientation": true,
  "has_text_overlay": false,
  "description": "one sentence plain description",
  "tagging_confidence": 0.9
}"""


async def tag_image_asset(image_path: str) -> dict:
    """Tag a static image asset using GPT-4o-mini vision."""
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    budget.record(0.00015)
    resp = await client.chat.completions.create(
        model=settings.openai_model_primary,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": _TAGGING_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"}},
            ]
        }],
        max_tokens=400,
        temperature=0.1,
    )
    raw = resp.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:-1])
    tags = json.loads(raw)
    tags.setdefault("has_spoken_audio", False)
    tags.setdefault("duration_seconds", None)
    return tags


async def tag_video_asset(video_path: str, transcript_snippet: str = "") -> dict:
    """Tag a video asset by sampling 3 frames (10%, 50%, 85% through) + first transcript line."""
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps if fps else 0

    sample_indices = [int(total * 0.1), int(total * 0.5), int(total * 0.85)]
    frames_b64 = []
    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="JPEG", quality=70)
        frames_b64.append(base64.b64encode(buf.getvalue()).decode())
    cap.release()

    image_parts = [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b}", "detail": "low"}}
        for b in frames_b64
    ]

    budget.record(0.0003)
    resp = await client.chat.completions.create(
        model=settings.openai_model_primary,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": _TAGGING_PROMPT + f'\n\nFirst few spoken words (if any): "{transcript_snippet}"'}
            ] + image_parts
        }],
        max_tokens=400,
        temperature=0.1,
    )
    raw = resp.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:-1])
    tags = json.loads(raw)
    tags["duration_seconds"] = round(duration, 2)
    tags["has_spoken_audio"] = bool(transcript_snippet.strip())
    return tags
```

### `backend/app/routers/asset_library.py`

```python
import uuid, os
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..database import get_db
from ..models.asset_library import LibraryAsset
from ..services.storage import storage_sync
from ..processors.asset_tagger import tag_image_asset, tag_video_asset
from ..config import settings

router = APIRouter(prefix="/api/library", tags=["asset-library"])

@router.post("/upload")
async def upload_asset(
    file: UploadFile = File(...),
    workspace_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    asset_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    is_video = bool(file.content_type and "video" in file.content_type)
    asset_type = "video" if is_video else "image"

    content = await file.read()
    key = f"workspaces/{workspace_id}/library/{asset_id}{ext}"
    await storage_sync.put_object(key, content, file.content_type or "application/octet-stream")

    # Write to temp for tagging
    os.makedirs(settings.temp_dir, exist_ok=True)
    local_path = os.path.join(settings.temp_dir, f"{asset_id}{ext}")
    with open(local_path, "wb") as f:
        f.write(content)

    if asset_type == "image":
        tags = await tag_image_asset(local_path)
    else:
        tags = await tag_video_asset(local_path)

    asset = LibraryAsset(
        id=asset_id, workspace_id=workspace_id,
        storage_key=key, asset_type=asset_type,
        source="uploaded", tags=tags,
    )
    db.add(asset)
    await db.commit()
    os.remove(local_path)

    return {"id": asset_id, "tags": tags, "storage_key": key, "asset_type": asset_type}

@router.get("/{workspace_id}")
async def list_library(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LibraryAsset).where(LibraryAsset.workspace_id == workspace_id)
    )
    assets = result.scalars().all()
    return [{
        "id": a.id, "storage_key": a.storage_key, "asset_type": a.asset_type,
        "tags": a.tags, "source": a.source,
    } for a in assets]
```

---

## Frontend: Simple Library Grid

### `frontend/components/library/AssetLibraryGrid.tsx`

```tsx
"use client";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

interface LibraryAsset {
  id: string;
  storage_key: string;
  asset_type: "video" | "image";
  tags: {
    shot_type: string;
    energy_level: string;
    description: string;
  };
}

const SHOT_TYPE_ICONS: Record<string, string> = {
  talking_head: "🎙️", b_roll: "🎬", screen_recording: "🖥️",
  product_shot: "📦", text_card: "📝", logo: "🏷️",
  establishing_shot: "🏞️", action: "⚡", interview: "💬", unknown: "❓",
};

export function AssetLibraryGrid({ workspaceId }: { workspaceId: string }) {
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/library/${workspaceId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }).then(r => r.json()).then(setAssets);
  }, [workspaceId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("workspace_id", workspaceId);
    const res = await fetch(`${API}/api/library/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: form,
    });
    const asset = await res.json();
    setAssets(prev => [...prev, asset]);
    setUploading(false);
  };

  return (
    <div className="p-4">
      <label className="block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer mb-4 hover:border-gray-400">
        <input type="file" accept="video/*,image/*" className="hidden"
          onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
        <p className="text-sm text-gray-500">
          {uploading ? "Tagging your asset..." : "Click to add a clip or image to your library"}
        </p>
      </label>

      <div className="grid grid-cols-3 gap-3">
        {assets.map(a => (
          <div key={a.id} className="border rounded-lg p-2 bg-white">
            <div className="aspect-video bg-gray-100 rounded mb-2 flex items-center justify-center text-2xl">
              {SHOT_TYPE_ICONS[a.tags.shot_type] || "❓"}
            </div>
            <p className="text-xs text-gray-600 line-clamp-2">{a.tags.description}</p>
            <div className="flex gap-1 mt-1">
              <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{a.tags.shot_type}</span>
              <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{a.tags.energy_level}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Why This Matters for Phase 2

When Phase 2's matching engine looks for "a calm, indoor, talking-head clip" to fill a
template slot, it queries `LibraryAsset.tags` with structured filters — not fuzzy
filename guessing. If no match scores above a confidence threshold, that is exactly
the trigger for "asset missing → show Generate button" instead of silently using
whatever's available, which is the bug that started this whole rework.

---

## Checklist for Cursor

- [ ] `backend/app/models/asset_library.py` — `LibraryAsset` model + Alembic migration
- [ ] `backend/app/schemas/asset_tags.py` — `AssetTags` Pydantic schema
- [ ] `backend/app/processors/asset_tagger.py` — image + video tagging functions
- [ ] `backend/app/routers/asset_library.py` — upload + list endpoints
- [ ] Auto-tag runs synchronously on upload (single GPT-4o-mini call, fast enough)
- [ ] Tagging cost recorded via `budget.record()` for every tag call
- [ ] `AssetLibraryGrid.tsx` — upload zone + tagged thumbnail grid
- [ ] No manual tag-editing UI in v1 — tags are system-generated only, this keeps it
      simple for the non-editor user
- [ ] Existing `MediaAsset` model (from raw ingestion) and new `LibraryAsset` model
      are separate concepts: `MediaAsset` = raw uploaded/ingested footage for a specific
      project; `LibraryAsset` = the reusable, tagged asset pool for a workspace used
      for template matching across all projects