# Module 08 — Smart Clips (Podcast → Viral Shorts)

## Stack
- FastAPI + Celery task (full pipeline in one task)
- OpenAI `gpt-4o-mini` for virality scoring (uses `settings.openai_model_primary`)
- ElevenLabs Scribe for transcription (reuses Module 03 transcriber)
- FFmpeg at `settings.ffmpeg_path` for clip cutting
- Caption renderer from Module 03
- Reframer from Module 07
- AI budget tracker throughout

---

## Files to Create / Modify

### `backend/app/processors/clip_finder.py`
```python
import os, json
from openai import AsyncOpenAI
from ..config import settings
from ..services.ai_budget import budget

client = AsyncOpenAI(api_key=settings.openai_api_key)

async def find_viral_moments(
    transcript: dict,
    max_clips: int = 5,
    target_duration: float = 60.0,
    content_type: str = "podcast",
) -> list:
    """
    Score transcript segments using GPT-4o-mini for virality.
    Returns sorted list of clip candidates.
    """
    segments_text = "\n".join(
        f"[{seg['start']:.1f}s-{seg['end']:.1f}s] {seg['text']}"
        for seg in transcript["segments"]
    )

    prompt = f"""You are a viral content expert for {content_type} clips targeting
Nepali and international audiences on TikTok, Instagram Reels, and YouTube Shorts.

Given this {content_type} transcript, identify the {max_clips} most viral-worthy moments.
Target clip duration: 30-{int(target_duration)}s each.

Scoring criteria (0-100):
- Strong opening hook (first 3s must grab)
- Self-contained story or insight
- Emotional peak: surprise / laughter / insight / motivation
- Quotable soundbite
- Clear beginning-middle-end arc

Return ONLY valid JSON array, no markdown:
[{{
  "start": 45.2,
  "end": 108.7,
  "score": 92,
  "hook": "Exact opening line that grabs attention",
  "hook_type": "question|statistic|controversial|story|advice",
  "emotion": "surprise|motivation|laughter|insight|controversy",
  "reason": "Why this moment works (1 sentence)",
  "title": "Short clip title (max 8 words)",
  "suggested_caption_style": "hormozi|mrbeast|minimal|nepali_bold|kinetic"
}}]

Transcript:
{segments_text[:6000]}"""

    # Track spend: gpt-4o-mini ~$0.00015/1K input tokens
    estimated_tokens = len(prompt) / 4
    estimated_cost = (estimated_tokens / 1000) * 0.00015
    budget.record(estimated_cost)

    model = settings.openai_model_primary
    if budget.should_use_local():
        # Fallback to Ollama
        return await _find_moments_ollama(segments_text, max_clips, content_type)

    resp = await client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1500,
    )
    raw = resp.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:-1])

    clips = json.loads(raw)
    max_time = transcript["segments"][-1]["end"] if transcript["segments"] else 0
    valid = []
    for c in clips:
        if c["end"] > c["start"] and c["start"] < max_time:
            c["end"] = min(c["end"], max_time)
            c["duration"] = round(c["end"] - c["start"], 2)
            valid.append(c)
    return sorted(valid, key=lambda x: x["score"], reverse=True)


async def _find_moments_ollama(segments_text: str, max_clips: int, content_type: str) -> list:
    """Fallback to local Ollama when budget exceeded."""
    import httpx
    prompt = f"Find {max_clips} viral moments in this {content_type} transcript. Return JSON array with start, end, score, title, hook fields.\n\n{segments_text[:3000]}"
    async with httpx.AsyncClient(base_url=settings.ollama_base_url) as client:
        resp = await client.post("/api/generate", json={
            "model": "llama3.2",
            "prompt": prompt,
            "stream": False,
            "format": "json",
        }, timeout=120)
    data = resp.json()
    try:
        return json.loads(data.get("response", "[]"))
    except:
        return []


def detect_chapters(transcript: dict) -> list:
    """Simple rule-based chapter detection when LLM budget is low."""
    segments = transcript.get("segments", [])
    if not segments:
        return []

    chapters = []
    current_start = segments[0]["start"]
    current_words = []

    for i, seg in enumerate(segments):
        current_words.append(seg["text"])
        gap_to_next = (segments[i + 1]["start"] - seg["end"]) if i < len(segments) - 1 else 999
        is_sentence_end = seg["text"].rstrip().endswith((".", "?", "!", "।"))

        # Chapter break: pause > 2s after a sentence end
        if gap_to_next > 2.0 and is_sentence_end:
            chapters.append({
                "start": current_start,
                "end": seg["end"],
                "title": f"Chapter {len(chapters) + 1}",
                "summary": " ".join(current_words)[:100],
            })
            current_start = segments[i + 1]["start"] if i < len(segments) - 1 else seg["end"]
            current_words = []

    # Last chapter
    if current_words and segments:
        chapters.append({
            "start": current_start,
            "end": segments[-1]["end"],
            "title": f"Chapter {len(chapters) + 1}",
            "summary": " ".join(current_words)[:100],
        })
    return chapters
```

### `backend/app/tasks/clip_tasks.py`
```python
import os, json, uuid, asyncio
from .celery_app import celery_app
from ..processors.transcriber import transcribe_video
from ..processors.clip_finder import find_viral_moments, detect_chapters
from ..processors.text_editor import apply_cuts, _get_duration
from ..processors.caption_renderer import render_captions
from ..processors.reframer import reframe_video
from ..services.storage import storage_sync
from ..models.job import update_job_sync
from ..config import settings

@celery_app.task(bind=True, time_limit=1800)  # 30 min max
def smart_clips_task(
    self,
    job_id: str,
    video_key: str,
    project_id: str,
    max_clips: int = 5,
    target_duration: float = 60.0,
    content_type: str = "podcast",
    auto_caption: bool = True,
    auto_reframe: bool = True,
):
    def progress(step: str, **kwargs):
        update_job_sync(job_id, status="processing",
                        result={"step": step, **kwargs})

    try:
        # 1. Download video
        progress("downloading")
        local_path = storage_sync.download_to_temp(video_key, job_id)

        # 2. Transcribe
        progress("transcribing")
        transcript = asyncio.run(transcribe_video(local_path))

        # 3. Find viral moments
        progress("analyzing")
        candidates = asyncio.run(find_viral_moments(
            transcript, max_clips=max_clips,
            target_duration=target_duration, content_type=content_type,
        ))

        # 4. Process each clip
        output_clips = []
        for i, cand in enumerate(candidates):
            progress("processing_clip", done=i, total=len(candidates))
            clip_id = str(uuid.uuid4())
            work_dir = os.path.join(settings.temp_dir, job_id, clip_id)
            os.makedirs(work_dir, exist_ok=True)
            clip_path = os.path.join(work_dir, "clip.mp4")

            # Cut clip (remove everything OUTSIDE start→end)
            total_dur = _get_duration(local_path)
            cuts = []
            if cand["start"] > 0.1:
                cuts.append({"start": 0, "end": cand["start"]})
            if cand["end"] < total_dur - 0.1:
                cuts.append({"start": cand["end"], "end": total_dur})
            apply_cuts(local_path, clip_path, cuts)

            # Auto-caption
            if auto_caption:
                cap_path = os.path.join(work_dir, "captioned.mp4")
                # Re-zero word timestamps for this clip segment
                offset = cand["start"]
                clip_words = [
                    {**w, "start": round(w["start"] - offset, 3),
                           "end": round(w["end"] - offset, 3)}
                    for w in transcript["words"]
                    if w["start"] >= cand["start"] and w["end"] <= cand["end"] + 0.5
                ]
                if clip_words:
                    style = cand.get("suggested_caption_style", "hormozi")
                    render_captions(clip_path, cap_path, clip_words, style=style)
                    clip_path = cap_path

            # Auto-reframe to 9:16
            if auto_reframe:
                ref_path = os.path.join(work_dir, "reframed.mp4")
                reframe_video(clip_path, ref_path, target_w=1080, target_h=1920, mode="face_track")
                clip_path = ref_path

            # Upload to MinIO
            clip_key = f"projects/{project_id}/clips/{clip_id}.mp4"
            storage_sync.put_file(clip_key, clip_path, "video/mp4")
            signed_url = storage_sync.get_presigned_url(clip_key, expires=86400)

            output_clips.append({
                "id": clip_id,
                "key": clip_key,
                "url": signed_url,
                "score": cand["score"],
                "title": cand["title"],
                "hook": cand["hook"],
                "hook_type": cand["hook_type"],
                "emotion": cand["emotion"],
                "reason": cand["reason"],
                "duration": cand["duration"],
                "caption_style": cand.get("suggested_caption_style", "hormozi"),
            })

            # Cleanup work dir
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)

        # 5. Also run chapter detection
        chapters = detect_chapters(transcript)

        update_job_sync(job_id, status="done", result={
            "clips": output_clips,
            "chapters": chapters,
            "transcript_language": transcript["language"],
        })

    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
        raise
```

### `backend/app/routers/clips.py`
```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.job import Job
from ..tasks.clip_tasks import smart_clips_task

router = APIRouter(prefix="/api/clips", tags=["clips"])

class SmartClipsRequest(BaseModel):
    video_key: str
    project_id: str
    max_clips: int = 5
    target_duration: float = 60.0
    content_type: str = "podcast"  # podcast|interview|webinar|consultancy
    auto_caption: bool = True
    auto_reframe: bool = True

@router.post("/smart-clips")
async def smart_clips(req: SmartClipsRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="SMART_CLIPS", status="queued",
              project_id=req.project_id, payload=req.dict())
    db.add(job); await db.commit()
    smart_clips_task.delay(
        job_id, req.video_key, req.project_id,
        req.max_clips, req.target_duration,
        req.content_type, req.auto_caption, req.auto_reframe,
    )
    return {"job_id": job_id}

@router.get("/jobs/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    from ..models.job import Job as JobModel
    result = await db.execute(select(JobModel).where(JobModel.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        from fastapi import HTTPException
        raise HTTPException(404, "Job not found")
    return {"id": job.id, "status": job.status, "result": job.result, "error": job.error}
```

### Frontend: `frontend/components/editor/SmartClipsGallery.tsx`
```tsx
'use client';

interface Clip {
  id: string; url: string; score: number; title: string;
  hook: string; hook_type: string; emotion: string;
  reason: string; duration: number;
}

const EMOTION_COLORS: Record<string, string> = {
  surprise: "bg-yellow-100 text-yellow-700",
  motivation: "bg-green-100 text-green-700",
  laughter: "bg-pink-100 text-pink-700",
  insight: "bg-blue-100 text-blue-700",
  controversy: "bg-red-100 text-red-700",
};

export function SmartClipsGallery({ clips, onEdit, onDownload, onReject }: {
  clips: Clip[];
  onEdit: (c: Clip) => void;
  onDownload: (c: Clip) => void;
  onReject: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {clips.map(clip => (
        <div key={clip.id} className="border rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="relative bg-black" style={{ aspectRatio: '9/16' }}>
            <video
              src={clip.url} className="w-full h-full object-cover" loop playsInline
              onMouseEnter={e => (e.target as HTMLVideoElement).play()}
              onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
            />
            <div className="absolute top-2 right-2 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded-full">
              {clip.score}/100
            </div>
            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
              {Math.round(clip.duration)}s
            </div>
          </div>
          <div className="p-3 space-y-2">
            <p className="font-semibold text-sm line-clamp-1">{clip.title}</p>
            <p className="text-xs text-gray-500 italic line-clamp-2">"{clip.hook}"</p>
            <div className="flex gap-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full ${EMOTION_COLORS[clip.emotion] || "bg-gray-100 text-gray-600"}`}>
                {clip.emotion}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {clip.hook_type}
              </span>
            </div>
            <p className="text-xs text-gray-400 line-clamp-2">{clip.reason}</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => onEdit(clip)}
                className="flex-1 text-xs border border-gray-300 rounded py-1.5 hover:bg-gray-50">
                ✏️ Edit
              </button>
              <button onClick={() => onDownload(clip)}
                className="flex-1 text-xs bg-gray-900 text-white rounded py-1.5">
                ⬇️ Save
              </button>
              <button onClick={() => onReject(clip.id)}
                className="text-xs text-red-400 hover:text-red-600 px-2">✕</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Frontend: `frontend/app/projects/[id]/smart-clips/page.tsx`
```tsx
'use client';
import { useState } from 'react';
import { SmartClipsGallery } from '@/components/editor/SmartClipsGallery';
import { useJobPoller } from '@/hooks/useJobPoller';

const API = process.env.NEXT_PUBLIC_API_URL;

const CONTENT_TYPES = [
  { id: "podcast", label: "Podcast" },
  { id: "interview", label: "Interview" },
  { id: "webinar", label: "Webinar" },
  { id: "consultancy", label: "Consultancy Recording" },
];

export default function SmartClipsPage({ params }: { params: { id: string } }) {
  const [videoKey, setVideoKey] = useState('');
  const [contentType, setContentType] = useState('podcast');
  const [maxClips, setMaxClips] = useState(5);
  const [jobId, setJobId] = useState<string | null>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [step, setStep] = useState('');

  const { status } = useJobPoller(jobId, (result) => {
    if (result?.clips) setClips(result.clips);
  });

  // Also poll for step updates
  useJobPoller(jobId, (result) => {
    if (result?.step) setStep(result.step.replace(/_/g, ' '));
  });

  const start = async () => {
    const res = await fetch(`${API}/api/clips/smart-clips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({
        video_key: videoKey,
        project_id: params.id,
        max_clips: maxClips,
        content_type: contentType,
        auto_caption: true,
        auto_reframe: true,
      }),
    });
    const { job_id } = await res.json();
    setJobId(job_id);
    setClips([]);
  };

  return (
    <div>
      <div className="p-6 border-b flex flex-wrap gap-3 items-center">
        <h1 className="text-xl font-semibold">Smart Clips</h1>
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1 min-w-[200px]"
          placeholder="MinIO video key or paste from project..."
          value={videoKey} onChange={e => setVideoKey(e.target.value)}
        />
        <select value={contentType} onChange={e => setContentType(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm">
          {CONTENT_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={maxClips} onChange={e => setMaxClips(+e.target.value)}
          className="border rounded px-3 py-1.5 text-sm">
          {[3, 5, 8, 10].map(n => <option key={n} value={n}>{n} clips</option>)}
        </select>
        <button onClick={start} disabled={!videoKey || status === 'processing'}
          className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm disabled:opacity-50">
          Generate Clips
        </button>
      </div>

      {status === 'processing' && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-600 capitalize">{step || 'Starting...'}</p>
        </div>
      )}

      {clips.length > 0 && (
        <SmartClipsGallery
          clips={clips}
          onEdit={clip => {/* Navigate to editor */}}
          onDownload={clip => {
            const a = document.createElement('a');
            a.href = clip.url; a.download = `${clip.title}.mp4`; a.click();
          }}
          onReject={id => setClips(prev => prev.filter((c: any) => c.id !== id))}
        />
      )}
    </div>
  );
}
```

---

## Checklist for Cursor

- [ ] `backend/app/processors/clip_finder.py` — GPT-4o-mini scoring + Ollama fallback
- [ ] `backend/app/tasks/clip_tasks.py` — full pipeline Celery task (time_limit=1800)
- [ ] `backend/app/routers/clips.py` — smart-clips endpoint + job status
- [ ] All FFmpeg calls use `settings.ffmpeg_path`
- [ ] Budget tracked for every OpenAI call
- [ ] `SmartClipsGallery.tsx` — video-on-hover gallery
- [ ] Smart clips page at `/projects/[id]/smart-clips`
- [ ] `useJobPoller` hook polls both status and intermediate step updates
- [ ] Temp work dirs cleaned up after each clip (`shutil.rmtree`)
- [ ] Celery task `time_limit=1800` (30 min) for long podcasts