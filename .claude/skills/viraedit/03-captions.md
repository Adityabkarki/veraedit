# Module 03 — Auto Captions (ElevenLabs Scribe — Nepali + English)

## Stack
- **Primary STT:** ElevenLabs Scribe v2 (`scribe_v2`) — configured in `.env`
  - `ELEVENLABS_API_KEY` + `ELEVENLABS_STT_MODEL=scribe_v2`
  - `WHISPER_LANGUAGE=ne` (default Nepali)
- **Fallback STT:** faster-whisper (local, CPU) when cost limit hit
- **Caption rendering:** FFmpeg ASS subtitles using `settings.FFMPEG_PATH`
- **Nepali font:** `settings.DEVANAGARI_FONT_PATH` = `/usr/share/fonts/NotoSansDevanagari-Regular.ttf`
- **Celery task** for async processing

---

## Files to Create / Modify

### `apps/api/processors/transcriber.py`
```python
import os, json, tempfile, httpx
from config import settings

async def transcribe_video(video_path: str, language: str = None) -> dict:
    """
    Transcribe using ElevenLabs Scribe v2 (primary) or faster-whisper (fallback).
    Returns: {language, words: [{word, start, end, confidence}], segments, full_text}
    """
    audio_path = _extract_audio(video_path)
    lang = language or settings.WHISPER_LANGUAGE  # defaults to "ne"

    # Try ElevenLabs first; fallback to local whisper on failure
    try:
        result = await _transcribe_elevenlabs(audio_path, lang)
    except Exception:
        result = _transcribe_whisper_local(audio_path, lang)

    if os.path.exists(audio_path):
        os.remove(audio_path)
    return result


async def _transcribe_elevenlabs(audio_path: str, language: str) -> dict:
    """ElevenLabs Scribe v2 — best for Nepali, returns word-level timestamps."""
    url = "https://api.elevenlabs.io/v1/speech-to-text"
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers=headers,
            files={"file": ("audio.wav", audio_bytes, "audio/wav")},
            data={
                "model_id": settings.ELEVENLABS_STT_MODEL,  # "scribe_v2"
                "language_code": language,                   # "ne" or "en"
                "timestamps_granularity": "word",
                "diarize": False,
            }
        )
        resp.raise_for_status()
        data = resp.json()

    words = []
    segments = []

    for word_obj in data.get("words", []):
        if word_obj.get("type") != "word":
            continue
        words.append({
            "word": word_obj["text"],
            "start": word_obj["start"],
            "end": word_obj["end"],
            "confidence": word_obj.get("logprob", 0),
        })

    if words:
        current_seg = {"words": [words[0]], "start": words[0]["start"]}
        for w in words[1:]:
            gap = w["start"] - current_seg["words"][-1]["end"]
            last_word = current_seg["words"][-1]["word"]
            if gap > 0.8 or any(last_word.endswith(p) for p in [".", "?", "!", "।"]):
                text = " ".join(x["word"] for x in current_seg["words"])
                segments.append({"text": text, "start": current_seg["start"],
                                  "end": current_seg["words"][-1]["end"],
                                  "words": current_seg["words"]})
                current_seg = {"words": [w], "start": w["start"]}
            else:
                current_seg["words"].append(w)
        if current_seg["words"]:
            text = " ".join(x["word"] for x in current_seg["words"])
            segments.append({"text": text, "start": current_seg["start"],
                              "end": current_seg["words"][-1]["end"],
                              "words": current_seg["words"]})

    return {
        "language": data.get("language_code", language),
        "words": words, "segments": segments,
        "full_text": data.get("text", ""),
    }


def _transcribe_whisper_local(audio_path: str, language: str) -> dict:
    from faster_whisper import WhisperModel
    model = WhisperModel("medium", device="cpu", compute_type="int8")
    segments_iter, info = model.transcribe(
        audio_path, language=language, word_timestamps=True, vad_filter=True,
    )
    words, segments = [], []
    for seg in segments_iter:
        seg_words = [{"word": w.word.strip(), "start": round(w.start, 3),
                      "end": round(w.end, 3), "confidence": round(w.probability, 3)}
                     for w in (seg.words or [])]
        words.extend(seg_words)
        segments.append({"text": seg.text.strip(), "start": round(seg.start, 3),
                          "end": round(seg.end, 3), "words": seg_words})
    return {"language": info.language, "words": words, "segments": segments,
            "full_text": " ".join(s["text"] for s in segments)}


def _extract_audio(video_path: str) -> str:
    import subprocess
    audio_path = video_path.replace(".mp4", "_audio.wav")
    subprocess.run([
        settings.FFMPEG_PATH, "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        audio_path, "-y"
    ], check=True, capture_output=True)
    return audio_path
```

### `apps/api/processors/caption_renderer.py`
```python
import subprocess, os
from config import settings

STYLE_PRESETS = {
    "hormozi": {
        "font": "Montserrat-Bold", "fontsize": 72,
        "primary_color": "&H00FFFFFF", "outline_color": "&H00000000",
        "outline": 3, "bold": 1, "words_per_group": 3, "position": "bottom_third",
    },
    "mrbeast": {
        "font": "Bangers-Regular", "fontsize": 80,
        "primary_color": "&H00FFFF00", "outline_color": "&H00000000",
        "outline": 4, "bold": 1, "words_per_group": 2, "position": "center",
    },
    "minimal": {
        "font": "Inter-Regular", "fontsize": 52,
        "primary_color": "&H00FFFFFF", "outline_color": "&H80000000",
        "outline": 2, "bold": 0, "words_per_group": 5, "position": "bottom_quarter",
    },
    "nepali_bold": {
        "font_path": settings.DEVANAGARI_FONT_PATH,
        "font": "NotoSansDevanagari-Regular", "fontsize": 68,
        "primary_color": "&H00FFFFFF", "outline_color": "&H00000000",
        "outline": 3, "bold": 1, "words_per_group": 3, "position": "bottom_third",
    },
    "kinetic": {
        "font": "Montserrat-ExtraBold", "fontsize": 76,
        "primary_color": "&H00FFFFFF", "outline_color": "&H00FF6B00",
        "outline": 3, "bold": 1, "words_per_group": 2, "position": "center",
    },
}

def render_captions(input_path: str, output_path: str, words: list, style: str = "hormozi") -> str:
    preset = STYLE_PRESETS.get(style, STYLE_PRESETS["minimal"])
    ass_path = input_path + f"_{style}.ass"
    _write_ass(words, preset, ass_path)
    fonts_dir = os.path.dirname(settings.DEVANAGARI_FONT_PATH)
    vf = f"ass={ass_path}:fontsdir={fonts_dir}"
    subprocess.run([
        settings.FFMPEG_PATH, "-i", input_path,
        "-vf", vf, "-c:a", "copy", output_path, "-y"
    ], check=True, capture_output=True)
    if os.path.exists(ass_path):
        os.remove(ass_path)
    return output_path


def _write_ass(words: list, preset: dict, out_path: str):
    words_per_group = preset.get("words_per_group", 3)
    groups = []
    for i in range(0, len(words), words_per_group):
        chunk = words[i:i + words_per_group]
        if chunk:
            groups.append({"words": chunk, "start": chunk[0]["start"], "end": chunk[-1]["end"]})
    alignment_map = {"bottom_third": 2, "center": 5, "bottom_quarter": 2, "top": 8}
    alignment = alignment_map.get(preset.get("position", "bottom_third"), 2)
    marginv = 200 if preset.get("position") == "bottom_third" else 50
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, BorderStyle, Outline, Alignment, MarginV, Encoding
Style: Default,{preset['font']},{preset['fontsize']},{preset['primary_color']},{preset['outline_color']},{preset['bold']},1,{preset['outline']},{alignment},{marginv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for g in groups:
        start = _to_ass_time(g["start"])
        end = _to_ass_time(g["end"])
        parts = []
        for w in g["words"]:
            dur_cs = max(1, int((w["end"] - w["start"]) * 100))
            parts.append(f"{{\\k{dur_cs}}}{w['word']}")
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{' '.join(parts)}")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(events))


def _to_ass_time(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = int((s - int(s)) * 100)
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"


def words_to_srt(segments: list) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        start = _to_srt_time(seg["start"])
        end = _to_srt_time(seg["end"])
        lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
    return "\n".join(lines)


def _to_srt_time(s: float) -> str:
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    ms = int((sec - int(sec)) * 1000)
    return f"{int(h):02d}:{int(m):02d}:{int(sec):02d},{ms:03d}"
```

### `apps/api/tasks/caption_tasks.py`
```python
import os, json, asyncio
from celery_app import celery_app
from processors.transcriber import transcribe_video
from processors.caption_renderer import render_captions, words_to_srt
from config import settings

@celery_app.task(bind=True)
def transcribe_task(self, job_id: str, video_key: str, project_id: str, language: str = None):
    try:
        local_path = _download_to_temp(video_key, job_id)
        result = asyncio.run(transcribe_video(local_path, language))
        transcript_key = f"projects/{project_id}/transcripts/{job_id}.json"
        _upload_json_sync(transcript_key, result)
        _update_job_sync(job_id, status="done", result={
            "transcript_key": transcript_key,
            "language": result["language"],
            "word_count": len(result["words"]),
            "full_text_preview": result["full_text"][:200],
        })
    except Exception as e:
        _update_job_sync(job_id, status="failed", error=str(e))

@celery_app.task(bind=True)
def render_captions_task(self, job_id: str, video_key: str, words: list,
                          style: str, project_id: str):
    try:
        local_path = _download_to_temp(video_key, job_id)
        out_path = local_path.replace(".mp4", f"_captioned_{style}.mp4")
        render_captions(local_path, out_path, words, style=style)
        out_key = f"projects/{project_id}/captioned/{job_id}_{style}.mp4"
        _upload_file_sync(out_key, out_path, "video/mp4")
        signed_url = _generate_presigned_url(out_key)
        _update_job_sync(job_id, status="done", result={
            "output_key": out_key, "url": signed_url,
        })
        for p in [local_path, out_path]:
            if os.path.exists(p): os.remove(p)
    except Exception as e:
        _update_job_sync(job_id, status="failed", error=str(e))
```

### `apps/api/routers/captions.py`
```python
import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models.job import Job
from tasks.caption_tasks import transcribe_task, render_captions_task
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/captions", tags=["captions"])

class TranscribeRequest(BaseModel):
    video_key: str
    project_id: str
    language: Optional[str] = None

class RenderCaptionsRequest(BaseModel):
    video_key: str
    words: list
    style: str = "hormozi"
    project_id: str

@router.post("/transcribe")
async def transcribe(req: TranscribeRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="TRANSCRIBE", status="queued",
              project_id=req.project_id, payload=req.dict())
    db.add(job); await db.commit()
    transcribe_task.delay(job_id, req.video_key, req.project_id, req.language)
    return {"job_id": job_id}

@router.post("/render")
async def render(req: RenderCaptionsRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="RENDER_CAPTIONS", status="queued", project_id=req.project_id)
    db.add(job); await db.commit()
    render_captions_task.delay(job_id, req.video_key, req.words, req.style, req.project_id)
    return {"job_id": job_id}

@router.get("/styles")
def caption_styles():
    return {"styles": ["hormozi", "mrbeast", "minimal", "nepali_bold", "kinetic"]}
```

---

## ElevenLabs Scribe Notes

- Scribe v2 supports Nepali (`ne`) natively — better accuracy than Whisper for Devanagari
- API endpoint: `POST https://api.elevenlabs.io/v1/speech-to-text`
- File formats: WAV, MP3, OGG, FLAC (we send WAV 16kHz mono)
- Max file size: 1GB; for longer videos chunk audio into 25-min segments
- Returns `words[]` with `{text, start, end, type, logprob}` — already word-level
- The `type` field can be `"word"` or `"spacing"` — filter to `"word"` only
- Pricing: ~$0.40/hr of audio — stays within $2/hr budget for typical clips

## Chunking for Long Videos (>25 min)

```python
def chunk_audio(audio_path: str, chunk_duration_min: int = 20) -> list[str]:
    """Split audio into chunks for long videos."""
    import subprocess
    chunk_sec = chunk_duration_min * 60
    base = audio_path.replace(".wav", "")
    subprocess.run([
        settings.FFMPEG_PATH, "-i", audio_path,
        "-f", "segment", "-segment_time", str(chunk_sec),
        "-c", "copy",
        f"{base}_chunk%03d.wav"
    ], check=True, capture_output=True)
    import glob
    return sorted(glob.glob(f"{base}_chunk*.wav"))
```

---

## Checklist for Cursor

- [ ] `apps/api/processors/transcriber.py` — ElevenLabs Scribe + whisper fallback
- [ ] `apps/api/processors/caption_renderer.py` — ASS subtitle writer using `settings.DEVANAGARI_FONT_PATH`
- [ ] `apps/api/tasks/caption_tasks.py` — Celery tasks
- [ ] `apps/api/routers/captions.py` — FastAPI routes
- [ ] All FFmpeg calls use `settings.FFMPEG_PATH` (not bare `ffmpeg`)
- [ ] Nepali font path from `settings.DEVANAGARI_FONT_PATH`
- [ ] Cost tracking via `tasks/pipeline_cost.py` (existing project patterns)
- [ ] SRT download endpoint: `GET /api/captions/{job_id}/srt`
- [ ] Frontend `apps/web/components/editor/CaptionStylePicker.tsx` with 5 style options
- [ ] Frontend `apps/web/components/editor/TranscriptEditor.tsx` — edit text → re-render captions