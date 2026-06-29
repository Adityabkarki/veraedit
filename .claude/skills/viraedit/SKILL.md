---
name: viraedit
description: >
  Build ViraEdit — an AI-native video editing platform optimized for Nepali-language
  content on Windows. Use this skill whenever the user says "continue", "next phase",
  "build viraedit", "next task", or "keep going" during ViraEdit development.
  This skill drives the entire phase-by-phase construction of the app from zero to
  a fully working local application. PRIMARY LANGUAGE: Nepali (Devanagari script).
  The AI pipeline must understand Nepali speech, culture, idioms, and context.
  The UI must be the most intuitive video editor a non-technical Nepali creator
  has ever used — simpler than CapCut, smarter than Premiere. Each invocation
  completes exactly one epic with all tasks, tests, and error logging included.
  ALWAYS use this skill when the user says "continue" if ViraEdit context exists.
---

# ViraEdit — Master Overview

## Platform Vision
ViraEdit is a self-hosted, full-stack AI video editing platform built for non-editors. It targets podcasters, consultancy firms, and IT companies who need to produce short clips, chapter videos, branded reels, and social-ready content without depending on external tools. It combines a Next.js frontend with a Python FastAPI backend.

---

## Where Skills Live
All SKILL.md and reference files are in `.claude/skills/viraedit/`.

The build state tracker is at `.claude/skills/viraedit/scripts/build_state.py`.

---

## Canonical Tech Stack

### Frontend
- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (class-variance-authority, Radix primitives)
- **State:** Zustand for editor state; React Query for server state
- **HTTP:** Fetch API wrapped in lib/ utilities
- **Testing:** Vitest + React Testing Library + MSW
- **Editor Canvas:** Custom React components (no Fabric.js)
- **Video Playback:** Native `<video>` with React wrapper

### Backend API
- **Runtime:** Python 3.11+ FastAPI (async)
- **ORM:** SQLAlchemy 2.0 (async) + Alembic migrations
- **Database:** PostgreSQL 16 + pgvector
- **Job Queue:** Celery + Redis (4 queues: transcription, analysis, render, ai)
- **Auth:** JWT (access + refresh tokens)
- **File Storage:** MinIO (S3-compatible, pre-signed URL upload)
- **WebSocket:** Redis pub/sub → FastAPI WebSocket forwarder
- **Logging:** structlog (pretty dev, JSON prod)
- **Testing:** pytest + pytest-asyncio + httpx + respx

### AI Services (all in apps/api)
- **Transcription:** ElevenLabs Scribe v2 (primary), Groq Whisper (fallback)
- **LLM Analysis:** Groq Llama 3.3 70B (primary), OpenAI GPT-4o-mini (fallback), Anthropic Claude (premium)
- **Audio:** librosa, pydub, noisereduce
- **Video/Scene:** FFmpeg (system), opencv-python, PySceneDetect
- **Style Transfer:** yt-dlp, easyocr, scikit-image
- **Speaker Diarization:** pyannote.audio
- **Local LLM:** Ollama (optional, fully offline fallback)
- **Image Gen:** Not yet implemented (future: Groq or local diffusers)

### Infrastructure
- Docker Compose (PostgreSQL, Redis, MinIO — services only)
- No Docker for API/worker (run natively on Windows for GPU access)
- Nginx (optional, for production)

---

## Project Folder Structure

```
veraedit/
├── .claude/
│   └── skills/viraedit/          # ← All agent skills live here
│       ├── SKILL.md              # This file — master overview
│       ├── CLAUDE.md             # Agent instructions & hard rules
│       ├── references/           # Architecture, phase-map, style-transfer, etc.
│       │   ├── architecture.md
│       │   ├── phase-map.md          # All epics 0–5 with tasks
│       │   ├── tech-decisions.md
│       │   ├── style-transfer.md
│       │   ├── windows-setup.md
│       │   └── ... (14 reference files)
│       └── scripts/
│           └── build_state.py    # Tracks current epic
├── apps/
│   ├── web/                      # Next.js 15 frontend
│   │   ├── app/                  # App Router pages
│   │   │   ├── (app)/            # Authenticated app layout
│   │   │   ├── (auth)/           # Login/signup
│   │   │   ├── page.tsx          # Landing
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── editor/           # Timeline, canvas, toolbar
│   │   │   ├── caption-editor/   # Caption style picker
│   │   │   └── brand/            # Brand kit UI
│   │   ├── hooks/                # Custom React hooks
│   │   ├── stores/               # Zustand stores
│   │   ├── lib/                  # Utilities, API client layer
│   │   └── __tests__/
│   └── api/                      # Python FastAPI (single service)
│       ├── routers/              # Route handlers (auth, projects, assets, etc.)
│       ├── tasks/                # Celery task definitions (transcribe, analyze, etc.)
│       ├── services/             # Business logic (storage, cost, etc.)
│       ├── models/               # SQLAlchemy ORM models
│       ├── schemas/              # Pydantic request/response schemas
│       ├── ws/                   # WebSocket manager + Redis forwarder
│       ├── alembic/              # DB migrations
│       ├── main.py               # FastAPI app entry point
│       ├── config.py             # Pydantic Settings (env vars)
│       ├── database.py           # Async engine + session factory
│       ├── celery_app.py         # Celery app + routing
│       └── storage.py            # MinIO pre-signed URL service
├── packages/
│   └── timeline/                 # Shared timeline engine (pure TS)
├── infra/
│   └── docker/
│       ├── docker-compose.yml    # PostgreSQL, Redis, MinIO
│       ├── docker-compose.dev.yml
│       └── Dockerfile.api / worker
├── scripts/                      # .bat + .ps1 Windows helpers
├── tests/                        # Python tests (unit, integration, e2e, fixtures)
├── package.json                  # Turborepo root
└── turbo.json
```

---

## API Contract (Frontend ↔ FastAPI)

All async jobs follow this pattern:

1. Frontend calls `POST /api/jobs` → `{ jobId }`
2. API enqueues in Celery → returns `{ jobId, status: "pending" }`
3. Celery task runs (calls AI services, FFmpeg, etc.)
4. Progress updates sent via WebSocket (Redis pub/sub → WS forwarder)
5. Frontend polls `GET /api/tasks/:taskId` or listens on WebSocket
6. Result stored in MinIO / DB; frontend receives result URL

Pre-signed upload flow:

1. Client → `POST /api/assets` → API creates Asset record, returns pre-signed PUT URL
2. Client → `PUT <minio_url>` → file uploaded directly to MinIO (no API bottleneck)
3. Client → `POST /api/assets/confirm` → API verifies object exists, sets status=UPLOADED

---

## Environment Variables (`.env` root)

```env
# Database
DATABASE_URL=postgresql+asyncpg://viraedit:viraedit_dev_password@localhost:5432/viraedit

# Redis
REDIS_URL=redis://localhost:6379/0

# Object Storage (MinIO / S3)
S3_ENDPOINT_URL=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin123
S3_BUCKET_MEDIA=viraedit-media
S3_BUCKET_RENDERS=viraedit-renders
S3_BUCKET_TEMP=viraedit-temp

# Auth (JWT)
JWT_SECRET_KEY=dev-secret-change-in-production-please
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# AI — Groq (primary LLM + transcription)
GROQ_API_KEY=...

# AI — ElevenLabs Scribe (primary STT)
ELEVENLABS_API_KEY=...
ELEVENLABS_STT_MODEL=scribe_v2

# AI — OpenAI (text analysis fallback)
OPENAI_API_KEY=...

# AI — Anthropic (premium only)
ANTHROPIC_API_KEY=...

# Celery (Windows)
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_WORKER_POOL=solo

# Nepali STT (hard-coded — always "ne")
WHISPER_LANGUAGE=ne

# Fonts (Devanagari — for video caption rendering only)
DEVANAGARI_FONT_PATH=C:/Windows/Fonts/NotoSansDevanagari-Regular.ttf

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Implementation Order (10 Ordered Modules)

The build is driven by `skills-order.json`. Each entry references a skill file.
The agent reads `build_state.py` to find the current module index, then loads the corresponding skill file.

| # | Module | Skill File | What it delivers |
|---|--------|------------|------------------|
| 01 | Ingestion | `01-ingestion.md` | Accept URL/file upload; download + extract |
| 02 | Style Cloning | `02-style-cloning.md` | Analyze reference video; extract style template |
| 03 | Captions | `03-captions.md` | Transcription; Nepali + English; animated captions |
| 04 | Text Editor | `04-text-editor.md` | Edit transcript → auto-cut video, silence/filler removal |
| 05 | AI Enhancements | `05-ai-enhancements.md` | Color grading, audio leveling, background removal, B-roll |
| 06 | Image Gen | `06-image-gen.md` | LLM-based image generation inside editor |
| 07 | Reframe & Export | `07-reframe-export.md` | Auto-reframe; multi-platform export; auto-zoom |
| 08 | Smart Clips | `08-smart-clips.md` | Long video → viral clips; chapter detection; highlights |
| 09 | Brand Workspace | `09-brand-workspace.md` | Per-workspace brand kit: fonts, colors, logos, templates |
| 10 | Deployment | `10-deployment.md` | Docker Compose + Nginx + VPS deploy; workers; storage |

Read `skills-order.json`, `build_state.py`, and the current module's skill file.
Existing `references/phase-map.md` can supplement with detailed tasks.

---

## Hard Rules (from CLAUDE.md)

1. All file paths use `pathlib.Path` — never hardcoded backslashes
2. Celery workers always use `--pool=solo` on Windows
3. FFmpeg always receives `path.as_posix()` — not `str(path)`
4. Noto Sans Devanagari font — only in caption rendering, not UI
5. Whisper always called with `language="ne"`
6. Every function has at least one test
7. Every error message is human-readable English
8. All runnable scripts provided as `.bat` files
