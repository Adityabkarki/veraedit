# Module 04 — Text-Based Editing (Descript-Style)

## Stack
- FastAPI + Celery task
- FFmpeg at `settings.FFMPEG_PATH` for all video cuts
- Silence detection via FFmpeg `silencedetect` filter
- Filler word lists: English + Nepali
- PostgreSQL job tracking

---

## Files to Create / Modify

### `apps/api/processors/text_editor.py`
```python
import subprocess, os, json
from config import settings

def apply_cuts(input_path: str, output_path: str, cuts: list) -> str:
    duration = _get_duration(input_path)
    keep = _cuts_to_keep(cuts, duration)
    if not keep:
        raise ValueError("All segments would be removed")

    part_files = []
    for i, seg in enumerate(keep):
        part = input_path + f".part{i}.mp4"
        subprocess.run([
            settings.FFMPEG_PATH, "-i", input_path,
            "-ss", str(seg["start"]), "-to", str(seg["end"]),
            "-c", "copy", part, "-y"
        ], check=True, capture_output=True)
        part_files.append(part)

    concat_file = input_path + ".concat.txt"
    with open(concat_file, "w") as f:
        for p in part_files:
            f.write(f"file '{p}'\n")

    subprocess.run([
        settings.FFMPEG_PATH, "-f", "concat", "-safe", "0",
        "-i", concat_file, "-c", "copy",
        output_path, "-y"
    ], check=True, capture_output=True)

    for p in part_files + [concat_file]:
        if os.path.exists(p): os.remove(p)
    return output_path


def _cuts_to_keep(cuts: list, total: float) -> list:
    if not cuts: return [{"start": 0, "end": total}]
    sorted_cuts = sorted(cuts, key=lambda c: c["start"])
    keep, cursor = [], 0.0
    for c in sorted_cuts:
        if c["start"] > cursor + 0.05:
            keep.append({"start": cursor, "end": c["start"]})
        cursor = c["end"]
    if cursor < total - 0.05:
        keep.append({"start": cursor, "end": total})
    return keep


def detect_silences(video_path: str, min_duration: float = 0.8,
                    threshold_db: float = -35) -> list:
    cmd = [
        settings.FFMPEG_PATH, "-i", video_path,
        "-af", f"silencedetect=noise={threshold_db}dB:d={min_duration}",
        "-f", "null", "-"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    silences, start = [], None
    for line in result.stderr.splitlines():
        if "silence_start" in line:
            try: start = float(line.split("silence_start: ")[1])
            except: pass
        elif "silence_end" in line and start is not None:
            try:
                end = float(line.split("silence_end: ")[1].split()[0])
                silences.append({"start": start, "end": end})
                start = None
            except: pass
    return silences


FILLERS_EN = {
    "um", "uh", "like", "you know", "literally", "basically",
    "actually", "right", "so", "okay", "yeah", "hmm", "er",
    "kind of", "sort of", "i mean",
}
FILLERS_NE = {
    "हैन", "अनि", "भने", "त", "हो", "नि", "गर्छु", "भनेको",
}

def detect_fillers(words: list, language: str = "ne") -> list:
    fillers = FILLERS_NE | FILLERS_EN if language == "ne" else FILLERS_EN
    cuts = []
    for w in words:
        if w["word"].lower().strip(".,!?।") in fillers:
            cuts.append({"start": w["start"], "end": w["end"], "reason": "filler"})
    return cuts


def _get_duration(path: str) -> float:
    cmd = [settings.FFPROBE_PATH, "-v", "quiet",
           "-print_format", "json", "-show_format", path]
    data = json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)
    return float(data["format"].get("duration", 0))
```

### `apps/api/tasks/cut_tasks.py` (add apply_cuts_task)
```python
import os
from celery_app import celery_app
from processors.text_editor import apply_cuts

@celery_app.task(bind=True)
def apply_cuts_task(self, job_id: str, video_key: str, cuts: list, project_id: str):
    _update_job_sync(job_id, status="processing")
    try:
        local_path = _download_to_temp(video_key, job_id)
        out_path = local_path.replace(".mp4", "_edited.mp4")
        apply_cuts(local_path, out_path, cuts)
        out_key = f"projects/{project_id}/edited/{job_id}.mp4"
        _upload_file_sync(out_key, out_path, "video/mp4")
        signed_url = _generate_presigned_url(out_key)
        _update_job_sync(job_id, status="done", result={"output_key": out_key, "url": signed_url})
        for p in [local_path, out_path]:
            if os.path.exists(p): os.remove(p)
    except Exception as e:
        _update_job_sync(job_id, status="failed", error=str(e))
```

### `apps/api/routers/text_editor.py`
```python
import uuid, os
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.job import Job
from processors.text_editor import detect_silences, detect_fillers
from tasks.cut_tasks import apply_cuts_task
from pydantic import BaseModel

router = APIRouter(prefix="/api/text-editor", tags=["text-editor"])

class ApplyCutsRequest(BaseModel):
    video_key: str
    cuts: list
    project_id: str

class DetectFillersRequest(BaseModel):
    words: list
    language: str = "ne"

class DetectSilencesRequest(BaseModel):
    video_key: str
    min_silence_duration: float = 0.8
    silence_threshold_db: float = -35

@router.post("/apply-cuts")
async def apply_cuts_endpoint(req: ApplyCutsRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="APPLY_CUTS", status="queued", project_id=req.project_id)
    db.add(job); await db.commit()
    apply_cuts_task.delay(job_id, req.video_key, req.cuts, req.project_id)
    return {"job_id": job_id}

@router.post("/detect-fillers")
def fillers_endpoint(req: DetectFillersRequest):
    cuts = detect_fillers(req.words, req.language)
    return {"cuts": cuts, "count": len(cuts)}

@router.post("/detect-silences")
async def silences_endpoint(req: DetectSilencesRequest):
    local_path = _download_to_temp(req.video_key, "silence_detect")
    silences = detect_silences(local_path, req.min_silence_duration, req.silence_threshold_db)
    os.remove(local_path)
    return {"silences": silences, "count": len(silences)}
```

### Frontend `apps/web/components/editor/TextEditor.tsx`
```tsx
'use client';
import { useState, useMemo } from 'react';

interface Word { word: string; start: number; end: number; }
interface Cut { start: number; end: number; reason?: string; }

interface Props {
  words: Word[];
  currentTime: number;
  fillerCuts?: Cut[];
  silenceCuts?: Cut[];
  onSeek: (t: number) => void;
  onApply: (cuts: Cut[]) => void;
}

export function TextEditor({ words, currentTime, fillerCuts = [], silenceCuts = [], onSeek, onApply }: Props) {
  const [manualCuts, setManualCuts] = useState<Cut[]>([]);
  const [activeFillers, setActiveFillers] = useState(false);
  const [activeSilences, setActiveSilences] = useState(false);
  const [selStart, setSelStart] = useState<number | null>(null);

  const allCuts = useMemo(() => {
    const base = [...manualCuts];
    if (activeFillers) base.push(...fillerCuts);
    if (activeSilences) base.push(...silenceCuts);
    return mergeCuts(base);
  }, [manualCuts, activeFillers, activeSilences, fillerCuts, silenceCuts]);

  const cutWordSet = useMemo(() => {
    const set = new Set<number>();
    allCuts.forEach(cut => {
      words.forEach((w, i) => {
        if (w.start >= cut.start && w.end <= cut.end) set.add(i);
      });
    });
    return set;
  }, [allCuts, words]);

  const handleWordClick = (w: Word, idx: number) => {
    onSeek(w.start);
    if (selStart === null) {
      setSelStart(idx);
    } else {
      const s = Math.min(selStart, idx);
      const e = Math.max(selStart, idx);
      const range = words.slice(s, e + 1);
      setManualCuts(prev => mergeCuts([...prev, {
        start: range[0].start, end: range[range.length - 1].end, reason: 'manual'
      }]));
      setSelStart(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-2 p-3 border-b flex-wrap items-center">
        <button
          onClick={() => setActiveFillers(!activeFillers)}
          className={`text-xs px-3 py-1.5 rounded border transition-all
            ${activeFillers ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-300'}`}
        >
          Fillers ({fillerCuts.length})
        </button>
        <button
          onClick={() => setActiveSilences(!activeSilences)}
          className={`text-xs px-3 py-1.5 rounded border transition-all
            ${activeSilences ? 'bg-yellow-500 text-white border-yellow-500' : 'border-gray-300'}`}
        >
          Silences ({silenceCuts.length})
        </button>
        {allCuts.length > 0 && (
          <button
            onClick={() => onApply(allCuts)}
            className="ml-auto text-xs bg-blue-600 text-white px-4 py-1.5 rounded"
          >
            Apply {allCuts.length} cuts
          </button>
        )}
        {selStart !== null && (
          <span className="text-xs text-blue-600 ml-2">Click another word to select range →</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 leading-8 select-none">
        {words.map((w, i) => {
          const isCut = cutWordSet.has(i);
          const isActive = currentTime >= w.start && currentTime < w.end;
          const isSelStart = selStart === i;
          return (
            <span
              key={i} onClick={() => handleWordClick(w, i)}
              title={`${w.start.toFixed(2)}s`}
              className={[
                "inline cursor-pointer rounded px-0.5 transition-colors",
                isCut ? "line-through text-gray-300" : "",
                isActive && !isCut ? "bg-blue-200 font-semibold" : "",
                isSelStart ? "bg-blue-400 text-white" : "",
                !isCut && !isActive ? "hover:bg-gray-100" : "",
              ].join(" ")}
            >
              {w.word}{" "}
            </span>
          );
        })}
      </div>

      {allCuts.length > 0 && (
        <div className="border-t p-2 max-h-24 overflow-y-auto bg-gray-50">
          <p className="text-xs text-gray-500 mb-1 font-medium">Pending cuts ({allCuts.length})</p>
          {allCuts.map((c, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-600">{c.reason} · {c.start.toFixed(1)}s–{c.end.toFixed(1)}s</span>
              <button onClick={() => setManualCuts(prev => prev.filter(m => !(m.start === c.start && m.end === c.end)))}
                className="text-red-400 hover:text-red-600">undo</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function mergeCuts(cuts: Cut[]): Cut[] {
  if (!cuts.length) return [];
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const out: Cut[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].start <= last.end + 0.05) last.end = Math.max(last.end, sorted[i].end);
    else out.push({ ...sorted[i] });
  }
  return out;
}
```

---

## Checklist for Cursor

- [ ] `apps/api/processors/text_editor.py` — apply_cuts, detect_silences, detect_fillers
- [ ] All subprocess calls use `settings.FFMPEG_PATH` and `settings.FFPROBE_PATH`
- [ ] Nepali filler words list included (हैन, अनि, भने, etc.)
- [ ] `apply_cuts_task` in `apps/api/tasks/cut_tasks.py`
- [ ] `apps/api/routers/text_editor.py` — 3 endpoints
- [ ] `apps/web/components/editor/TextEditor.tsx` frontend component
- [ ] Temp files cleaned up after processing (use `tempfile.gettempdir()`)
- [ ] Alembic migration if any new models added