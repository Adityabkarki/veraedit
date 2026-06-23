# ViraEdit — System Architecture Reference

## What This App Does

ViraEdit is an AI-native video editing platform that:
1. Accepts raw video/audio upload
2. Transcribes, analyzes, and understands the content with AI
3. Produces a non-destructive edit plan (JSON timeline graph)
4. Renders the edit to polished output video
5. Extracts viral short clips automatically
6. Augments video with AI-generated visuals, captions, and motion graphics

The AI thinks like a 20-year experienced video editor — understanding pacing,
storytelling, audio quality, platform optimization, and persuasion psychology.

---

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                          │
│  Next.js 15 · React · TypeScript · Tailwind · Zustand           │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │Dashboard │ │ Timeline Ed. │ │ AI Suggestions│ │  Preview  │  │
│  └──────────┘ └──────────────┘ └──────────────┘ └───────────┘  │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTP + WebSocket
┌─────────────────────────▼───────────────────────────────────────┐
│                      API LAYER (FastAPI)                          │
│  Auth · Projects · Assets · Timeline · Suggestions · Render      │
└──────┬──────────────┬────────────────┬───────────────────────────┘
       │              │                │
       ▼              ▼                ▼
┌──────────┐  ┌──────────────┐  ┌──────────────────────────────┐
│PostgreSQL│  │    Redis      │  │         S3 / MinIO           │
│+ pgvector│  │ Queue+Cache  │  │  Media Assets · Renders       │
└──────────┘  └──────┬───────┘  └──────────────────────────────┘
                     │
              ┌──────▼──────────────────────────┐
              │         WORKER FLEET             │
              │                                  │
              │  ┌──────────────────────────┐   │
              │  │  Transcription Worker    │   │
              │  │  Groq Whisper → local    │   │
              │  └──────────────────────────┘   │
              │  ┌──────────────────────────┐   │
              │  │  Analysis Worker         │   │
              │  │  Scene · Topic · Shorts  │   │
              │  └──────────────────────────┘   │
              │  ┌──────────────────────────┐   │
              │  │  Render Worker           │   │
              │  │  FFmpeg · Remotion       │   │
              │  └──────────────────────────┘   │
              │  ┌──────────────────────────┐   │
              │  │  Visual Worker           │   │
              │  │  SVG · Captions · LLM    │   │
              │  └──────────────────────────┘   │
              └──────────────────────────────────┘
```

---

## Data Flow: Upload → Edit → Export

```
User uploads video
       │
       ▼
S3 storage (raw asset)
       │
       ▼
Transcription Worker
  → Groq Whisper (primary)
  → whisper.cpp (fallback)
  → Word-level timestamps
  → Speaker diarization
       │
       ▼
Analysis Worker — 20-stage pipeline
  1.  Media ingestion (FFprobe metadata)
  2.  Transcription (done above)
  3.  Speaker diarization
  4.  Scene detection (visual + transcript breaks)
  5.  Topic segmentation
  6.  Semantic chunking (for long videos)
  7.  Hook detection + rewriting
  8.  CTA extraction
  9.  Filler word detection
  10. Emotion/energy analysis
  11. Silence detection (preserve emphasis silences)
  12. Highlight scoring
  13. Retention prediction
  14. Narrative arc analysis
  15. Visual opportunity extraction
  16. Shorts candidate extraction
  17. Viral scoring (per platform)
  18. Editing plan generation
  19. Timeline assembly
  20. Audio intelligence (J-cuts, L-cuts, music)
       │
       ▼
AI Suggestions generated
  → Stored in DB
  → Sent to frontend via WebSocket
       │
       ▼
User reviews suggestions
  → Accept / Reject / Modify
  → Natural language prompt editing
       │
       ▼
Timeline JSON (non-destructive edit graph)
  → Version history stored
  → Undo/redo supported
       │
       ▼
Render Worker
  → Timeline → FFmpeg filter_complex
  → Visual overlay generation
  → Audio mixing
  → Platform-specific encoding
       │
       ▼
Output video → S3 → User download
```

---

## Non-Destructive Editing Principle

ALL edits are stored as a JSON graph. Source files are NEVER modified.

```
Source Asset (immutable)
       +
Timeline JSON (edit instructions)
       │
       ▼  [Compile]
Render Plan (FFmpeg instructions)
       │
       ▼  [Render]
Output Video
```

The Timeline JSON is:
- Serializable (stored in PostgreSQL as JSONB)
- Diffable (version history via event sourcing)
- Replayable (same JSON → same output, always)
- Branchable (multiple versions of same project)

---

## AI Cost Architecture

Budget: $2.00 per hour of input video

All AI calls route through ModelRouter which:
1. Checks current project cost
2. Selects cheapest model that can do the job
3. Falls back to local models if budget tight
4. Logs every cost entry

```
Task               Primary Model              Cost/hr video
─────────────────────────────────────────────────────────
Transcription      Groq Whisper Large v3 T    ~$0.48
Scene analysis     Groq Llama 3.3 70B         ~$0.25
Shorts extraction  Groq Llama 3.3 70B         ~$0.08
Visual planning    Groq Llama 3.3 70B         ~$0.05
Caption gen        Rule-based (no LLM)        $0.00
SVG generation     Template engine            $0.00
─────────────────────────────────────────────────────────
TOTAL                                         ~$0.86
```

High-cost models (Claude Sonnet, GPT-4o) only used for:
- Complex narrative restructuring on user request
- Hook rewriting when user explicitly asks for premium quality

---

## Local Development Stack

Everything runs locally via Docker Compose:

| Service | Port | Purpose |
|---------|------|---------|
| Next.js | 3000 | Frontend |
| FastAPI | 8000 | Backend API |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Queue + Cache |
| MinIO | 9000/9001 | S3-compatible storage |
| Celery workers | — | Background processing |

One command to start everything:
```bash
docker compose up
```

---

## File Organization

```
viraedit/
├── apps/
│   ├── web/                    Next.js 15 frontend
│   │   ├── app/                Next.js App Router pages
│   │   ├── components/         React components
│   │   │   ├── editor/         Editor-specific
│   │   │   ├── timeline/       Timeline components
│   │   │   ├── ai/             AI suggestion UI
│   │   │   └── shared/         Reusable components
│   │   ├── hooks/              Custom React hooks
│   │   ├── stores/             Zustand state stores
│   │   └── lib/                Utilities, API client
│   └── api/                    FastAPI backend
│       ├── routers/            API route handlers
│       ├── services/           Business logic
│       ├── models/             SQLAlchemy ORM models
│       ├── schemas/            Pydantic schemas
│       └── workers/            Celery task definitions
├── packages/
│   ├── types/                  Shared TypeScript types
│   ├── timeline/               Timeline engine (pure TS)
│   └── ai/                     AI orchestration (Python)
│       ├── pipeline/           20-stage pipeline
│       ├── analysis/           Scene, audio, editorial
│       ├── shorts/             Shorts extraction
│       ├── visual/             Visual opportunities
│       └── routing/            Model router + cost tracking
├── workers/                    Celery worker entrypoints
├── infra/
│   └── docker/                 Docker configs
├── tests/
│   ├── unit/                   Unit tests
│   ├── integration/            Integration tests
│   └── fixtures/               Test data and mocks
└── scripts/                    Setup and utility scripts
```
