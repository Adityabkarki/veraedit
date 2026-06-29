# Module 10 — Deployment (Rocky Linux 9 + Docker + Nginx + Celery)

## Current Setup (from .env)
- **OS:** Rocky Linux 9
- **FFmpeg:** `/home/mkarki/.local/bin/ffmpeg` (user-local install)
- **DB:** PostgreSQL in Docker, mapped 5432→5433 externally
- **Redis:** Docker, port 6379
- **MinIO:** Docker, ports 9000 (API) + 9001 (Console)
- **Celery pool:** `solo` in dev, `prefork` in prod

---

## `docker-compose.yml` (update existing)

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: viraedit
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-viraedit_dev_password}
      POSTGRES_DB: viraedit
    ports:
      - "5433:5432"          # external 5433 → internal 5432 (matches .env)
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U viraedit"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY:-minioadmin}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-minioadmin123}
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

> Note: The FastAPI backend and Celery workers run directly on the host (not in Docker)
> during development, matching your existing setup pattern.

---

## Backend Setup (Rocky Linux 9)

```bash
# Install Python 3.11 if not already
sudo dnf install python3.11 python3.11-devel -y

# Create virtualenv
cd /path/to/viraedit/backend
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Create MinIO bucket (once)
python -c "
import boto3
from botocore.client import Config
client = boto3.client('s3',
    endpoint_url='http://localhost:9000',
    aws_access_key_id='minioadmin',
    aws_secret_access_key='minioadmin123',
    config=Config(signature_version='s3v4'),
    region_name='us-east-1',
)
try:
    client.create_bucket(Bucket='viraedit-media')
    print('Bucket created')
except Exception as e:
    print(f'Bucket already exists or error: {e}')
"

# Create temp dirs
mkdir -p /tmp/viraedit/uploads /tmp/viraedit/renders /tmp/viraedit/logs
```

---

## `requirements.txt`

```txt
# Web framework
fastapi==0.111.0
uvicorn[standard]==0.30.1
pydantic==2.7.1
pydantic-settings==2.3.1

# Database
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
alembic==1.13.1

# Task queue
celery==5.4.0
redis==5.0.6

# Storage
boto3==1.34.130

# AI
openai==1.35.0
httpx==0.27.0
elevenlabs==1.2.0     # ElevenLabs SDK (for Scribe)

# Video processing
yt-dlp==2024.6.18
opencv-python-headless==4.9.0.80
mediapipe==0.10.14
PySceneDetect[opencv]==0.6.3
scipy==1.11.4

# Audio
noisereduce==3.0.3
soundfile==0.12.1
faster-whisper==1.0.3   # fallback STT

# Image
Pillow==10.3.0
rembg==2.0.57
numpy==1.26.4

# Utilities
requests==2.31.0
python-multipart==0.0.9
python-jose[cryptography]==3.3.0   # JWT
passlib[bcrypt]==1.7.4
```

---

## Starting Services (Dev)

```bash
# Terminal 1: Docker containers (DB, Redis, MinIO)
docker compose up -d

# Terminal 2: FastAPI backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3: Celery worker
cd backend
source .venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info --pool=solo

# Terminal 4: Frontend
cd frontend
npm run dev
```

---

## `backend/app/main.py` (router registration)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .routers import (
    ingest, captions, style_clone, text_editor,
    enhance, imagegen, reframe, clips, workspace,
)

app = FastAPI(title="ViraEdit API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.next_public_api_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(ingest.router)
app.include_router(captions.router)
app.include_router(style_clone.router)
app.include_router(text_editor.router)
app.include_router(enhance.router)
app.include_router(imagegen.router)
app.include_router(reframe.router)
app.include_router(clips.router)
app.include_router(workspace.router)

@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
```

---

## Production: Nginx Config (`/etc/nginx/conf.d/viraedit.conf`)

```nginx
server {
    listen 80;
    server_name viraedit.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name viraedit.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/viraedit.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/viraedit.yourdomain.com/privkey.pem;

    # Large uploads (2GB for video)
    client_max_body_size 2G;
    client_body_timeout 600s;
    proxy_read_timeout 600s;

    # FastAPI backend
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support (for future real-time features)
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Next.js frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Production: Celery as Systemd Service

```ini
# /etc/systemd/system/viraedit-worker.service
[Unit]
Description=ViraEdit Celery Worker
After=network.target docker.service

[Service]
Type=forking
User=mkarki
WorkingDirectory=/home/mkarki/viraedit/backend
Environment="PATH=/home/mkarki/viraedit/backend/.venv/bin:/home/mkarki/.local/bin:/usr/bin"
ExecStart=/home/mkarki/viraedit/backend/.venv/bin/celery \
    -A app.tasks.celery_app worker \
    --loglevel=info \
    --pool=prefork \
    --concurrency=2 \
    --logfile=/tmp/viraedit/logs/celery.log \
    --detach
ExecStop=/home/mkarki/viraedit/backend/.venv/bin/celery \
    -A app.tasks.celery_app control shutdown
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable viraedit-worker
sudo systemctl start viraedit-worker
```

---

## Production: Uvicorn as Systemd Service

```ini
# /etc/systemd/system/viraedit-api.service
[Unit]
Description=ViraEdit FastAPI
After=network.target

[Service]
Type=simple
User=mkarki
WorkingDirectory=/home/mkarki/viraedit/backend
Environment="PATH=/home/mkarki/viraedit/backend/.venv/bin:/home/mkarki/.local/bin:/usr/bin"
ExecStart=/home/mkarki/viraedit/backend/.venv/bin/uvicorn \
    app.main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## `backend/app/database.py`

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from .config import settings

engine = create_async_engine(
    settings.database_url,   # postgresql+asyncpg://...
    pool_size=settings.database_pool_size,
    max_overflow=settings.database_max_overflow,
    echo=settings.app_debug,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

---

## Job Status Helper (sync for Celery, async for FastAPI)

```python
# backend/app/models/job.py
from sqlalchemy import create_engine, Column, String, JSON, Text, DateTime
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func
from ..database import Base
from ..config import settings
import uuid

class Job(Base):
    __tablename__ = "jobs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
    status = Column(String, default="queued")
    project_id = Column(String)
    workspace_id = Column(String)
    payload = Column(JSON)
    result = Column(JSON)
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

# Sync session for Celery workers (can't use async in Celery tasks easily)
_sync_url = settings.database_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
_sync_engine = create_engine(_sync_url, pool_pre_ping=True)
_SyncSession = sessionmaker(bind=_sync_engine)

def update_job_sync(job_id: str, status: str = None, result: dict = None, error: str = None):
    with _SyncSession() as session:
        job = session.get(Job, job_id)
        if not job: return
        if status: job.status = status
        if result is not None: job.result = result
        if error: job.error = error
        session.commit()
```

> Note: Add `psycopg2-binary` to requirements.txt for sync Celery DB access.

---

## Checklist for Cursor

- [ ] `docker-compose.yml` updated — postgres 5433, redis 6379, minio 9000/9001
- [ ] `backend/app/main.py` with all routers registered
- [ ] `backend/app/database.py` with async engine + sync engine for Celery
- [ ] `backend/app/models/job.py` with `update_job_sync`
- [ ] `requirements.txt` with all packages listed
- [ ] MinIO bucket creation script
- [ ] Nginx config for production
- [ ] Systemd services for uvicorn + celery
- [ ] `alembic.ini` configured for `postgresql+asyncpg` URL
- [ ] `psycopg2-binary` in requirements for sync Celery sessions
- [ ] `/tmp/viraedit/` dirs created and in tmpfiles.d
- [ ] All FFmpeg paths use `settings.ffmpeg_path` = `/home/mkarki/.local/bin/ffmpeg`