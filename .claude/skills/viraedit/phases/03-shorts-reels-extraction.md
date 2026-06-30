# Phase 3 — Shorts/Reels Extraction (Platform-Correct, One-Click Download)

## What this phase delivers

User uploads one long video. Clicks one button per platform (or "all platforms").
Gets back finished, correctly-sized, correctly-captioned clips ready to download
and upload directly to TikTok, Instagram, YouTube, or Facebook. No editing required,
no aspect ratio math, no manual cropping.

This reuses Module 08 (Smart Clips) and Module 07 (Reframe) from the original skill
set as the underlying engine — this phase is about making it a dedicated, simple,
platform-first feature rather than a generic "smart clips" tool buried in the editor.

---

## Platform Specs (the system handles all of this — user never sees these numbers)

| Platform | Aspect | Resolution | Max Duration | Notes |
|---|---|---|---|---|
| TikTok | 9:16 | 1080×1920 | 10 min (short-form sweet spot: 15-60s) | Fast hook required |
| Instagram Reels | 9:16 | 1080×1920 | 90s | |
| YouTube Shorts | 9:16 | 1080×1920 | 60s | Must be ≤60s to count as a Short |
| Facebook Reels | 9:16 | 1080×1920 | 90s | |
| Facebook Feed | 1:1 or 4:5 | 1080×1080 / 1080×1350 | flexible | offered as alt option |

---

## Files to Create

### `backend/app/processors/shorts_extractor.py`

```python
import os
from .clip_finder import find_viral_moments  # reuses Phase/Module 08 logic
from .text_editor import apply_cuts, _get_duration
from .caption_renderer import render_captions
from .reframer import reframe_video, export_for_platform
from ..config import settings

PLATFORM_DURATION_LIMITS = {
    "tiktok": 60,
    "instagram_reels": 90,
    "youtube_shorts": 60,
    "facebook_reels": 90,
}


async def extract_shorts_for_platforms(
    video_path: str,
    transcript: dict,
    platforms: list[str],
    work_dir: str,
    max_clips: int = 5,
) -> dict:
    """
    Single pipeline: find best moments once, then export a correctly-sized,
    correctly-capped-duration version for EACH requested platform.
    Returns: {platform: [clip_result, ...]}
    """
    # Use the tightest duration limit across requested platforms so one set of
    # cuts works for all of them (avoids re-analyzing per platform)
    tightest_limit = min(PLATFORM_DURATION_LIMITS.get(p, 60) for p in platforms)

    candidates = await find_viral_moments(
        transcript, max_clips=max_clips, target_duration=tightest_limit,
        content_type="general",
    )

    results = {p: [] for p in platforms}
    total_duration = _get_duration(video_path)

    for i, cand in enumerate(candidates):
        clip_dir = os.path.join(work_dir, f"clip_{i}")
        os.makedirs(clip_dir, exist_ok=True)
        base_clip_path = os.path.join(clip_dir, "base.mp4")

        cuts = []
        if cand["start"] > 0.1:
            cuts.append({"start": 0, "end": cand["start"]})
        if cand["end"] < total_duration - 0.1:
            cuts.append({"start": cand["end"], "end": total_duration})
        apply_cuts(video_path, base_clip_path, cuts)

        # Caption once at base resolution
        captioned_path = os.path.join(clip_dir, "captioned.mp4")
        offset = cand["start"]
        clip_words = [
            {**w, "start": round(w["start"] - offset, 3), "end": round(w["end"] - offset, 3)}
            for w in transcript["words"]
            if w["start"] >= cand["start"] and w["end"] <= cand["end"] + 0.5
        ]
        style = cand.get("suggested_caption_style", "hormozi")
        if clip_words:
            render_captions(base_clip_path, captioned_path, clip_words, style=style)
        else:
            captioned_path = base_clip_path

        # Reframe once to 9:16 (shared by all vertical platforms)
        reframed_path = os.path.join(clip_dir, "reframed_9x16.mp4")
        reframe_video(captioned_path, reframed_path, 1080, 1920, mode="face_track")

        # Export per platform from the shared reframed master
        for platform in platforms:
            out_path = os.path.join(clip_dir, f"export_{platform}.mp4")
            export_for_platform(reframed_path, out_path, platform)
            results[platform].append({
                "clip_index": i,
                "title": cand["title"],
                "score": cand["score"],
                "duration": round(cand["end"] - cand["start"], 2),
                "local_path": out_path,
            })

    return results
```

### `backend/app/tasks/shorts_tasks.py`

```python
import os, asyncio, shutil
from .celery_app import celery_app
from ..processors.transcriber import transcribe_video
from ..processors.shorts_extractor import extract_shorts_for_platforms
from ..services.storage import storage_sync
from ..models.job import update_job_sync
from ..config import settings

@celery_app.task(bind=True, time_limit=1800)
def extract_shorts_task(self, job_id: str, video_key: str, project_id: str,
                         platforms: list, max_clips: int = 5):
    def progress(step, **kw):
        update_job_sync(job_id, status="processing", result={"step": step, **kw})

    try:
        progress("downloading")
        local_path = storage_sync.download_to_temp(video_key, job_id)

        progress("transcribing")
        transcript = asyncio.run(transcribe_video(local_path))

        progress("finding_and_cutting_moments")
        work_dir = os.path.join(settings.temp_dir, job_id, "shorts_work")
        os.makedirs(work_dir, exist_ok=True)

        results = asyncio.run(extract_shorts_for_platforms(
            local_path, transcript, platforms, work_dir, max_clips
        ))

        progress("uploading_results")
        output = {}
        for platform, clips in results.items():
            output[platform] = []
            for clip in clips:
                clip_id = f"{job_id}_{platform}_{clip['clip_index']}"
                key = f"projects/{project_id}/shorts/{platform}/{clip_id}.mp4"
                storage_sync.put_file(key, clip["local_path"], "video/mp4")
                url = storage_sync.get_presigned_url(key, expires=86400)
                output[platform].append({
                    "key": key, "url": url, "title": clip["title"],
                    "score": clip["score"], "duration": clip["duration"],
                })

        update_job_sync(job_id, status="done", result={"shorts": output})
        shutil.rmtree(work_dir, ignore_errors=True)
        if os.path.exists(local_path):
            os.remove(local_path)

    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
```

### `backend/app/routers/shorts.py`

```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List
from ..database import get_db
from ..models.job import Job
from ..tasks.shorts_tasks import extract_shorts_task

router = APIRouter(prefix="/api/shorts", tags=["shorts"])

class ExtractShortsRequest(BaseModel):
    video_key: str
    project_id: str
    platforms: List[str]  # ["tiktok", "instagram_reels", "youtube_shorts", "facebook_reels"]
    max_clips: int = 5

@router.post("/extract")
async def extract(req: ExtractShortsRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="EXTRACT_SHORTS", status="queued", project_id=req.project_id)
    db.add(job)
    await db.commit()
    extract_shorts_task.delay(job_id, req.video_key, req.project_id, req.platforms, req.max_clips)
    return {"job_id": job_id}
```

---

## Frontend: Dead-Simple Platform Picker

### `frontend/components/shorts/PlatformShortsExtractor.tsx`

```tsx
"use client";
import { useState } from "react";
import { useJobPoller } from "@/hooks/useJobPoller";

const API = process.env.NEXT_PUBLIC_API_URL;

const PLATFORMS = [
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "instagram_reels", label: "Instagram", icon: "📸" },
  { id: "youtube_shorts", label: "YouTube Shorts", icon: "▶️" },
  { id: "facebook_reels", label: "Facebook", icon: "👍" },
];

const STEP_LABELS: Record<string, string> = {
  downloading: "Loading your video...",
  transcribing: "Listening to what's said...",
  finding_and_cutting_moments: "Finding the best moments...",
  uploading_results: "Almost ready...",
};

export function PlatformShortsExtractor({ videoKey, projectId }: { videoKey: string; projectId: string }) {
  const [selected, setSelected] = useState<string[]>(["tiktok", "instagram_reels"]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any[]> | null>(null);

  const { status, progress } = useJobPoller(jobId, (result) => {
    if (result?.shorts) setResults(result.shorts);
  });

  const start = async () => {
    setResults(null);
    const res = await fetch(`${API}/api/shorts/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify({ video_key: videoKey, project_id: projectId, platforms: selected, max_clips: 5 }),
    });
    const { job_id } = await res.json();
    setJobId(job_id);
  };

  const downloadAll = (platform: string) => {
    results?.[platform]?.forEach((clip, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = clip.url;
        a.download = `${platform}_${clip.title}.mp4`;
        a.click();
      }, i * 300); // stagger downloads slightly
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Get shorts for your platforms</h2>
        <p className="text-sm text-gray-500">Pick where you want to post — we'll size and caption each one correctly.</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected((s) => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])}
            className={`flex flex-col items-center gap-1 py-4 rounded-xl border-2 transition-all
              ${selected.includes(p.id) ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
          >
            <span className="text-2xl">{p.icon}</span>
            <span className="text-xs font-medium">{p.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={start}
        disabled={!selected.length || status === "processing"}
        className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
      >
        {status === "processing" ? "Working on it..." : `Get my ${selected.length > 1 ? 'shorts' : 'short'}`}
      </button>

      {status === "processing" && (
        <div className="text-center space-y-2 py-6">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-600">{STEP_LABELS[progress?.step] || "Working..."}</p>
        </div>
      )}

      {results && (
        <div className="space-y-6">
          {Object.entries(results).map(([platform, clips]) => (
            <div key={platform} className="border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-sm">
                  {PLATFORMS.find(p => p.id === platform)?.icon} {PLATFORMS.find(p => p.id === platform)?.label}
                </h3>
                <button onClick={() => downloadAll(platform)} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg">
                  Download all ({clips.length})
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {clips.map((clip: any, i: number) => (
                  <div key={i} className="space-y-1">
                    <video src={clip.url} className="w-full rounded-lg" style={{ aspectRatio: "9/16" }} controls />
                    <p className="text-xs text-gray-500 truncate">{clip.title}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Checklist for Cursor

- [ ] `backend/app/processors/shorts_extractor.py` — shared-cut, multi-export pipeline
- [ ] `backend/app/tasks/shorts_tasks.py` — `extract_shorts_task` Celery task
- [ ] `backend/app/routers/shorts.py` — single `/extract` endpoint
- [ ] Reuses `find_viral_moments` (Module 08), `apply_cuts`/`reframe_video` (Modules 04/07)
      rather than duplicating logic — confirm these functions are importable as-is
- [ ] One reframe pass shared across all vertical platforms (efficiency — don't
      re-run face-tracking 4 times for 4 platforms)
- [ ] `PlatformShortsExtractor.tsx` — platform checkboxes, single button, per-platform
      download-all action
- [ ] Presigned URLs set to 24hr expiry for all output clips
- [ ] No mention of "aspect ratio", "9:16", or technical terms anywhere in the
      user-facing UI — only platform names and icons