# Module 01 — Video Ingestion

## Stack
- FastAPI router + Celery task
- yt-dlp for URL download (Instagram, TikTok, YouTube)
- ffprobe at `settings.FFPROBE_PATH` for metadata
- MinIO bucket: `viraedit-media`
- PostgreSQL for job + asset records

---

## Files to Create / Modify

### `apps/api/routers/ingest.py`
```python
import uuid, os
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from schemas.ingest import IngestURLRequest, IngestResponse
from tasks.ingest_tasks import ingest_url_task, process_uploaded_file_task
from models.asset import Asset, AssetStatus
from config import settings

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

@router.post("/url", response_model=IngestResponse)
async def ingest_url(req: IngestURLRequest, db: AsyncSession = Depends(get_db)):
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, type="INGEST_URL", status="queued",
              project_id=req.project_id, payload=req.dict())
    db.add(job)
    await db.commit()
    # Enqueue Celery task
    ingest_url_task.delay(job_id, req.url, req.project_id)
    return IngestResponse(job_id=job_id, status="queued")

@router.post("/upload", response_model=IngestResponse)
async def upload_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    job_id = str(uuid.uuid4())
    # Upload to MinIO immediately (streaming)
    raw_key = f"projects/{project_id}/raw/{job_id}_{file.filename}"
    content = await file.read()
    await storage.put_object(raw_key, content, file.content_type or "video/mp4")

    job = Job(id=job_id, type="UPLOAD_FILE", status="queued",
              project_id=project_id, payload={"raw_key": raw_key})
    db.add(job)
    await db.commit()

    process_uploaded_file_task.delay(job_id, raw_key, project_id)
    return IngestResponse(job_id=job_id, status="queued")

@router.get("/jobs/{job_id}")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {"id": job.id, "status": job.status, "result": job.result, "error": job.error}
```

### `apps/api/tasks/ingest_tasks.py`
```python
import os, uuid, subprocess, json, tempfile
from celery_app import celery_app
from processors.downloader import download_video, extract_metadata, generate_thumbnail
from models.asset import Asset, AssetStatus
from config import settings

@celery_app.task(bind=True, max_retries=2)
def ingest_url_task(self, job_id: str, url: str, project_id: str):
    _update_job_sync(job_id, status="processing")
    try:
        local_path = download_video(url, job_id)
        _finish_ingest(job_id, local_path, project_id, source_url=url)
    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))
        raise self.retry(exc=exc, countdown=10)

@celery_app.task(bind=True)
def process_uploaded_file_task(self, job_id: str, raw_key: str, project_id: str):
    _update_job_sync(job_id, status="processing")
    try:
        local_path = _download_to_temp(raw_key, job_id)
        _finish_ingest(job_id, local_path, project_id)
    except Exception as exc:
        _update_job_sync(job_id, status="failed", error=str(exc))

def _finish_ingest(job_id: str, local_path: str, project_id: str, source_url: str = None):
    meta = extract_metadata(local_path)
    thumb_path = generate_thumbnail(local_path, job_id)
    video_key = f"projects/{project_id}/raw/{job_id}.mp4"
    thumb_key = f"projects/{project_id}/thumbnails/{job_id}.jpg"
    _upload_file_sync(video_key, local_path, "video/mp4")
    _upload_file_sync(thumb_key, thumb_path, "image/jpeg")
    _update_job_sync(job_id, status="done", result={
        "asset_id": job_id,
        "video_key": video_key,
        "thumb_key": thumb_key,
        "meta": meta,
    })
    for p in [local_path, thumb_path]:
        if os.path.exists(p):
            os.remove(p)
```

### `apps/api/processors/downloader.py`
```python
import os, subprocess, json, tempfile
import yt_dlp
from config import settings

def download_video(url: str, job_id: str) -> str:
    out_dir = os.path.join(tempfile.gettempdir(), "viraedit", job_id)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "raw.mp4")

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "outtmpl": out_path,
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": os.path.dirname(settings.FFMPEG_PATH),
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return out_path

def extract_metadata(video_path: str) -> dict:
    cmd = [
        settings.FFPROBE_PATH, "-v", "quiet",
        "-print_format", "json",
        "-show_streams", "-show_format",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    vs = next((s for s in data["streams"] if s["codec_type"] == "video"), {})
    return {
        "duration": float(data["format"].get("duration", 0)),
        "width": int(vs.get("width", 0)),
        "height": int(vs.get("height", 0)),
        "fps": eval(vs.get("r_frame_rate", "30/1")),
        "codec": vs.get("codec_name", ""),
        "file_size": int(data["format"].get("size", 0)),
        "has_audio": any(s["codec_type"] == "audio" for s in data["streams"]),
    }

def generate_thumbnail(video_path: str, job_id: str, at_second: float = 2.0) -> str:
    out_dir = os.path.join(tempfile.gettempdir(), "viraedit", job_id)
    os.makedirs(out_dir, exist_ok=True)
    thumb_path = os.path.join(out_dir, "thumb.jpg")
    subprocess.run([
        settings.FFMPEG_PATH, "-ss", str(at_second), "-i", video_path,
        "-frames:v", "1", "-q:v", "2", thumb_path, "-y"
    ], check=True, capture_output=True)
    return thumb_path
```

### `apps/api/processors/storage_helpers.py`
```python
import boto3, os, tempfile
from botocore.client import Config
from config import settings

class S3Storage:
    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )
        self.bucket = settings.S3_BUCKET_MEDIA

    def put_object(self, key: str, data: bytes, content_type: str = "application/octet-stream"):
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def put_file(self, key: str, local_path: str, content_type: str = "video/mp4"):
        self.client.upload_file(local_path, self.bucket, key,
                                ExtraArgs={"ContentType": content_type})

    def download_to_temp(self, key: str, job_id: str) -> str:
        ext = os.path.splitext(key)[1] or ".mp4"
        out_dir = os.path.join(tempfile.gettempdir(), "viraedit", job_id)
        os.makedirs(out_dir, exist_ok=True)
        local_path = os.path.join(out_dir, f"download{ext}")
        self.client.download_file(self.bucket, key, local_path)
        return local_path

    def get_presigned_url(self, key: str, expires: int = 3600) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires,
        )

storage_sync = S3Storage()
```

### `apps/api/schemas/ingest.py`
```python
from pydantic import BaseModel
from typing import Optional

class IngestURLRequest(BaseModel):
    url: str
    project_id: str

class IngestResponse(BaseModel):
    job_id: str
    status: str

class MediaAssetOut(BaseModel):
    id: str
    project_id: str
    storage_key: str
    thumb_key: Optional[str]
    duration: Optional[float]
    width: Optional[int]
    height: Optional[int]
    source_url: Optional[str]
```

### New model: `apps/api/models/job.py`
```python
import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from models.base import Base

class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False)
    status = Column(String, default="queued")
    payload = Column(JSONB, nullable=True)
    result = Column(JSONB, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

### Alembic Migration
```bash
# New models need an Alembic migration. Run:
cd apps/api && alembic revision --autogenerate -m 'add media_assets and jobs' && alembic upgrade head
```

### Frontend: `apps/web/components/editor/UploadZone.tsx`
```tsx
'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

const API = process.env.NEXT_PUBLIC_API_URL;

export function UploadZone({ projectId, onJobStarted }: {
  projectId: string;
  onJobStarted: (jobId: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ingestUrl = async () => {
    if (!url.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/api/ingest/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ url, project_id: projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { job_id } = await res.json();
      onJobStarted(job_id);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    setLoading(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('project_id', projectId);
      const res = await fetch(`${API}/api/ingest/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: form,
      });
      const { job_id } = await res.json();
      onJobStarted(job_id);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'video/*': [] }, maxSize: 2 * 1024 * 1024 * 1024,
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          placeholder="Paste Instagram, TikTok, or YouTube URL..."
          value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ingestUrl()}
        />
        <button onClick={ingestUrl} disabled={loading || !url}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50">
          Import
        </button>
      </div>
      <div {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
        <input {...getInputProps()} />
        <p className="text-gray-500 text-sm">
          {isDragActive ? 'Drop video here...' : 'Drag & drop a video, or click to select'}
        </p>
        <p className="text-xs text-gray-400 mt-1">MP4, MOV, MKV up to 2GB</p>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

### Frontend: `apps/web/hooks/useJobPoller.ts`
```typescript
import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL;

export function useJobPoller(jobId: string | null, onDone: (result: any) => void) {
  const [status, setStatus] = useState<string>('idle');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!jobId) return;
    setStatus('queued');
    const token = localStorage.getItem('token');

    const interval = setInterval(async () => {
      const res = await fetch(`${API}/api/ingest/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setStatus(data.status);
      if (data.status === 'done') {
        setResult(data.result);
        onDone(data.result);
        clearInterval(interval);
      } else if (data.status === 'failed') {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId]);

  return { status, result };
}
```

---

## Temp Directory Setup

```bash
# On Rocky Linux 9, create dirs (matches .env paths)
mkdir -p /tmp/viraedit/uploads
mkdir -p /tmp/viraedit/renders
mkdir -p /tmp/viraedit/logs

# Add to /etc/tmpfiles.d/viraedit.conf so they survive reboots:
# d /tmp/viraedit 0755 mkarki mkarki -
```

---

## Checklist for Cursor

- [ ] `apps/api/config.py` — Pydantic Settings reading `.env`
- [ ] `apps/api/processors/storage_helpers.py` — S3/MinIO client (boto3)
- [ ] `apps/api/processors/downloader.py` — yt-dlp + ffprobe using `settings.FFPROBE_PATH`
- [ ] `apps/api/celery_app.py` — Celery with Redis broker + backend
- [ ] `apps/api/tasks/ingest_tasks.py` — Celery tasks for URL + file
- [ ] `apps/api/routers/ingest.py` — FastAPI routes
- [ ] `apps/api/models/job.py` — SQLAlchemy model
- [ ] `apps/api/schemas/ingest.py` — Pydantic schemas
- [ ] Alembic migration for new tables
- [ ] `apps/web/components/editor/UploadZone.tsx`
- [ ] `apps/web/hooks/useJobPoller.ts`
- [ ] Temp dirs created at `/tmp/viraedit/`
- [ ] MinIO bucket `viraedit-media` created (via MinIO console at :9001)