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
   When the user says "let's continue phase" (or "continue phase"), use the
   phases-order.json and build_state.py --phases mode to track and build the
   17 phases (00-16) from the phase-*/ folders.
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

## Implementation Order — Two Tracks

### Track A: 10 Ordered Modules (original build)
The build is driven by `skills-order.json`. Each entry references a skill file.
The agent reads `build_state.py` to find the current module index, then loads the corresponding skill file.
Trigger: "continue", "next task", "keep going"

### Track B: 17 Phases (new cursor-style phases)
The phases build is driven by `phases-order.json` in the skills root.
Each phase lives in its own directory (`phase-0-foundation/` through `phase-16-production-completeness/`) containing a `SKILL.md`.
Read `00-NORTH-STAR.md` before any phase — it defines the product vision.
Use `python scripts/build_state.py --phases` to show/advance phase state.
Trigger: "let's continue phase", "continue phase"

| # | Phase | File | What it delivers |
|---|-------|------|------------------|
| 00 | Foundation: Asset Library & Tagging | `phase-0-foundation/SKILL.md` | Structured asset library with machine-readable tags |
| 01 | Style Intelligence v2 | `phase-1-style-intelligence/SKILL.md` | Gemini "Director's Blueprint" (visual + audio fingerprint) |
| 02 | Asset Gap Resolution | `phase-2-asset-gap-resolution/SKILL.md` | Match/generate assets for template slots |
| 03 | Shorts/Reels Extraction | `phase-3-shorts-extraction/SKILL.md` | Platform-correct short-form clip extraction |
| 04 | Chapter Extraction | `phase-4-chapter-extraction/SKILL.md` | Standalone downloadable chapter clips |
| 05 | Sizzle/Trailer | `phase-5-sizzle-trailer/SKILL.md` | Fast-cut highlight reel generation |
| 06 | One-Click Apply | `phase-6-one-click-apply/SKILL.md` | Non-editor end-to-end user flow |
| 07 | AI Spend Meter | `phase-7-ai-spend-meter/SKILL.md` | Live per-action AI cost visibility |
| 08 | Fine-Tuning & Audit | `phase-8-fine-tuning-audit/SKILL.md` | Hardening pass on all existing modules |
| 09 | Remotion Rendering | `phase-9-remotion-rendering/SKILL.md` | React-based caption & motion graphics pipeline |
| 10 | Style Extractor Fix | `phase-10-Style-Extractor-fix/SKILL.md` | Capability Registry, gap report & renderer improvements |
| 11 | Director-Styled Shorts & Sizzle | `phase-11-director-styled-shorts/SKILL.md` | Route Shorts/Sizzle through Director pipeline for styled platform-ready clips |
| 12 | Long-Form AI Analysis Scaling | `phase-12-Analysis-scaling/SKILL.md` | Chunked signal extraction for long videos with boundary reconciliation |
| 13 | Long-Form Storage Efficiency | `phase-13-Storage-Efficiency/SKILL.md` | Binary per-frame storage and windowed Timeline access |
| 14 | Long-Form Render Scaling | `phase-14-Render-Scaling/SKILL.md` | Parallel segmented rendering, resumable exports, cost estimation |
| 15 | Long-Form Editor Performance | `phase-15-Editor-Performance/SKILL.md` | Viewport windowing, diff-based undo, waveform caching |
| 16 | Production Completeness | `phase-16-production-completeness/SKILL.md` | Coverage audit, fallback guarantees, style depth, B-roll thresholds, readiness gate |

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
