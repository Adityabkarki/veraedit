# ViraEdit — Technology Decisions

## Why Each Technology Was Chosen

### Next.js 15
- App Router for layouts + server components
- API routes for BFF (Backend-for-Frontend) proxying
- Image optimization built-in
- Fast Turbopack dev server
- Vercel deployment ready (optional)

### FastAPI
- Async-first (critical for video processing)
- Auto-generated OpenAPI docs
- Pydantic for type-safe request/response schemas
- WebSocket support built-in
- Best Python DX for APIs

### Celery + Redis
- Mature, battle-tested task queue
- 4 separate queues = independent scaling
- Built-in retry logic with backoff
- Result storage + progress tracking
- Redis also used for caching and pub/sub

### PostgreSQL + pgvector
- JSONB for flexible timeline storage (no schema migrations for edit changes)
- pgvector for semantic search on transcripts/scenes
- Transactional guarantees for financial data (costs)
- pg_cron for scheduled jobs (optional)

### MinIO
- S3-compatible API (can swap to real S3 with one env var change)
- Runs locally, free
- Signed URL uploads (client uploads directly, no API bottleneck)
- Used for: raw assets, proxy files, thumbnails, renders, SVG assets

### Groq
- Fastest LLM inference available (up to 800 tokens/s)
- Cheapest transcription (Whisper Large v3 Turbo)
- Good enough quality for all non-critical AI tasks
- Falls back to Ollama for fully offline use

### FFmpeg
- Industry standard for video processing
- Hardware acceleration support (NVENC, VideoToolbox)
- filter_complex for multi-track compositing
- loudnorm for audio normalization
- Available on all platforms

### Remotion (optional, Phase 2+)
- React-based video composition
- Used for caption rendering and animated visuals
- Renders to video via headless Chrome
- Better for complex animations than raw FFmpeg

### Zustand
- Minimal boilerplate vs Redux
- TypeScript-first
- Works perfectly with React Query
- Easy to test
- Perfect for editor state (timeline, player, UI)

### React Query
- All API state managed consistently
- Automatic caching and refetching
- Background updates while user edits
- Optimistic updates for responsive UI

---

## Local Development Dependencies

Everything needed to run locally:

### Required
- Node.js >= 20 (for Next.js)
- Python 3.11+ (for FastAPI + workers)
- Docker Desktop (for services)
- FFmpeg (for video processing)
  - Mac: `brew install ffmpeg`
  - Linux: `apt install ffmpeg`
  - Windows: `winget install ffmpeg`

### Optional (for AI features without cloud APIs)
- Ollama (for local LLM inference)
  - `curl -fsSL https://ollama.ai/install.sh | sh`
  - `ollama pull llama3.1:8b`
- faster-whisper (for local transcription)
  - Installed via `pip install faster-whisper`
  - Models download automatically on first use

### AI API Keys (all optional, improve quality)
- GROQ_API_KEY — dramatically speeds up transcription and analysis
  - Free tier available at console.groq.com
  - Recommended: get it, it's free to start
- ANTHROPIC_API_KEY — only for premium suggestions (optional)
- OPENAI_API_KEY — fallback model (optional)

---

## Performance Targets

| Operation | Target | Acceptable Max |
|-----------|--------|----------------|
| API response (simple) | < 50ms | 200ms |
| API response (DB query) | < 200ms | 500ms |
| Transcription (1hr video) | < 5 min | 15 min |
| Scene detection | < 2 min | 5 min |
| AI scene analysis | < 3 min | 10 min |
| Preview render (720p) | < 1 min/min video | 3 min/min |
| Export render (1080p) | < 2 min/min video | 5 min/min |
| Timeline save | < 100ms | 300ms |
| WebSocket event delivery | < 50ms | 200ms |

---

## REAL 2026 COST SUMMARY

Based on verified April 2026 pricing from Groq:

| Service | Price | Source |
|---------|-------|--------|
| Groq Whisper Large v3 Turbo | $0.04/hr audio | tokenmix.ai (April 2026) |
| Groq Llama 3.3 70B | $0.59/$0.79 per M tokens | tokenmix.ai (April 2026) |
| Groq Llama 3.1 8B | $0.05/$0.08 per M tokens | tokenmix.ai (April 2026) |
| pyannote diarization | $0.00 (local) | runs on your CPU/GPU |
| All rendering | $0.00 (local FFmpeg) | runs on your machine |

**Cost per 1 hour of video: ~$0.14 (14 cents)**
**Monthly cost (12 videos × 45min avg): ~$1.29**

See `references/cost-and-multicam.md` for full breakdown.

## GROQ BATCH API DISCOUNT

For non-urgent processing (background analysis), use Groq Batch API:
- 50% discount off real-time rates
- Scene analysis: $0.30/M → $0.15/M tokens
- Further cuts cost per hour of video to ~$0.09

Use batch for: initial scene analysis, shorts scoring, visual planning
Use real-time for: user-triggered suggestions, prompt commands

## MULTI-CAMERA SUPPORT

ViraEdit supports 3-camera podcast setups natively.
Extra cost vs single camera: ~$0.02 per episode.
See `references/cost-and-multicam.md` for full architecture.
