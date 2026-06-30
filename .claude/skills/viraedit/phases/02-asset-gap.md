# Phase 2 — Asset Gap Resolution (The Core Fix)

## This is the bug you found. This phase fixes it directly.

The old behavior: apply a template, and if no matching asset exists, the system
silently substitutes whatever is available. The user has no idea their output
doesn't match the reference anymore.

The new behavior: every slot is either **matched** (green, confident), **partial**
(yellow, best-available-but-not-great match, user can accept or regenerate), or
**missing** (red, nothing usable exists, must generate or manually provide).
Nothing is ever silently substituted. The user always sees the true state and has
a one-click fix.

---

## Matching Algorithm

### `backend/app/processors/asset_matcher.py`

```python
from typing import Optional
from ..schemas.template import TemplateSlot, SlotRequirement

MatchResult = dict  # {"status": "matched|partial|missing", "asset_id": str|None, "score": float}

def score_asset_against_requirement(asset_tags: dict, req: SlotRequirement) -> float:
    """
    Returns 0.0–1.0 confidence score for how well a tagged asset fills a slot requirement.
    Weighted scoring — shot_type and duration are hard constraints, everything else
    contributes to a soft score.
    """
    score = 0.0
    weights_total = 0.0

    # Hard constraint: shot_type mismatch caps score heavily
    weights_total += 0.35
    if asset_tags.get("shot_type") == req.shot_type:
        score += 0.35
    elif asset_tags.get("shot_type") == "unknown":
        score += 0.10  # unknown gets partial credit, might still work

    # Duration fit
    weights_total += 0.20
    duration = asset_tags.get("duration_seconds")
    if duration is not None:
        if req.min_duration <= duration <= req.max_duration:
            score += 0.20
        elif duration >= req.min_duration * 0.6:
            score += 0.08  # close enough to trim/loop

    # Energy level match
    weights_total += 0.15
    if asset_tags.get("energy_level") == req.energy_level:
        score += 0.15
    elif asset_tags.get("energy_level") == "moderate":
        score += 0.06

    # Face requirement
    weights_total += 0.15
    if req.needs_face:
        if asset_tags.get("has_face"):
            score += 0.15
    else:
        score += 0.15  # no constraint, free points

    # Setting hint (soft)
    weights_total += 0.15
    if req.setting_hint and asset_tags.get("setting") in (req.setting_hint or ""):
        score += 0.15
    elif not req.setting_hint:
        score += 0.10

    return round(score / weights_total, 3) if weights_total else 0.0


# Thresholds — tunable, but start conservative since false "matched" is worse
# than asking the user to confirm a partial match
MATCH_THRESHOLD = 0.75
PARTIAL_THRESHOLD = 0.45


async def match_template_to_library(template: dict, library_assets: list[dict]) -> dict:
    """
    For every video_placeholder/image_placeholder slot in the template, find the best
    scoring asset from the workspace library. Returns an annotated template where
    every slot has a `match` field.

    library_assets: list of {"id", "asset_type", "tags", "storage_key"}
    """
    annotated_slots = []

    for slot in template["slots"]:
        if slot["type"] not in ("video_placeholder", "image_placeholder"):
            annotated_slots.append({**slot, "match": None})
            continue

        req = SlotRequirement(**slot["requirement"])
        wanted_asset_type = "video" if slot["type"] == "video_placeholder" else "image"

        candidates = [a for a in library_assets if a["asset_type"] == wanted_asset_type]
        scored = [
            (a, score_asset_against_requirement(a["tags"], req))
            for a in candidates
        ]
        scored.sort(key=lambda x: x[1], reverse=True)

        if scored and scored[0][1] >= MATCH_THRESHOLD:
            best_asset, best_score = scored[0]
            match = {"status": "matched", "asset_id": best_asset["id"],
                     "score": best_score, "storage_key": best_asset["storage_key"]}
        elif scored and scored[0][1] >= PARTIAL_THRESHOLD:
            best_asset, best_score = scored[0]
            match = {"status": "partial", "asset_id": best_asset["id"],
                     "score": best_score, "storage_key": best_asset["storage_key"]}
        else:
            match = {"status": "missing", "asset_id": None, "score": 0.0, "storage_key": None}

        annotated_slots.append({**slot, "match": match})

    return {**template, "slots": annotated_slots}
```

---

## Generate-on-Click Resolution (Gemini Image/Video Generation)

When a slot is `missing` or the user rejects a `partial` match, they click **Generate**.
This calls Gemini to produce a matching asset directly from the slot's `requirement.description`.

### `backend/app/processors/gap_generator.py`

```python
import os, uuid, base64, io
import google.generativeai as genai
from PIL import Image
from ..config import settings
from ..services.ai_budget import budget
from ..services.storage import storage_sync

genai.configure(api_key=settings.gemini_api_key)


async def generate_missing_image(requirement_description: str, brand_context: dict,
                                  aspect_ratio: str = "9:16") -> bytes:
    """
    Generate a still image to fill a missing image_placeholder slot, using
    Gemini's image generation model, styled to match brand colors/voice.
    """
    model = genai.GenerativeModel("gemini-2.0-flash-exp-image-generation")

    prompt = f"""{requirement_description}.
Style: {brand_context.get('visual_style', 'professional, clean')}.
Color palette to incorporate subtly: {brand_context.get('colors', [])}.
High quality, suitable for a {aspect_ratio} social media video frame."""

    budget.record(0.04)
    response = model.generate_content(prompt)

    # Extract image bytes from response parts
    for part in response.parts:
        if hasattr(part, "inline_data") and part.inline_data:
            return base64.b64decode(part.inline_data.data) if isinstance(part.inline_data.data, str) else part.inline_data.data

    raise RuntimeError("Gemini did not return image data")


async def generate_missing_video_concept(requirement_description: str, brand_context: dict) -> dict:
    """
    For a missing VIDEO slot, true video generation is expensive/slow. Instead:
    1. Generate a representative still image (fast, cheap) via Gemini
    2. Convert it to a short animated video segment (Ken Burns style, reuses
       Module 06's image_url_to_video function)
    This gives the user something usable immediately rather than a multi-minute
    video generation wait, while still being honest that it's a generated stand-in.
    """
    from .imagegen import image_url_to_video  # reuse Module 06

    image_bytes = await generate_missing_image(requirement_description, brand_context, "9:16")

    asset_id = str(uuid.uuid4())
    img_path = os.path.join(settings.temp_dir, f"{asset_id}.png")
    os.makedirs(settings.temp_dir, exist_ok=True)
    with open(img_path, "wb") as f:
        f.write(image_bytes)

    img_key = f"generated/{asset_id}.png"
    storage_sync.put_file(img_key, img_path, "image/png")
    img_url = storage_sync.get_presigned_url(img_key, expires=3600)

    video_path = os.path.join(settings.temp_dir, f"{asset_id}.mp4")
    image_url_to_video(img_url, video_path, duration=4.0, animation="ken_burns")

    video_key = f"generated/{asset_id}.mp4"
    storage_sync.put_file(video_key, video_path, "video/mp4")

    for p in [img_path, video_path]:
        if os.path.exists(p):
            os.remove(p)

    return {
        "asset_id": asset_id,
        "video_key": video_key,
        "thumb_key": img_key,
        "is_generated_standin": True,  # always surfaced to user, never hidden
    }
```

### `backend/app/routers/gap_resolution.py`

```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from ..database import get_db
from ..models.asset_library import LibraryAsset
from ..models.workspace import Workspace
from ..processors.asset_matcher import match_template_to_library
from ..processors.gap_generator import generate_missing_image, generate_missing_video_concept
from ..models.asset_library import LibraryAsset as LA
from ..services.storage import storage_sync

router = APIRouter(prefix="/api/gap-resolution", tags=["gap-resolution"])

class MatchRequest(BaseModel):
    template: dict
    workspace_id: str

class GenerateSlotRequest(BaseModel):
    slot_type: str             # "video_placeholder" | "image_placeholder"
    requirement_description: str
    workspace_id: str
    aspect_ratio: str = "9:16"

@router.post("/match")
async def match(req: MatchRequest, db: AsyncSession = Depends(get_db)):
    """
    Run the matching algorithm and return the template annotated with
    matched/partial/missing status per slot. This is what the UI renders.
    """
    result = await db.execute(
        select(LibraryAsset).where(LibraryAsset.workspace_id == req.workspace_id)
    )
    library = [{
        "id": a.id, "asset_type": a.asset_type,
        "tags": a.tags, "storage_key": a.storage_key,
    } for a in result.scalars().all()]

    annotated = await match_template_to_library(req.template, library)
    return annotated

@router.post("/generate-slot")
async def generate_slot(req: GenerateSlotRequest, db: AsyncSession = Depends(get_db)):
    """
    Generate a missing asset for a single slot. Returns immediately (Gemini image
    gen + Ken Burns conversion takes ~10-15s, acceptable for synchronous UX with
    a loading spinner rather than full job polling).
    """
    ws = await db.get(Workspace, req.workspace_id)
    brand_context = {
        "colors": ws.colors if ws else [],
        "visual_style": ws.brand_voice if ws else "professional",
    }

    if req.slot_type == "image_placeholder":
        image_bytes = await generate_missing_image(req.requirement_description, brand_context, req.aspect_ratio)
        asset_id = str(uuid.uuid4())
        key = f"workspaces/{req.workspace_id}/library/{asset_id}.png"
        await storage_sync.put_object(key, image_bytes, "image/png")

        # Register in library, tagged + marked as generated, so it's reusable next time too
        asset = LA(id=asset_id, workspace_id=req.workspace_id, storage_key=key,
                   asset_type="image", source="ai_generated",
                   tags={"shot_type": "unknown", "description": req.requirement_description,
                         "energy_level": "moderate", "subject_count": 0, "has_face": False,
                         "setting": "unknown", "emotion": "neutral", "dominant_colors": [],
                         "aspect_ratio": req.aspect_ratio, "is_landscape_orientation": False,
                         "has_text_overlay": False, "tagging_confidence": 1.0})
        db.add(asset)
        await db.commit()

        url = storage_sync.get_presigned_url(key)
        return {"asset_id": asset_id, "storage_key": key, "url": url, "type": "image"}

    else:  # video_placeholder
        result = await generate_missing_video_concept(req.requirement_description, brand_context)
        asset = LA(id=result["asset_id"], workspace_id=req.workspace_id,
                   storage_key=result["video_key"], asset_type="video", source="ai_generated",
                   tags={"shot_type": "b_roll", "description": req.requirement_description,
                         "energy_level": "moderate", "subject_count": 0, "has_face": False,
                         "setting": "unknown", "emotion": "neutral", "dominant_colors": [],
                         "aspect_ratio": req.aspect_ratio, "is_landscape_orientation": False,
                         "has_text_overlay": False, "tagging_confidence": 1.0,
                         "duration_seconds": 4.0, "has_spoken_audio": False})
        db.add(asset)
        await db.commit()

        url = storage_sync.get_presigned_url(result["video_key"])
        return {"asset_id": result["asset_id"], "storage_key": result["video_key"],
                "url": url, "type": "video", "is_generated_standin": True}
```

---

## Frontend: The Gap Resolution UI (this is the key UX moment)

### `frontend/components/editor/TemplateGapResolver.tsx`

```tsx
"use client";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

interface SlotMatch {
  status: "matched" | "partial" | "missing";
  asset_id: string | null;
  score: number;
  storage_key: string | null;
}

interface Slot {
  slot_id: string;
  type: string;
  label: string;
  requirement?: { description: string };
  match: SlotMatch | null;
}

interface Props {
  template: { slots: Slot[]; aspect_ratio: string };
  workspaceId: string;
  onSlotResolved: (slotId: string, assetId: string, storageKey: string, url: string) => void;
  onUploadOwn: (slotId: string, file: File) => void;
}

const STATUS_CONFIG = {
  matched: { color: "border-green-300 bg-green-50", icon: "✓", label: "Matched from your library" },
  partial: { color: "border-yellow-300 bg-yellow-50", icon: "~", label: "Best available match" },
  missing: { color: "border-red-300 bg-red-50", icon: "!", label: "Nothing available — generate or upload" },
};

export function TemplateGapResolver({ template, workspaceId, onSlotResolved, onUploadOwn }: Props) {
  const [generating, setGenerating] = useState<string | null>(null);

  const slotsNeedingAssets = template.slots.filter(
    (s) => s.type === "video_placeholder" || s.type === "image_placeholder"
  );

  const generateForSlot = async (slot: Slot) => {
    setGenerating(slot.slot_id);
    const res = await fetch(`${API}/api/gap-resolution/generate-slot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        slot_type: slot.type,
        requirement_description: slot.requirement?.description || slot.label,
        workspace_id: workspaceId,
        aspect_ratio: template.aspect_ratio,
      }),
    });
    const data = await res.json();
    onSlotResolved(slot.slot_id, data.asset_id, data.storage_key, data.url);
    setGenerating(null);
  };

  const missingCount = slotsNeedingAssets.filter((s) => s.match?.status === "missing").length;
  const partialCount = slotsNeedingAssets.filter((s) => s.match?.status === "partial").length;

  return (
    <div className="space-y-3 p-4">
      {(missingCount > 0 || partialCount > 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          {missingCount > 0 && <p>{missingCount} clip{missingCount !== 1 ? "s" : ""} need to be generated or uploaded.</p>}
          {partialCount > 0 && <p>{partialCount} clip{partialCount !== 1 ? "s" : ""} use a best-effort match — review them.</p>}
        </div>
      )}

      {slotsNeedingAssets.map((slot) => {
        const status = slot.match?.status || "missing";
        const config = STATUS_CONFIG[status];

        return (
          <div key={slot.slot_id} className={`border-2 rounded-xl p-4 ${config.color}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{config.icon}</span>
                  <p className="font-medium text-sm">{slot.label}</p>
                </div>
                <p className="text-xs text-gray-500 mb-1">{config.label}</p>
                {slot.requirement && (
                  <p className="text-xs text-gray-400 italic">"{slot.requirement.description}"</p>
                )}
                {status === "partial" && slot.match && (
                  <p className="text-xs text-yellow-700 mt-1">
                    Match confidence: {Math.round(slot.match.score * 100)}%
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {status !== "matched" && (
                  <button
                    onClick={() => generateForSlot(slot)}
                    disabled={generating === slot.slot_id}
                    className="flex items-center gap-1.5 bg-purple-600 text-white text-xs px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    {generating === slot.slot_id ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>✨ Generate with AI</>
                    )}
                  </button>
                )}
                <label className="text-xs border border-gray-300 px-3 py-2 rounded-lg text-center cursor-pointer hover:bg-gray-50">
                  Upload my own
                  <input
                    type="file" accept="video/*,image/*" className="hidden"
                    onChange={(e) => e.target.files?.[0] && onUploadOwn(slot.slot_id, e.target.files[0])}
                  />
                </label>
                {status === "partial" && (
                  <button className="text-xs text-gray-500 underline">
                    Keep this match
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

---

## Why the "is_generated_standin" flag matters

Every AI-generated asset used to fill a gap is permanently flagged
`is_generated_standin: true` (or `source: "ai_generated"` in the library). This is
shown to the user in the final review screen ("3 clips in this video were AI-generated
because matching footage wasn't found") — never hidden. This builds trust and gives
the user the chance to swap in real footage later if they get it.

---

## Checklist for Cursor

- [ ] `backend/app/processors/asset_matcher.py` — scoring algorithm + thresholds
- [ ] `backend/app/processors/gap_generator.py` — Gemini image gen + image-to-video standin
- [ ] `backend/app/routers/gap_resolution.py` — `/match` and `/generate-slot` endpoints
- [ ] `gemini-2.0-flash-exp-image-generation` or current Gemini image model name verified
      against latest Gemini API docs before implementation (model names change)
- [ ] `TemplateGapResolver.tsx` — the core non-editor-facing UI for this phase
- [ ] Every generated asset auto-registered back into `LibraryAsset` so it's reusable
      in future projects, not a one-time throwaway
- [ ] `is_generated_standin` / `source: "ai_generated"` always visible in final review,
      never silently hidden
- [ ] Matching thresholds (`MATCH_THRESHOLD=0.75`, `PARTIAL_THRESHOLD=0.45`) are
      configurable constants — expect to tune these after Phase 8 reliability testing
- [ ] No slot is ever auto-filled with a `missing`-status asset — the user must click
      either Generate or Upload; this is the explicit fix for the original bug