# ViraEdit — Product Documentation & Architecture Overview

> AI-native video editing platform for Nepali content creators.
> Last updated: July 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Features & Implementation Status](#3-features--implementation-status)
4. [Tech Stack](#4-tech-stack)
5. [AI/ML Pipeline](#5-aiml-pipeline)
6. [Video Rendering Pipeline](#6-video-rendering-pipeline)
7. [Editor Architecture](#7-editor-architecture)
8. [Backend Services & APIs](#8-backend-services--apis)
9. [Remotion Service](#9-remotion-service)
10. [Database Schema](#10-database-schema)
11. [Testing Infrastructure](#11-testing-infrastructure)
12. [Known Limitations](#12-known-limitations)
13. [Future Work & Roadmap](#13-future-work--roadmap)
14. [Running the Project](#14-running-the-project)

---

## 1. Project Overview

ViraEdit is an AI-native, browser-based video editing platform purpose-built for Nepali-language content creators. It provides:

- **URL-based ingestion** from YouTube, TikTok, Instagram
- **Automatic transcription** in Nepali (Devanagari script) via ElevenLabs Scribe v2
- **Speaker diarization** via pyannote.audio
- **AI-powered editing**: auto-cuts, style transfer, B-roll insertion, motion graphics, color grading
- **Multi-track non-linear editor** with 9 tracks
- **Automated content reformatting**: Shorts extraction, chapter detection, sizzle reels
- **Remotion-powered animated overlays**: captions, title cards, lower thirds, full Director compositions
- **AI budget controls** with hard spending limits and local fallback

### Repository Structure

```
veraedit/
├── apps/
│   ├── web/              # Next.js 15 frontend (port 3000)
│   └── api/              # FastAPI Python backend (port 8000)
├── packages/
│   └── timeline/         # @viraedit/timeline — shared TS types & Zod validation
├── remotion-service/     # Node.js/Express + Remotion renderer (port 3500)
├── infra/docker/         # Docker Compose (PostgreSQL, Redis, MinIO)
├── scripts/              # Helper & validation scripts
├── tests/                # Python test suite (unit, integration, e2e)
└── skills.md             # Remotion component architecture laws
```

---

## 2. Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Browser     │────▶│  Next.js 15  │◀────│  FastAPI Backend  │
│  (React 19)  │     │  (port 3000) │     │  (port 8000)      │
│              │     │              │     │                   │
│  Zustand     │     │  @remotion/  │     │  Celery Workers   │
│  stores (21) │     │  player      │     │  (4 queues)       │
└─────────────┘     └──────┬───────┘     └────────┬──────────┘
                           │                       │
                           │  WebSocket            │ HTTP
                           ▼                       ▼
                    ┌──────────────┐     ┌──────────────────┐
                    │  Remotion    │     │  PostgreSQL 16    │
                    │  Service     │     │  + pgvector       │
                    │  (port 3500) │     │                   │
                    │              │     │  Redis 7          │
                    │  Headless    │     │                   │
                    │  Chromium    │     │  MinIO (S3)       │
                    └──────────────┘     └──────────────────┘
```

### Data Flow

```
Upload URL → yt-dlp → Proxy generation → Transcription (ElevenLabs)
  → Diarization (pyannote) → Analysis pipeline → Editor ready
                                                      │
Editor Timeline (Zustand) ─▶ API PUT /timeline ─▶ Celery render task
                                                      │
Director Engine: signals → cuts → compile ─▶ Remotion preview/export
```

### Monorepo Tooling

- **npm workspaces** — package management across `apps/*`, `packages/*`
- **Turborepo** — build orchestration (`turbo.json`)
- **Docker Compose** — local dev infrastructure

---

## 3. Features & Implementation Status

### Phase 00 — Ingestion & Asset Pipeline ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| URL download (YouTube, TikTok, Instagram) | ✅ Done | yt-dlp with canary monitoring |
| Direct file upload | ✅ Done | Pre-signed URL → MinIO, no server relay |
| Proxy generation (540p H.264) | ✅ Done | For editor preview |
| Transcription via ElevenLabs Scribe v2 | ✅ Done | Nepali `ne` forced, quality metrics |
| Speaker diarization (pyannote.audio) | ✅ Done | Heuristic fallback for pause-based |
| Asset pipeline (upload → proxy → transcribe → analyze) | ✅ Done | Celery orchestration |
| Asset tagging (AI) | ✅ Done | Via LLM |
| Job status polling | ✅ Done | REST + WebSocket events |

### Phase 01 — Style ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Style extraction from reference video | ✅ Done | Gemini Vision + OpenCV |
| Style cloning to template | ✅ Done | Color, fonts, caption style, music genre |
| Brand theme service | ✅ Done | Brand kit → ThemeToken conversion |
| Style intelligence API | ✅ Done | AI style analysis |

### Phase 02 — Asset Matching & Templates ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Asset matching with threshold scoring | ✅ Done | 0.75 exact / 0.45 partial (tunable) |
| Template schema & render | ✅ Done | FFmpeg + Remotion |
| Library assets | ✅ Done | Reusable asset storage |

### Phase 03 — Shorts ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Viral clip detection | ✅ Done | Hook scoring, retention analysis |
| Platform-specific scoring | ✅ Done | YouTube, Instagram, TikTok, LinkedIn |
| Short extraction | ✅ Done | Precise re-encode |
| Short rendering | ✅ Done | Vertical export |

### Phase 04 — Chapters & Scenes ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Scene detection | ✅ Done | scenedetect[opencv] + LLM topic analysis |
| Chapter extraction | ✅ Done | With titles and summaries |
| Chapter management UI | ✅ Done | Editor chapter view |

### Phase 05 — Director Engine ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Signal extraction from transcript | ✅ Done | Topic shifts, speaker changes, stat mentions |
| Pacing-aware cut planning | ✅ Done | relaxed/balanced/aggressive profiles |
| Timeline compilation | ✅ Done | Editor → Director format bridge |
| Timeline validation | ✅ Done | Schema + business rules |
| Multi-camera sync | ✅ Done | Audio cross-correlation |
| Trigger-driven assembly | ✅ Done | Density throttling, confidence ranking |
| Preview/export parity | ✅ Done | Single composition path |

### Phase 06 — Template Rendering ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Template filler UI | ✅ Done | |
| FFmpeg template render | ✅ Done | `drawtext` for simple burn-in |
| Motion graphics render | ✅ Done | Remotion-powered |

### Phase 07 — AI Budget & Cost Tracking ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| AI budget hard limit ($2/hr video) | ✅ Done | |
| Per-action cost tracking | ✅ Done | `ai_spend_records` table |
| Local fallback (Ollama) | ✅ Done | Weaker but free |
| Warning thresholds | ✅ Done | $1.60/hr warn, $0.80/min local switch |

### Phase 08 — Reliability & Testing ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Unit tests (103 files) | ✅ Done | Async pytest |
| Integration tests (21 files) | ✅ Done | Docker services required |
| Canary download monitoring | ✅ Done | Weekly script |
| Known limitations doc | ✅ Done | Published |

### Phase 09 — Remotion Overlays ✅ COMPLETE

| Feature | Status | Details |
|---------|--------|---------|
| Caption overlay (VP8 alpha) | ✅ Done | Remotion with ASS/FFmpeg fallback |
| Title card overlay | ✅ Done | |
| Lower third overlay | ✅ Done | |
| Motion graphics composition | ✅ Done | Atomic components, audio-reactive |
| Director Render composition | ✅ Done | Video + graphics + VFX + grade + audio |
| Editor timeline bridge | ✅ Done | editor → Director format |
| 4 Content pillars (Podcast, Consultancy, Social, Showcase) | ✅ Done | Theme-driven, deterministic |

### Current Frontend Features (Web App)

| Feature | Details |
|---------|---------|
| Multi-track NLE timeline | 9 tracks: Video, Camera, B-Roll, Audio, Captions, Caption FX, Elements, Effects, Music |
| Playhead synchronization | Across video, timeline, text editor |
| Transcript-based text editing | Word-level cuts from transcript |
| AI suggestion panel | Auto-edit, style, b-roll, effects |
| Effects editor | CSS filters, transitions, speed curves, keyframes |
| Motion graphics panel | Atomic components, presets |
| B-roll panel | Stock search, gap resolution |
| Shorts mode | Viral clip detection |
| Chapters mode | Scene management |
| Export modal | Format, resolution, platform selection |
| Authentication | JWT with refresh tokens |
| Dashboard | Project listing and management |
| Keyboard shortcuts | For editing workflows |

---

## 4. Tech Stack

### Frontend

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 15 |
| UI Library | React | 19 |
| Language | TypeScript | 5.6 |
| Styling | Tailwind CSS | 3.4 |
| Icons | lucide-react | 0.446 |
| UI Primitives | Radix UI, class-variance-authority | |
| State (client) | Zustand | 4.5 |
| State (server) | TanStack React Query | 5 |
| Forms | react-hook-form + zod | |
| Video player | @remotion/player | 4.0.484 |
| Animations | Remotion | 4.0.484 |
| Toast notifications | sonner | 1.5 |
| Packaging | npm workspaces + Turborepo | |

### Backend

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | FastAPI | 0.115 |
| Language | Python | 3.11+ |
| Runtime | Uvicorn | |
| ORM | SQLAlchemy 2.0 (async) | |
| Migrations | Alembic | 17 migration files |
| Database | PostgreSQL 16 + pgvector | |
| Cache/Broker | Redis 7 | |
| Task Queue | Celery 5.4 | 4 queues |
| Object Storage | MinIO (S3-compatible) | |
| Auth | JWT (access + refresh), bcrypt | |

### Remotion Service

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Express | 4.21 |
| Rendering | Remotion + @remotion/renderer | 4.0.484 |
| Bundler | @remotion/bundler | |
| CLI | @remotion/cli | |
| Codec | VP8 (alpha), H.264 | |
| Transitions | @remotion/transitions | |

### Infrastructure

| Service | Image | Port |
|---------|-------|------|
| PostgreSQL | pgvector/pgvector:pg16 | 5433 |
| Redis | redis:7-alpine | 6379 |
| MinIO | minio/minio:latest | 9000 (API), 9001 (Console) |

---

## 5. AI/ML Pipeline

### Transcription (Speech-to-Text)

```
Audio/Video → ElevenLabs Scribe v2 → Word-level timestamps → Devanagari quality check
                                          │
                                    Language detection
                                    (Nepali forced, code-switching flagged)
```

- **Primary:** ElevenLabs Scribe v2 (Nepali `ne`, forced)
- **Cost:** ~$0.50/hour
- **Quality checks:** Devanagari ratio, confidence-based language detection
- **Code-switching:** Mixed Nepali/English reduces accuracy; flagged via `language_warning`

### LLM Services

| Provider | Model | Purpose | Priority |
|----------|-------|---------|----------|
| OpenAI | GPT-4o-mini | Text analysis, suggestions, hooks, editing | Primary |
| Anthropic | Claude (optional) | Premium hook rewrites | Secondary |
| Google Gemini | 2.0 Flash / 2.5 Flash | Vision style analysis, image generation | Vision tasks |
| Ollama | Local Llama | Offline fallback (weaker JSON quality) | Fallback only |

### Speaker Diarization

```
Audio → pyannote.audio 3.1 → Speaker segments → Word-level speaker labels
  │
  └── Fallback: Heuristic pause-based alternation
```

- **Requires:** HuggingFace token for pyannote
- **Heuristic fallback:** Simple pause gap detection when pyannote unavailable

### Image Generation

- **DALL-E 3** — Primary image generation (OpenAI)
- **Gemini Image** — Alternative
- **Pexels** — Stock footage/b-roll search (preferred when configured)

### Style Analysis

- **Google Gemini Vision** — Primary for style extraction from reference videos
- **OpenCV** — Fast visual feature extraction (default for quick analysis)
- **EasyOCR** — Optional OCR extraction (CPU-heavy, disabled by default)

### Audio Analysis (Reactive Motion Graphics)

```
Path A (≤3 min clips): getAudioData → client-side FFT → frequency bands
Path B (>3 min): Celery + librosa STFT → RMS + mel bands
```

- Used for audio-reactive motion graphics (equalizers, waveforms)
- **Client Path A:** `@remotion/media-utils` for short clips
- **Server Path B:** Server-side librosa analysis for long-form content

### AI Budget Enforcement

```
Per-project hard limit: $2.00/hour of video
Warning threshold: $1.60/hour
Switch-to-local threshold: $0.80/minute
```

- Every AI action tracked in `ai_spend_records` table
- Hard cut-off when budget exceeded
- Graceful degradation to local Ollama models

---

## 6. Video Rendering Pipeline

### FFmpeg (Core Video Operations)

| Operation | Method | Speed | Accuracy |
|-----------|--------|-------|----------|
| Stream copy cuts | `-c copy` | Fast | ~1s keyframe drift |
| Precise cuts | `force_reencode=True` | Slow | Sub-second accuracy |
| Caption burn-in | ASS/FFmpeg drawtext | Fast | Frame-accurate |
| Proxy generation | 540p H.264 | Medium | Preview quality |
| Concatenation | FFmpeg concat | Fast | Lossless |

### Remotion (Animated Overlays)

```
Express server → @remotion/bundler (webpack bundle) → @remotion/renderer (Chromium) → Video
```

| Render Type | Codec | Use Case |
|-------------|-------|----------|
| Caption overlay | VP8 with alpha channel | Animated word highlighting |
| Title card | H.264 | Intro/outro titles |
| Lower third | H.264 | Speaker name, context |
| Motion graphics | H.264 | Charts, overlays, animations |
| Director composition | H.264 | Full video + graphics + VFX + audio |

### Editor Cut Types

| Mode | Description | When Used |
|------|-------------|-----------|
| `-c copy` | Keyframe-aligned, fast | Chapter-length cuts, rough edits |
| Precise (re-encode) | Sub-second accuracy, slow | Shorts, sizzle, trim handles |

### Rendering Workflow

```
Editor Timeline (Zustand)
  → API PUT /timeline (save)
  → POST /api/v1/renders (queue)
  → Celery render task
    → FFmpeg: extract segments, apply cuts
    → Remotion: render overlays if needed
    → FFmpeg: composite video + overlays
    → Upload to MinIO
  → WebSocket: render complete
```

---

## 7. Editor Architecture

### Component Hierarchy

```
EditorLayout (3-panel resizable)
├── LeftPanel
│   ├── MediaPanel — Asset browser & upload
│   ├── TranscriptEditor — Word-level transcript text editing
│   ├── ScenesPanel — Chapter/scene list
│   └── VisualLibraryPanel — Reusable assets
├── VideoPreview (Remotion Player)
│   ├── DirectorRemotionPreview (unified preview)
│   ├── CaptionOverlay
│   ├── VisualOverlayLayer
│   └── BrollPreviewUpload
├── RightPanel
│   ├── AIPanel — AI suggestions
│   ├── AIDirectorPanel — Director Engine controls
│   ├── TextEditor — Text-based editing
│   ├── Effects — Filters, transitions
│   ├── MotionGraphics — Atomic components
│   ├── Broll — Stock search
│   └── CaptionStyle — Caption appearance
└── Timeline (multi-track NLE)
    ├── 9 tracks: Video, Camera, B-Roll, Audio, Captions,
    │   Caption FX, Elements, Effects, Music
    ├── Clip dragging, trimming, splitting
    ├── Zoom & snap
    ├── Markers & regions
    ├── Keyframe editor
    └── Undo/redo (50 levels)
```

### State Management (21 Zustand Stores)

| Store | Persisted | Purpose |
|-------|-----------|---------|
| authStore | localStorage | User, JWT tokens, login state |
| editorStore | localStorage | Panel sizes, layout mode, active tab |
| timelineStore | Partial | Clips, tracks, playhead, undo/redo |
| playerStore | No | Video playback state |
| projectStore | No | Current project |
| directorStore | No | Director compiled timeline |
| captionsStore | No | Caption edits |
| mediaStore | No | Asset list |
| shortsStore | No | Viral clip candidates |
| effectsStore | No | CSS filters |
| scenesStore | No | Scene/chapter data |
| transcriptStore | No | Word-level transcript |
| suggestionsStore | No | AI suggestions |
| uiStore | No | UI modals, sidebars |
| highlightsStore | No | Highlight clips |
| autoEditStore | No | Auto-pipeline state |
| producerStore | No | Producer mode |
| imageLayerStore | No | Image overlays |
| onboardingStore | localStorage | Onboarding progress |
| visualLibraryStore | No | Visual assets |
| assetStore | No | Current asset |

---

## 8. Backend Services & APIs

### API Structure (`/api/v1/`)

```
Auth:          POST register, login, refresh, logout | GET me
Ingestion:     POST url, upload | GET jobs/{id}
Projects:      CRUD /projects
Assets:        CRUD /assets | POST confirm
Timelines:     GET/PUT /timeline | GET versions
Captions:      POST transcribe | POST render
Director:      POST signals, cuts, compile, validate, multicam/sync
Shorts:        GET/POST /shorts | POST render
Chapters:      GET /chapters | POST extract
Sizzle:        GET /sizzle | POST generate
Styles:        POST extract, clone, intelligence
B-Roll:        POST search, insert
MotionGraphics: POST render
Renders:       CRUD /renders | POST cancel
Templates:     CRUD /templates
Costs:         GET /costs
AI Spend:      GET /ai-spend
WebSocket:     WS /ws (real-time events via Redis pub/sub)
```

### Backend Services (`apps/api/services/`)

| Service | Purpose |
|---------|---------|
| `ai_budget.py` | Budget enforcement, local fallback switching |
| `ai_costs.py` | Per-action cost calculation |
| `asset_pipeline.py` | Upload → proxy → transcribe → analyze |
| `audio_analysis_service.py` | Server-side STFT analysis (librosa) |
| `brand_theme_service.py` | Brand kit → ThemeToken |
| `cuts/` | Cut planning, pacing profiles |
| `diarization/` | Speaker labeling (pyannote + heuristic) |
| `director/` | Signal extraction, compile, validation |
| `motion_graphics_service.py` | Legacy motion graphics (pre-Director) |
| `multicam/` | Audio cross-correlation sync |

### Celery Workers (4 queues)

| Queue | Tasks |
|-------|-------|
| `transcription` | Transcribe, post-process, quality check |
| `analysis` | Scene detect, short analyze, style extract, b-roll |
| `render` | Video render, template render, export |
| `ai` | LLM calls, suggestions, director compile |

### WebSocket Events

Real-time push for: job status, render progress, transcript ready, analysis complete.
Redis pub/sub → WebSocket forwarder → browser.

---

## 9. Remotion Service

### Service Overview

The Remotion service is a standalone Node.js Express server that renders animated video overlays using Remotion (headless Chromium).

**Location:** `remotion-service/` (not part of npm workspace — separate `package.json`, `package-lock.json`, `node_modules`)

**Registered Compositions (18):**

| ID | Purpose |
|----|---------|
| CaptionOverlay | Animated word captions (VP8 alpha) |
| TitleCardOverlay | Intro/outro titles |
| LowerThirdOverlay | Lower third graphics |
| MotionGraphicsOverlay | Generic motion graphics plan |
| DirectorRender | Full Director composition (video + graphics + VFX + grade + audio) |
| PodcastPillarPreview | Podcast content pillar |
| ConsultancyPillarPreview | Consultancy content pillar |
| SocialPillarPreview | Social media content pillar |
| ShowcasePillarPreview | Product showcase content pillar |
| PodcastPresetPreview | Podcast preset |
| ConsultancyPresetPreview | Consultancy preset |
| SocialPresetPreview | Social preset |
| ProductShowcasePresetPreview | Product showcase preset |
| AudioEqualizerDebugStill | Debug visualization |
| PodcastAudioComparisonPreview | Audio comparison |

### Remotion Component Architecture (from skills.md)

**4 Content Pillars:** Podcast, Consultancy, Social Media, Product Showcase
**Layer Depth Bands:**
| Band | Range | Content |
|------|-------|---------|
| Background | 0–10 | Base video, background gradients |
| Content | 10–45 | Speaker cards, device mockups, charts |
| Graphics Overlay | 45–70 | Captions, equalizers, callouts |
| VFX/Image | 70–85 | Glitch, grain, light leaks, color grade |
| UI Chrome | 85–100 | Branding, subscribe badges, safe guides |

**Animation:** 3 named spring curves — `snappy_spring`, `elegant_glide`, `elastic_overshoot`
**Safe zones:** 9:16 (15% bottom, 10% right), 16:9 (5% action-safe, 10% title-safe)
**Theme-driven:** No hardcoded colors/fonts — all from ThemeToken
**Deterministic:** No `Math.random()`, `Date.now()`, or unseeded randomness

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/render-captions` | Caption overlay (VP8 alpha) |
| POST | `/render-title-card` | Title card |
| POST | `/render-lower-third` | Lower third |
| POST | `/render-motion-graphics` | Motion graphics plan |
| POST | `/render-director` | Full Director render (H.264) |
| POST | `/director/bridge-editor-timeline` | Editor → Director format |
| POST | `/director/compile` | Director compilation |

### Fallback Behavior

When Remotion service is unreachable:
- **Captions:** ASS/FFmpeg fallback runs automatically
- **Title cards:** FFmpeg `drawtext` fallback
- **Motion Graphics/Director:** Not available (requires Remotion)

---

## 10. Database Schema

PostgreSQL 16 with pgvector extension. All models in `apps/api/models/`.

| Model | Table | Key Fields | Purpose |
|-------|-------|------------|---------|
| User | `users` | email, password_hash, display_name | Authentication |
| Project | `projects` | user_id, name, content_type, status, settings(JSONB) | Project container |
| Asset | `assets` | project_id, storage_key, duration_seconds, media_type, status | Video/audio assets |
| Timeline | `timelines` | project_id, data(JSONB), version, is_active | Edit graph |
| DirectorTimeline | `director_timelines` | project_id, data(JSONB), content_type, compiled_at | Director format |
| Transcript | `transcripts` | asset_id, words(JSONB), speakers(JSONB), language | Word-level transcript |
| Scene | `scenes` | asset_id, start_time, end_time, topics, scores | Scene detection |
| Short | `shorts` | asset_id, start_time, end_time, viral_score, platform_scores | Short clips |
| Render | `renders` | project_id, platform, resolution, status, progress | Render jobs |
| Brand | `brands` | user_id, colors(JSONB), fonts(JSONB), style_dna(JSONB) | Brand kits |
| Template | `templates` | name, project_id, data(JSONB), is_public | Cloned templates |
| Job | `jobs` | project_id, type, status, result(JSONB) | Async job tracking |
| Suggestion | `suggestions` | | AI suggestions |
| Highlight | `highlights` | | Highlight clips |
| Cost | `costs` | | Project costs |
| ProjectMedia | `project_media` | | Supplementary media |
| Embedding | `embeddings` | pgvector | Vector embeddings |
| LibraryAsset | `library_assets` | user_id, asset_type, source | Reusable assets |
| AISpendRecord | `ai_spend_records` | project_id, provider, model, cost_usd | AI cost tracking |
| SfxLibraryItem | `sfx_library` | slug, name, category, file_name | Sound effects |

**Migrations:** 17 Alembic migration files in `apps/api/migrations/`.

---

## 11. Testing Infrastructure

### Python Tests (pytest)

- **Config:** `pytest.ini` — async mode auto, custom markers
- **Fixtures:** Session-scoped TestClient in `tests/conftest.py`
- **Markers:** `unit`, `integration`, `e2e`, `nepali`, `windows`, `slow`

| Test Type | Count | Scope |
|-----------|-------|-------|
| Unit | 103 files | Pure logic, no external services |
| Integration | 21 files | Require Docker (PostgreSQL, Redis, MinIO) |
| E2E | Scaffolding | Full pipeline validation |

**Integration tests cover:** Auth, AI spend, asset library, chapters, DB schema, gap resolution, ingest, platform shorts, projects, sizzle, style intelligence, tasks, template render, timeline, WebSocket

### TypeScript Tests (Vitest)

| Package | Environment | Mocking |
|---------|-------------|---------|
| Web | jsdom | MSW |
| Timeline | node | — |
| Remotion | node | — |

### Script-based Validation

| Script | Purpose |
|--------|---------|
| `scripts/canary_download_test.py` | Weekly download reliability check |
| `scripts/func_test_*.py` | Functional tests (render, transcribe, upload) |
| `scripts/validate_director_e2e.py` | Director Engine end-to-end |
| `scripts/verify_elevenlabs_stt.py` | ElevenLabs health check |

**Testing gaps (documented):**
- No E2E Nepali code-switching validation in CI (needs 5+ real podcast samples)
- Integration tests need full DB setup (`asyncpg`)

---

## 12. Known Limitations

*Refer to `KNOWN_LIMITATIONS.md` for full details.*

| Area | Limitation | Severity |
|------|------------|----------|
| **Ingestion** | YouTube/TikTok/Instagram anti-scraping changes may break yt-dlp | High |
| **STT** | Code-switching (Nepali/English) reduces timestamp accuracy | Medium |
| **FFmpeg cuts** | Keyframe drift up to ~1s with `-c copy` | Low |
| **Face tracking** | Wide shots/B-roll without faces → center crop fallback | Low |
| **AI budget** | Local Ollama Llama models weaker at structured JSON | Medium |
| **Asset matching** | Thresholds (0.75/0.45) are starting guesses, not validated | Medium |
| **Remotion** | Service dependency; ASS/FFmpeg fallback for captions only | Medium |
| **Testing** | No E2E Nepali validation in CI; integration needs full DB | Medium |

---

## 13. Future Work & Roadmap

### Director Engine Polish

- Validate Threshold Engineering on production data (asset matching, confidence scores)
- Director Engine validation across all 4 content pillars on real videos
- Density Throttle tuning for each content type
- Trigger log UI (show users "why this graphic appeared here")

### Remotion Enhancements

- All template rendering via Remotion (replace FFmpeg drawtext)
- Performance optimization for long-form video Remotion renders
- GPU-accelerated Chromium rendering

### Platform Expansion

- Multi-platform publishing API
- Collaborative editing
- Mobile companion app

### AI/ML Improvements

- Train/fine-tune a Nepali-specific ASR model (reduce ElevenLabs dependency)
- Real-time preview for Director Engine edits
- More sophisticated trigger detection (ML-based scene importance scoring)

### Infrastructure

- CI/CD pipeline with full integration test suite
- Production deployment configs (Docker Compose → Kubernetes)
- CDN for video delivery
- Database connection pooling tuning

---

## 14. Running the Project

### Prerequisites

- Node.js ≥20
- Python 3.11+
- Docker & Docker Compose
- FFmpeg on PATH

### Terminal 1 — Infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```
PostgreSQL:5433, Redis:6379, MinIO:9000/9001

### Terminal 2 — Backend

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Terminal 3 — Celery Worker

```bash
cd apps/api
source .venv/bin/activate
celery -A celery_app worker --queues=transcription,analysis,render,ai --loglevel=info
```

### Terminal 4 — Frontend

```bash
npm run dev
# http://localhost:3000
```

### Terminal 5 — Remotion Service

```bash
cd remotion-service
npm install
node server.js
# http://127.0.0.1:3500
```

---

## Package Dependency Map

```
apps/web (Next.js 15, React 19)
  ├── @remotion/player ^4.0.484 (video preview)
  ├── @tanstack/react-query ^5 (server state)
  ├── zustand ^4.5 (client state)
  ├── zod ^3.23 (schema validation)
  ├── tailwindcss ^3.4 (styling)
  ├── sonner ^1.5 (toasts)
  ├── onnxruntime-web (ML inference)
  ├── @imgly/background-removal (bg removal)
  └── @viraedit/timeline (workspace: shared types)
        └── zod ^3.23

apps/api (FastAPI, Python 3.11+)
  ├── SQLAlchemy 2.0 async → PostgreSQL 16 + pgvector
  ├── Celery 5.4 → Redis 7
  ├── openai (GPT-4o-mini)
  ├── elevenlabs (Scribe v2)
  ├── anthropic (Claude)
  ├── google-generativeai (Gemini)
  ├── ollama (local Llama)
  ├── pyannote.audio 3.3 (diarization)
  ├── librosa, pydub (audio analysis)
  ├── scenedetect[opencv] (shot detection)
  ├── yt-dlp (URL download)
  ├── boto3 (MinIO/S3)
  └── pytest + factory-boy + respx (testing)

remotion-service (Express, Node.js)
  ├── remotion ^4.0.484 (rendering)
  ├── @remotion/player ^4.0.484
  ├── @remotion/renderer ^4.0.484
  ├── @remotion/bundler ^4.0.484
  ├── @remotion/transitions ^4.0.484
  ├── @remotion/media-utils ^4.0.484
  └── @remotion/google-fonts ^4.0.484
```
