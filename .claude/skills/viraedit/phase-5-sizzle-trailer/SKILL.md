# Phase 5 — Sizzle Reel / Trailer / Highlight Generation

## What this phase delivers

Different from Shorts (Phase 3, which extracts standalone postable clips) and
Chapters (Phase 4, which splits the full video into sequential sections). A sizzle
reel/trailer is a **single fast-cut highlight video** assembled from the most
exciting/promo-worthy micro-moments across the ENTIRE source video — like a movie
trailer or "coming up in this episode" teaser. Typically 15-45 seconds, rapid cuts,
energetic music, designed to make someone want to watch the full thing.

This is conceptually different from Shorts: Shorts pick 3-5 separate complete
standalone moments. A sizzle reel stitches many very short fragments (1-4 seconds
each) from across the whole video into one continuous, high-energy montage.

---

## Detection Approach

GPT-4o-mini scores the transcript for "peak energy" moments — laughter, exclamations,
strong statements, surprising reveals — and returns many short timestamp fragments
(not full segments) suitable for rapid-fire montage cutting.

### `backend/app/processors/sizzle_finder.py`

```python
import json
from openai import AsyncOpenAI
from ..config import settings
from ..services.ai_budget import budget

client = AsyncOpenAI(api_key=settings.openai_api_key)


async def find_sizzle_moments(transcript: dict, target_total_duration: float = 30.0,
                              fragment_count: int = 10) -> list:
    """
    Finds short, high-energy fragments across the WHOLE video suitable for a
    trailer-style montage. Unlike find_viral_moments (Module 08), these are
    intentionally SHORT (1-4s each) and numerous, meant to be cut together
    rapidly rather than shown as standalone clips.

    Returns: [{"start": float, "end": float, "energy_score": int, "reason": str}]
    """
    segments_text = "\n".join(
        f"[{seg['start']:.1f}s-{seg['end']:.1f}s] {seg['text']}"
        for seg in transcript["segments"]
    )

    avg_fragment_duration = target_total_duration / fragment_count

    prompt = f"""You are cutting a TRAILER/SIZZLE REEL — a fast-paced highlight montage
that previews the most exciting, surprising, funny, or compelling moments from this
entire video, spread across its full length (not just one section).

Find {fragment_count} short fragments, each roughly {avg_fragment_duration:.1f} seconds,
that would work as rapid-fire trailer cuts. Prioritize:
- Punchy, quotable one-liners
- Moments of laughter, surprise, or strong emotion
- Bold claims or hooks
- Visually/verbally distinct moments spread THROUGHOUT the video, not clustered together

Return ONLY valid JSON array, no markdown:
[
  {{
    "start": 12.4,
    "end": 15.1,
    "energy_score": 88,
    "reason": "Punchy quotable statement"
  }}
]

Transcript:
{segments_text[:8000]}"""

    estimated_cost = (len(prompt) / 4 / 1000) * 0.00015
    budget.record(estimated_cost)

    resp = await client.chat.completions.create(
        model=settings.openai_model_primary,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=1200,
    )
    raw = resp.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:-1])

    fragments = json.loads(raw)
    max_time = transcript["segments"][-1]["end"] if transcript["segments"] else 0
    valid = [f for f in fragments if f["end"] <= max_time + 1 and f["end"] > f["start"]]

    # Sort by timestamp (chronological) so the montage tells a loose narrative arc,
    # rather than by score (which would cluster the best moments together)
    return sorted(valid, key=lambda x: x["start"])
```

---

## Assembly Pipeline

### `backend/app/processors/sizzle_assembler.py`

```python
import subprocess, os
from ..config import settings

def assemble_sizzle_reel(
    source_video_path: str,
    fragments: list,
    output_path: str,
    add_quick_cut_transition: bool = True,
    target_width: int = 1080,
    target_height: int = 1920,
) -> str:
    """
    Cuts and concatenates many short fragments into one fast-paced montage.
    Uses hard cuts by default (quick_cut) since trailers favor punchy editing
    over smooth crossfades.
    """
    work_dir = os.path.dirname(output_path)
    os.makedirs(work_dir, exist_ok=True)
    part_paths = []

    for i, frag in enumerate(fragments):
        part_path = os.path.join(work_dir, f"sizzle_part_{i}.mp4")
        subprocess.run([
            settings.ffmpeg_path, "-i", source_video_path,
            "-ss", str(frag["start"]), "-to", str(frag["end"]),
            "-vf", (f"scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
                    f"crop={target_width}:{target_height}"),
            "-c:v", "libx264", "-preset", "fast", "-c:a", "aac",
            part_path, "-y",
        ], check=True, capture_output=True)
        part_paths.append(part_path)

    concat_file = os.path.join(work_dir, "sizzle_concat.txt")
    with open(concat_file, "w") as f:
        for p in part_paths:
            f.write(f"file '{p}'\n")

    subprocess.run([
        settings.ffmpeg_path, "-f", "concat", "-safe", "0",
        "-i", concat_file, "-c", "copy",
        output_path, "-y",
    ], check=True, capture_output=True)

    for p in part_paths + [concat_file]:
        if os.path.exists(p):
            os.remove(p)

    return output_path


def add_background_music(video_path: str, music_path: str, output_path: str,
                         music_volume: float = 0.3, duck_for_speech: bool = True) -> str:
    """
    Mix background music under the sizzle reel's existing audio.
    duck_for_speech lowers music volume automatically when speech is present
    (sidechain compression), keeping any spoken words audible.
    """
    if duck_for_speech:
        filter_complex = (
            f"[1:a]volume={music_volume}[music];"
            f"[0:a][music]sidechaincompress=threshold=0.05:ratio=8:attack=5:release=200[ducked];"
            f"[0:a][ducked]amix=inputs=2:duration=first[aout]"
        )
    else:
        filter_complex = f"[1:a]volume={music_volume}[music];[0:a][music]amix=inputs=2:duration=first[aout]"

    subprocess.run([
        settings.ffmpeg_path, "-i", video_path, "-i", music_path,
        "-filter_complex", filter_complex,
        "-map", "0:v:0", "-map", "[aout]",
        "-c:v", "copy", "-c:a", "aac",
        "-shortest",
        output_path, "-y",
    ], check=True, capture_output=True)
    return output_path
```

---

## Stock Music for Sizzle Reels

Reuses the Pexels-style B-roll search pattern from Module 05, but for music. Use a
free/royalty-free music API (e.g. Pixabay Music API or a bundled local library of
royalty-free tracks tagged by mood) so the system can auto-select music matching
`music_mood` from the style template (Phase 1) without the user needing to source
their own.

```python
# backend/app/processors/music_library.py
import os
from ..config import settings

# Bundle ~15-20 royalty-free tracks locally, tagged by mood, rather than depending
# on an external API for something this core to the trailer experience
MUSIC_LIBRARY = {
    "upbeat":   ["upbeat_1.mp3", "upbeat_2.mp3", "upbeat_3.mp3"],
    "calm":     ["calm_1.mp3", "calm_2.mp3"],
    "dramatic": ["dramatic_1.mp3", "dramatic_2.mp3"],
    "corporate":["corporate_1.mp3", "corporate_2.mp3"],
}

def pick_music_for_mood(mood: str) -> str:
    """Returns local path to a bundled royalty-free track matching the mood."""
    import random
    tracks = MUSIC_LIBRARY.get(mood, MUSIC_LIBRARY["upbeat"])
    chosen = random.choice(tracks)
    return os.path.join(settings.temp_dir, "..", "music_library", chosen)
```

> Source 15-20 CC0/royalty-free tracks (e.g. from Pixabay Music, YouTube Audio
> Library) once, bundle them in `backend/assets/music_library/`, tagged by mood.
> This avoids per-use API costs and licensing complexity for something used in
> nearly every sizzle reel.

---

## Celery Task & Router

### `backend/app/tasks/sizzle_tasks.py`

```python
import os, asyncio, shutil
from .celery_app import celery_app
from ..processors.transcriber import transcribe_video
from ..processors.sizzle_finder import find_sizzle_moments
from ..processors.sizzle_assembler import assemble_sizzle_reel, add_background_music
from ..processors.music_library import pick_music_for_mood
from ..processors.caption_renderer import render_captions
from ..services.storage import storage_sync
from ..models.job import update_job_sync
from ..config import settings

@celery_app.task(bind=True, time_limit=1200)
def generate_sizzle_task(self, job_id: str, video_key: str, project_id: str,
                         target_duration: float = 30.0, music_mood: str = "upbeat",
                         add_captions: bool = True):
    def progress(step, **kw):
        update_job_sync(job_id, status="processing", result={"step": step, **kw})

    try:
        progress("downloading")
        local_path = storage_sync.download_to_temp(video_key, job_id)

        progress("transcribing")
        transcript = asyncio.run(transcribe_video(local_path))

        progress("finding_highlights")
        fragment_count = max(6, int(target_duration / 3))
        fragments = asyncio.run(find_sizzle_moments(transcript, target_duration, fragment_count))

        progress("assembling")
        work_dir = os.path.join(settings.temp_dir, job_id, "sizzle_work")
        raw_sizzle_path = os.path.join(work_dir, "sizzle_raw.mp4")
        assemble_sizzle_reel(local_path, fragments, raw_sizzle_path)

        current = raw_sizzle_path
        if add_captions:
            progress("captioning")
            words_subset = [
                w for frag in fragments for w in transcript["words"]
                if frag["start"] <= w["start"] <= frag["end"]
            ]
            captioned_path = os.path.join(work_dir, "sizzle_captioned.mp4")
            if words_subset:
                render_captions(current, captioned_path, words_subset, style="kinetic")
                current = captioned_path

        progress("adding_music")
        music_path = pick_music_for_mood(music_mood)
        final_path = os.path.join(work_dir, "sizzle_final.mp4")
        if os.path.exists(music_path):
            add_background_music(current, music_path, final_path)
            current = final_path

        out_key = f"projects/{project_id}/sizzle/{job_id}.mp4"
        storage_sync.put_file(out_key, current, "video/mp4")
        url = storage_sync.get_presigned_url(out_key, expires=86400)

        update_job_sync(job_id, status="done", result={
            "key": out_key, "url": url,
            "fragment_count": len(fragments), "duration": target_duration,
        })
        shutil.rmtree(work_dir, ignore_errors=True)
        if os.path.exists(local_path):
            os.remove(local_path)

    except Exception as e:
        update_job_sync(job_id, status="failed", error=str(e))
```

### `backend/app/routers/sizzle.py`

```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from ..database import get_db
from ..models.job import Job
from ..tasks.sizzle_tasks import generate_sizzle_task

router = APIRouter(prefix="/api/sizzle", tags=["sizzle"])

class GenerateSizzleRequest(BaseModel):
    video_key: str
    project_id: str
    target_duration: float = 30.0
    music_mood: str = "upbeat"   # "upbeat" | "calm" | "dramatic" | "corporate"
    add_captions: bool = True

@router.post("/generate")
async def generate(req: GenerateSizzleRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="GENERATE_SIZZLE", status="queued", project_id=req.project_id)
    db.add(job)
    await db.commit()
    generate_sizzle_task.delay(job_id, req.video_key, req.project_id,
                               req.target_duration, req.music_mood, req.add_captions)
    return {"job_id": job_id}
```

---

## Frontend

### `frontend/components/sizzle/SizzleGenerator.tsx`

```tsx
"use client";
import { useState } from "react";
import { useJobPoller } from "@/hooks/useJobPoller";

const API = process.env.NEXT_PUBLIC_API_URL;

const MOODS = [
  { id: "upbeat", label: "Upbeat & energetic" },
  { id: "dramatic", label: "Dramatic & intense" },
  { id: "calm", label: "Calm & inspiring" },
  { id: "corporate", label: "Professional" },
];

const STEP_LABELS: Record<string, string> = {
  downloading: "Loading your video...",
  transcribing: "Listening to the whole video...",
  finding_highlights: "Finding the best moments...",
  assembling: "Cutting them together...",
  captioning: "Adding captions...",
  adding_music: "Adding music...",
};

export function SizzleGenerator({ videoKey, projectId }: { videoKey: string; projectId: string }) {
  const [duration, setDuration] = useState(30);
  const [mood, setMood] = useState("upbeat");
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string } | null>(null);

  const { status, progress } = useJobPoller(jobId, (r) => { if (r?.url) setResult(r); });

  const start = async () => {
    setResult(null);
    const res = await fetch(`${API}/api/sizzle/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
      body: JSON.stringify({ video_key: videoKey, project_id: projectId, target_duration: duration, music_mood: mood }),
    });
    const { job_id } = await res.json();
    setJobId(job_id);
  };

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Make a highlight trailer</h2>
        <p className="text-sm text-gray-500">
          A fast-cut preview of your video's best moments — perfect for teasing the full episode.
        </p>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Length</p>
        <div className="flex gap-2">
          {[15, 30, 45, 60].map((d) => (
            <button key={d} onClick={() => setDuration(d)}
              className={`flex-1 py-2 rounded-lg text-sm border ${duration === d ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"}`}>
              {d}s
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Mood</p>
        <div className="grid grid-cols-2 gap-2">
          {MOODS.map((m) => (
            <button key={m.id} onClick={() => setMood(m.id)}
              className={`py-2 rounded-lg text-sm border ${mood === m.id ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={start} disabled={status === "processing"}
        className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium disabled:opacity-50">
        {status === "processing" ? "Working on it..." : "Generate trailer"}
      </button>

      {status === "processing" && (
        <div className="text-center py-6 space-y-2">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-600">{STEP_LABELS[progress?.step] || "Working..."}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <video src={result.url} className="w-full rounded-xl mx-auto" style={{ aspectRatio: "9/16", maxWidth: 280 }} controls autoPlay loop />
          <a href={result.url} download="trailer.mp4"
            className="block text-center bg-gray-900 text-white py-2.5 rounded-xl text-sm">
            Download trailer
          </a>
        </div>
      )}
    </div>
  );
}
```

---

## Checklist for Cursor

- [ ] `backend/app/processors/sizzle_finder.py` — short-fragment, chronologically-
      sorted moment detection (distinct from `find_viral_moments` which returns
      fewer, longer, standalone segments)
- [ ] `backend/app/processors/sizzle_assembler.py` — fragment cutting + concat +
      music mixing with sidechain ducking
- [ ] `backend/assets/music_library/` — 15-20 bundled royalty-free tracks tagged
      by mood, sourced once (Pixabay Music / YouTube Audio Library, confirm license)
- [ ] `backend/app/processors/music_library.py` — mood → track picker
- [ ] `backend/app/tasks/sizzle_tasks.py` — full pipeline task
- [ ] `backend/app/routers/sizzle.py` — `/generate` endpoint
- [ ] `SizzleGenerator.tsx` — duration + mood picker, single button
- [ ] Caption style for sizzle reels defaults to `"kinetic"` (fast, punchy) not
      `"minimal"` — matches the trailer energy
- [ ] Audio sidechain ducking tested — music must audibly lower under any speech
      fragments, not just play at flat volume under everything
