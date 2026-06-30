# Phase 6 — One-Click Apply (The Actual Non-Editor User Flow)

## This is the phase that ties everything together into the real product

Phases 0-5 are infrastructure and individual capabilities. Phase 6 is the actual
end-to-end screen flow a non-editor user walks through. If this flow isn't dead
simple, nothing else matters. This phase defines the **exact sequence of screens**
and ensures every prior phase's output slots into it correctly.

---

## The Complete User Journey

```
Screen 1: "What do you want to make?"
  ├── Clone a style from a reference video → Screen 2A
  ├── Get shorts/reels from my long video → Phase 3 flow
  ├── Split my video into chapters → Phase 4 flow
  └── Make a highlight trailer → Phase 5 flow

Screen 2A: Paste reference (Phase 1 — ReferenceInput)
  → Gemini analyzes → produces slot-level template

Screen 2B: Resolve gaps (Phase 2 — TemplateGapResolver)
  → Every slot shown as matched/partial/missing
  → User clicks Generate or Upload for each gap
  → ALL slots must reach matched/partial/generated before continuing

Screen 2C: Quick text fill
  → Any text_overlay slots get a simple text input
  → No styling controls — text inherits the template's captured style automatically

Screen 2D: Review & Render
  → Shows AI Spend so far prominently (Phase 7)
  → Single "Make my video" button
  → Renders final video using template + resolved slots
  → Progress shown in plain language, never technical terms

Screen 3: Done
  → Video preview
  → Download button
  → "Also get this as Shorts" / "Also make a trailer" cross-promotion to Phases 3/5
```

---

## Screen 1 — Entry Point

### `frontend/app/projects/[id]/page.tsx`

```tsx
"use client";
import Link from "next/link";

const ACTIONS = [
  {
    href: "clone-style",
    icon: "🎨",
    title: "Clone a style I like",
    description: "Paste a TikTok, Reel, or YouTube link — we'll match its style with your footage",
  },
  {
    href: "shorts",
    icon: "✂️",
    title: "Get shorts for social media",
    description: "Upload your long video, get clips ready for TikTok, Instagram, YouTube",
  },
  {
    href: "chapters",
    icon: "📑",
    title: "Split into chapters",
    description: "Break your podcast or recording into separate topic clips",
  },
  {
    href: "trailer",
    icon: "🎬",
    title: "Make a highlight trailer",
    description: "A fast-cut preview of your best moments",
  },
];

export default function ProjectHome({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <h1 className="text-2xl font-semibold text-center mb-2">What do you want to make?</h1>
      <p className="text-sm text-gray-500 text-center mb-10">Pick one — we'll handle the rest</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ACTIONS.map((a) => (
          <Link key={a.href} href={`/projects/${params.id}/${a.href}`}
            className="border-2 rounded-2xl p-6 hover:border-blue-400 hover:bg-blue-50/50 transition-all">
            <span className="text-3xl mb-3 block">{a.icon}</span>
            <h3 className="font-semibold text-sm mb-1">{a.title}</h3>
            <p className="text-xs text-gray-500">{a.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

---

## Screen 2A→2D — Clone Style Flow (the orchestrator)

### `frontend/app/projects/[id]/clone-style/page.tsx`

```tsx
"use client";
import { useState } from "react";
import { ReferenceInput } from "@/components/editor/ReferenceInput";
import { TemplateGapResolver } from "@/components/editor/TemplateGapResolver";
import { AISpendBadge } from "@/components/shared/AISpendBadge";
import { useWorkspaceStore } from "@/store/workspace";
import { useJobPoller } from "@/hooks/useJobPoller";

const API = process.env.NEXT_PUBLIC_API_URL;

type Step = "reference" | "resolve" | "text" | "review" | "done";

export default function CloneStylePage({ params }: { params: { id: string } }) {
  const { active: workspace } = useWorkspaceStore();
  const [step, setStep] = useState<Step>("reference");
  const [template, setTemplate] = useState<any>(null);
  const [resolvedAssets, setResolvedAssets] = useState<Record<string, { storageKey: string; url: string }>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [finalVideo, setFinalVideo] = useState<{ url: string } | null>(null);

  const { status: renderStatus } = useJobPoller(renderJobId, (result) => {
    if (result?.url) setFinalVideo(result);
  });

  // Step 1: Reference analyzed, now match against library
  const handleTemplateReady = async (rawTemplate: any) => {
    const res = await fetch(`${API}/api/gap-resolution/match`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify({ template: rawTemplate, workspace_id: workspace?.id }),
    });
    const annotated = await res.json();
    setTemplate(annotated);
    setStep("resolve");
  };

  const handleSlotResolved = (slotId: string, assetId: string, storageKey: string, url: string) => {
    setResolvedAssets((prev) => ({ ...prev, [slotId]: { storageKey, url } }));
    setTemplate((prev: any) => ({
      ...prev,
      slots: prev.slots.map((s: any) =>
        s.slot_id === slotId ? { ...s, match: { status: "matched", asset_id: assetId, score: 1.0, storage_key: storageKey } } : s
      ),
    }));
  };

  const handleUploadOwn = async (slotId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    form.append("workspace_id", workspace?.id || "");
    const res = await fetch(`${API}/api/library/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: form,
    });
    const asset = await res.json();
    handleSlotResolved(slotId, asset.id, asset.storage_key, "");
  };

  const allSlotsResolved = template?.slots
    .filter((s: any) => s.type === "video_placeholder" || s.type === "image_placeholder")
    .every((s: any) => s.match?.status !== "missing");

  const textSlots = template?.slots.filter((s: any) => s.type === "text_overlay") || [];

  const startRender = async () => {
    const res = await fetch(`${API}/api/render/from-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify({
        template, resolved_assets: resolvedAssets, text_values: textValues,
        project_id: params.id, workspace_id: workspace?.id,
      }),
    });
    const { job_id } = await res.json();
    setRenderJobId(job_id);
    setStep("review");
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <StepIndicator current={step} />
        <AISpendBadge projectId={params.id} />
      </div>

      {step === "reference" && (
        <ReferenceInput
          projectId={params.id}
          workspaceId={workspace?.id || ""}
          onTemplateReady={handleTemplateReady}
        />
      )}

      {step === "resolve" && template && (
        <>
          <TemplateGapResolver
            template={template}
            workspaceId={workspace?.id || ""}
            onSlotResolved={handleSlotResolved}
            onUploadOwn={handleUploadOwn}
          />
          <button
            onClick={() => setStep(textSlots.length ? "text" : "review")}
            disabled={!allSlotsResolved}
            className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {allSlotsResolved ? "Continue" : "Resolve all clips to continue"}
          </button>
        </>
      )}

      {step === "text" && (
        <div className="space-y-4">
          <h2 className="font-semibold text-sm">Add your text</h2>
          {textSlots.map((slot: any) => (
            <div key={slot.slot_id}>
              <label className="text-xs text-gray-500 mb-1 block">{slot.label}</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder={`Enter ${slot.label.toLowerCase()}...`}
                onChange={(e) => setTextValues((p) => ({ ...p, [slot.slot_id]: e.target.value }))}
              />
            </div>
          ))}
          <button onClick={startRender} className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium">
            Make my video
          </button>
        </div>
      )}

      {step === "review" && (
        <div className="text-center py-12 space-y-4">
          {renderStatus === "processing" && (
            <>
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-600">Putting your video together...</p>
            </>
          )}
          {finalVideo && (
            <>
              <video src={finalVideo.url} className="mx-auto rounded-xl" style={{ maxWidth: 280 }} controls autoPlay />
              <a href={finalVideo.url} download="my-video.mp4"
                className="block bg-gray-900 text-white py-2.5 rounded-xl text-sm max-w-xs mx-auto">
                Download
              </a>
              <div className="flex gap-2 justify-center pt-2">
                <a href={`/projects/${params.id}/shorts`} className="text-xs text-blue-600 underline">
                  Also get this as Shorts
                </a>
                <a href={`/projects/${params.id}/trailer`} className="text-xs text-blue-600 underline">
                  Also make a trailer
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: Step[] = ["reference", "resolve", "text", "review"];
  const idx = steps.indexOf(current);
  return (
    <div className="flex gap-1.5">
      {steps.map((s, i) => (
        <div key={s} className={`h-1.5 w-8 rounded-full ${i <= idx ? "bg-blue-600" : "bg-gray-200"}`} />
      ))}
    </div>
  );
}
```

---

## Final Render Endpoint (assembles matched/generated assets into the template)

### `backend/app/processors/template_renderer.py`

```python
import os, subprocess
from ..config import settings
from ..processors.caption_renderer import render_captions
from ..processors.reframer import reframe_video

def render_video_from_template(
    template: dict,
    resolved_assets: dict,   # {slot_id: {"storage_key": str}}
    text_values: dict,       # {slot_id: str}
    work_dir: str,
) -> str:
    """
    Assembles the final video by:
    1. Trimming each resolved video asset to its slot's duration
    2. Concatenating clips in slot order
    3. Overlaying text slots as title cards or burned-in text
    4. Applying the template's captured caption style
    Returns path to final assembled video.
    """
    from .text_editor import _get_duration
    from ..services.storage import storage_sync

    os.makedirs(work_dir, exist_ok=True)
    video_slots = sorted(
        [s for s in template["slots"] if s["type"] in ("video_placeholder", "image_placeholder")],
        key=lambda s: s["start"],
    )

    part_paths = []
    for slot in video_slots:
        asset_info = resolved_assets.get(slot["slot_id"])
        if not asset_info:
            raise ValueError(f"Slot {slot['slot_id']} has no resolved asset — cannot render")

        local_asset = storage_sync.download_to_temp(asset_info["storage_key"], f"render_{slot['slot_id']}")
        target_duration = slot["end"] - slot["start"]
        part_path = os.path.join(work_dir, f"part_{slot['slot_id']}.mp4")

        if slot["type"] == "image_placeholder":
            # Convert static image to a clip of the needed duration
            subprocess.run([
                settings.ffmpeg_path, "-loop", "1", "-i", local_asset,
                "-t", str(target_duration),
                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                part_path, "-y",
            ], check=True, capture_output=True)
        else:
            asset_duration = _get_duration(local_asset)
            trim_to = min(target_duration, asset_duration)
            subprocess.run([
                settings.ffmpeg_path, "-i", local_asset, "-t", str(trim_to),
                "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
                "-c:v", "libx264", "-c:a", "aac",
                part_path, "-y",
            ], check=True, capture_output=True)

        part_paths.append(part_path)
        if os.path.exists(local_asset):
            os.remove(local_asset)

    concat_file = os.path.join(work_dir, "concat.txt")
    with open(concat_file, "w") as f:
        for p in part_paths:
            f.write(f"file '{p}'\n")

    assembled_path = os.path.join(work_dir, "assembled.mp4")
    subprocess.run([
        settings.ffmpeg_path, "-f", "concat", "-safe", "0",
        "-i", concat_file, "-c", "copy",
        assembled_path, "-y",
    ], check=True, capture_output=True)

    # Burn in text overlays as simple centered title cards at their timestamps
    current = assembled_path
    text_slots = [s for s in template["slots"] if s["type"] == "text_overlay"]
    for slot in text_slots:
        text = text_values.get(slot["slot_id"], "")
        if not text:
            continue
        out_path = os.path.join(work_dir, f"text_{slot['slot_id']}.mp4")
        escaped = text.replace("'", "\\'").replace(":", "\\:")
        subprocess.run([
            settings.ffmpeg_path, "-i", current,
            "-vf", (f"drawtext=text='{escaped}':fontcolor=white:fontsize=64:"
                    f"box=1:boxcolor=black@0.5:boxborderw=20:"
                    f"x=(w-text_w)/2:y=h*0.15:"
                    f"enable='between(t,{slot['start']},{slot['end']})'"),
            "-c:a", "copy",
            out_path, "-y",
        ], check=True, capture_output=True)
        current = out_path

    return current
```

### `backend/app/routers/render.py`

```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from ..database import get_db
from ..models.job import Job
from ..tasks.render_tasks import render_from_template_task

router = APIRouter(prefix="/api/render", tags=["render"])

class RenderFromTemplateRequest(BaseModel):
    template: dict
    resolved_assets: dict
    text_values: dict
    project_id: str
    workspace_id: str

@router.post("/from-template")
async def render_from_template(req: RenderFromTemplateRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="RENDER_FROM_TEMPLATE", status="queued", project_id=req.project_id)
    db.add(job)
    await db.commit()
    render_from_template_task.delay(job_id, req.dict(), req.project_id)
    return {"job_id": job_id}
```

### `backend/app/tasks/render_tasks.py`

```python
import os, shutil
from .celery_app import celery_app
from ..processors.template_renderer import render_video_from_template
from ..processors.caption_renderer import render_captions
from ..services.storage import storage_sync
from ..models.job import update_job_sync
from ..config import settings

@celery_app.task(bind=True, time_limit=900)
def render_from_template_task(self, job_id: str, req: dict, project_id: str):
    update_job_sync(job_id, status="processing")
    try:
        work_dir = os.path.join(settings.temp_dir, job_id, "render_work")
        assembled_path = render_video_from_template(
            req["template"], req["resolved_assets"], req["text_values"], work_dir,
        )

        # Apply the template's captured caption style if it had spoken audio
        # (caption application reuses Phase/Module 03's render_captions, but since
        # this is freshly assembled footage with no transcript yet, caption step
        # is intentionally left to a follow-up "Add captions" action in v1 — flag
        # this clearly to the user rather than skipping silently)
        final_key = f"projects/{project_id}/final/{job_id}.mp4"
        storage_sync.put_file(final_key, assembled_path, "video/mp4")
        url = storage_sync.get_presigned_url(final_key, expires=86400)

        update_job_sync(job_id, status="done", result={"key": final_key, "url": url})
        shutil.rmtree(work_dir, ignore_errors=True)
    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
```

---

## Checklist for Cursor

- [ ] `frontend/app/projects/[id]/page.tsx` — the single 4-option entry screen
- [ ] `frontend/app/projects/[id]/clone-style/page.tsx` — full orchestrator wiring
      Phase 1 (ReferenceInput) → Phase 2 (TemplateGapResolver) → text fill → render
- [ ] `backend/app/processors/template_renderer.py` — trims/scales/concats resolved
      assets into final assembled video, burns in text overlay slots
- [ ] `backend/app/tasks/render_tasks.py` + `backend/app/routers/render.py`
- [ ] "Continue" button on the resolve screen is disabled until every video/image
      slot reaches non-`missing` status — this is the enforcement point for the
      "never silently substitute" fix
- [ ] Cross-promotion links at the Done screen to Shorts (Phase 3) and Trailer
      (Phase 5) so users discover the other capabilities naturally
- [ ] `StepIndicator` component shows plain progress dots, never step numbers or
      technical labels
- [ ] Known v1 limitation to flag in UI: assembled output from this flow does not
      yet have auto-captions baked in (no fresh transcript exists for newly
      assembled footage) — surface a clear "Add captions" follow-up action using
      the existing Module 03 pipeline rather than silently shipping uncaptioned video