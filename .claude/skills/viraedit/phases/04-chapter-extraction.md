# Phase 4 — Chapter Extraction (Standalone Downloadable Chapter Clips)

## What this phase delivers

User uploads a long video (podcast episode, webinar, recorded consultation). The
system detects natural topic/chapter boundaries and cuts the entire video into
separate, standalone, fully-captioned clips — one per chapter — each independently
downloadable. This is different from Shorts (Phase 3): chapters preserve full
chapter length (could be 3-15 minutes each), not trimmed to short-form duration.

Use case: a 90-minute podcast becomes 6 separate 12-15 minute chapter videos, each
postable on its own (YouTube chapter-style uploads, or standalone topic clips).

---

## Detection Approach

Two-tier detection for reliability:

1. **Primary — GPT-4o-mini semantic chapter detection** (reused from Module 08's
   `detect_chapters`, but made more rigorous): analyzes the full transcript for topic
   shifts, not just pauses.
2. **Fallback — rule-based pause detection**: if the LLM call fails or budget is
   exhausted, fall back to silence-gap + sentence-boundary heuristic (already exists
   in the original Module 08 `detect_chapters` rule-based version).

Both tiers produce the same output shape so downstream cutting logic doesn't care
which one ran.

---

## Files to Create

### `backend/app/processors/chapter_detector.py`

```python
import json
from openai import AsyncOpenAI
from ..config import settings
from ..services.ai_budget import budget

client = AsyncOpenAI(api_key=settings.openai_api_key)


async def detect_chapters_semantic(transcript: dict, min_chapter_duration: float = 60.0) -> list:
    """
    Primary chapter detection: GPT-4o-mini reads the full transcript and identifies
    genuine topic/section boundaries, not just pauses.
    Returns: [{"start": float, "end": float, "title": str, "summary": str}]
    """
    segments_text = "\n".join(
        f"[{seg['start']:.1f}s] {seg['text']}"
        for seg in transcript["segments"]
    )

    prompt = f"""You are analyzing a podcast/recording transcript to split it into
logical CHAPTERS for separate publishing. Each chapter should be a coherent topic
or segment that makes sense as a standalone video, at least {min_chapter_duration:.0f}
seconds long.

Return ONLY valid JSON array, no markdown:
[
  {{
    "start": 0.0,
    "end": 245.3,
    "title": "Short descriptive chapter title (max 8 words)",
    "summary": "One sentence describing what's covered in this chapter"
  }}
]

Rules:
- Chapters must be sequential and non-overlapping, covering the entire transcript
- Merge short topic shifts into the surrounding chapter if they'd be under {min_chapter_duration:.0f}s
- Title should work as a standalone video title someone would click on

Transcript:
{segments_text[:10000]}"""

    estimated_cost = (len(prompt) / 4 / 1000) * 0.00015
    budget.record(estimated_cost)

    if budget.should_use_local():
        return None  # signal caller to use fallback

    resp = await client.chat.completions.create(
        model=settings.openai_model_primary,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=1500,
    )
    raw = resp.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:-1])

    chapters = json.loads(raw)
    max_time = transcript["segments"][-1]["end"] if transcript["segments"] else 0
    return [c for c in chapters if c["end"] <= max_time + 1 and c["end"] > c["start"]]


def detect_chapters_fallback(transcript: dict, min_chapter_duration: float = 60.0) -> list:
    """
    Rule-based fallback: chapter breaks at pauses > 2s following sentence-ending
    punctuation, merging anything shorter than min_chapter_duration into neighbors.
    """
    segments = transcript.get("segments", [])
    if not segments:
        return []

    raw_chapters = []
    current_start = segments[0]["start"]
    current_words = []

    for i, seg in enumerate(segments):
        current_words.append(seg["text"])
        gap_to_next = (segments[i + 1]["start"] - seg["end"]) if i < len(segments) - 1 else 999
        is_sentence_end = seg["text"].rstrip().endswith((".", "?", "!", "।"))

        if gap_to_next > 2.0 and is_sentence_end:
            raw_chapters.append({
                "start": current_start, "end": seg["end"],
                "title": f"Part {len(raw_chapters) + 1}",
                "summary": " ".join(current_words)[:120],
            })
            current_start = segments[i + 1]["start"] if i < len(segments) - 1 else seg["end"]
            current_words = []

    if current_words and segments:
        raw_chapters.append({
            "start": current_start, "end": segments[-1]["end"],
            "title": f"Part {len(raw_chapters) + 1}",
            "summary": " ".join(current_words)[:120],
        })

    # Merge chapters shorter than min_chapter_duration into the next one
    merged = []
    buffer = None
    for ch in raw_chapters:
        if buffer is None:
            buffer = ch
        elif buffer["end"] - buffer["start"] < min_chapter_duration:
            buffer["end"] = ch["end"]
            buffer["summary"] += " " + ch["summary"]
        else:
            merged.append(buffer)
            buffer = ch
    if buffer:
        merged.append(buffer)

    return merged


async def detect_chapters(transcript: dict, min_chapter_duration: float = 60.0) -> list:
    """Entry point: try semantic detection, fall back to rule-based on failure or budget cap."""
    try:
        result = await detect_chapters_semantic(transcript, min_chapter_duration)
        if result:
            return result
    except Exception:
        pass
    return detect_chapters_fallback(transcript, min_chapter_duration)
```

### `backend/app/tasks/chapter_tasks.py`

```python
import os, asyncio, shutil
from .celery_app import celery_app
from ..processors.transcriber import transcribe_video
from ..processors.chapter_detector import detect_chapters
from ..processors.text_editor import apply_cuts, _get_duration
from ..processors.caption_renderer import render_captions
from ..services.storage import storage_sync
from ..models.job import update_job_sync
from ..config import settings

@celery_app.task(bind=True, time_limit=2400)  # chapters from long videos can take a while
def extract_chapters_task(self, job_id: str, video_key: str, project_id: str,
                          min_chapter_duration: float = 60.0, caption_style: str = "minimal"):
    def progress(step, **kw):
        update_job_sync(job_id, status="processing", result={"step": step, **kw})

    try:
        progress("downloading")
        local_path = storage_sync.download_to_temp(video_key, job_id)

        progress("transcribing")
        transcript = asyncio.run(transcribe_video(local_path))

        progress("detecting_chapters")
        chapters = asyncio.run(detect_chapters(transcript, min_chapter_duration))

        total_duration = _get_duration(local_path)
        output_chapters = []
        work_dir = os.path.join(settings.temp_dir, job_id, "chapters_work")
        os.makedirs(work_dir, exist_ok=True)

        for i, ch in enumerate(chapters):
            progress("cutting_chapter", done=i, total=len(chapters))
            chapter_dir = os.path.join(work_dir, f"ch_{i}")
            os.makedirs(chapter_dir, exist_ok=True)

            raw_path = os.path.join(chapter_dir, "raw.mp4")
            cuts = []
            if ch["start"] > 0.1:
                cuts.append({"start": 0, "end": ch["start"]})
            if ch["end"] < total_duration - 0.1:
                cuts.append({"start": ch["end"], "end": total_duration})
            apply_cuts(local_path, raw_path, cuts)

            # Caption the full chapter (reuse global word timestamps, offset to chapter start)
            captioned_path = os.path.join(chapter_dir, "captioned.mp4")
            offset = ch["start"]
            chapter_words = [
                {**w, "start": round(w["start"] - offset, 3), "end": round(w["end"] - offset, 3)}
                for w in transcript["words"]
                if w["start"] >= ch["start"] and w["end"] <= ch["end"] + 0.5
            ]
            final_path = raw_path
            if chapter_words:
                render_captions(raw_path, captioned_path, chapter_words, style=caption_style)
                final_path = captioned_path

            chapter_key = f"projects/{project_id}/chapters/{job_id}_ch{i}.mp4"
            storage_sync.put_file(chapter_key, final_path, "video/mp4")
            url = storage_sync.get_presigned_url(chapter_key, expires=86400)

            output_chapters.append({
                "index": i, "title": ch["title"], "summary": ch["summary"],
                "start": ch["start"], "end": ch["end"],
                "duration": round(ch["end"] - ch["start"], 2),
                "key": chapter_key, "url": url,
            })

        update_job_sync(job_id, status="done", result={"chapters": output_chapters})
        shutil.rmtree(work_dir, ignore_errors=True)
        if os.path.exists(local_path):
            os.remove(local_path)

    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
```

### `backend/app/routers/chapters.py`

```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from ..database import get_db
from ..models.job import Job
from ..tasks.chapter_tasks import extract_chapters_task

router = APIRouter(prefix="/api/chapters", tags=["chapters"])

class ExtractChaptersRequest(BaseModel):
    video_key: str
    project_id: str
    min_chapter_duration: float = 60.0
    caption_style: str = "minimal"

@router.post("/extract")
async def extract(req: ExtractChaptersRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="EXTRACT_CHAPTERS", status="queued", project_id=req.project_id)
    db.add(job)
    await db.commit()
    extract_chapters_task.delay(job_id, req.video_key, req.project_id,
                                req.min_chapter_duration, req.caption_style)
    return {"job_id": job_id}
```

---

## Frontend: Chapter List with Download

### `frontend/components/chapters/ChapterExtractor.tsx`

```tsx
"use client";
import { useState } from "react";
import { useJobPoller } from "@/hooks/useJobPoller";

const API = process.env.NEXT_PUBLIC_API_URL;

interface Chapter {
  index: number; title: string; summary: string;
  duration: number; url: string;
}

export function ChapterExtractor({ videoKey, projectId }: { videoKey: string; projectId: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const { status, progress } = useJobPoller(jobId, (result) => {
    if (result?.chapters) setChapters(result.chapters);
  });

  const start = async () => {
    setChapters([]);
    const res = await fetch(`${API}/api/chapters/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify({ video_key: videoKey, project_id: projectId }),
    });
    const { job_id } = await res.json();
    setJobId(job_id);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Split into chapters</h2>
        <p className="text-sm text-gray-500">
          We'll find the natural topic breaks in your video and give you a separate,
          ready-to-post clip for each one.
        </p>
      </div>

      <button
        onClick={start}
        disabled={status === "processing"}
        className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50"
      >
        {status === "processing" ? "Working on it..." : "Find my chapters"}
      </button>

      {status === "processing" && (
        <div className="text-center py-6 space-y-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-600">
            {progress?.step === "cutting_chapter"
              ? `Cutting chapter ${progress.done + 1} of ${progress.total}...`
              : "Listening and finding topic breaks..."}
          </p>
        </div>
      )}

      {chapters.length > 0 && (
        <div className="space-y-3">
          {chapters.map((ch) => (
            <div key={ch.index} className="border rounded-xl p-4 flex items-center gap-4">
              <video src={ch.url} className="w-24 rounded-lg flex-shrink-0" style={{ aspectRatio: "16/9" }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{ch.title}</p>
                <p className="text-xs text-gray-500 line-clamp-1">{ch.summary}</p>
                <p className="text-xs text-gray-400">{Math.round(ch.duration / 60)} min</p>
              </div>
              <a
                href={ch.url} download={`${ch.title}.mp4`}
                className="text-xs bg-gray-900 text-white px-3 py-2 rounded-lg flex-shrink-0"
              >
                Download
              </a>
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

- [ ] `backend/app/processors/chapter_detector.py` — semantic + fallback detection,
      single `detect_chapters` entry point that tries semantic first
- [ ] `backend/app/tasks/chapter_tasks.py` — `extract_chapters_task` with progress steps
- [ ] `backend/app/routers/chapters.py` — `/extract` endpoint
- [ ] `ChapterExtractor.tsx` — single button, progress, per-chapter download
- [ ] `time_limit=2400` (40 min) on the Celery task — long podcasts with many chapters
      take real time to cut and caption sequentially
- [ ] Fallback detection (`detect_chapters_fallback`) tested independently — it must
      work correctly even when `should_use_local()` triggers mid-task
- [ ] Each chapter captioned individually using the SAME word-level transcript data
      (no re-transcription per chapter — reuse the single transcript from the top)