# ViraEdit — Phase Map (Nepali + Windows Edition)
# All Epics · Stories · Tasks · Acceptance Criteria

---

## WHAT'S DIFFERENT IN THIS VERSION

Every epic now includes:
- ✅ Nepali language handling where relevant
- ✅ Windows-compatible code and scripts
- ✅ Intuitive UI tasks (onboarding, empty states, tooltips)
- ✅ Tests for Nepali-specific behavior
- ✅ Devanagari font support

---

# PHASE 0: FOUNDATION

## EP-0.1 — Monorepo & Windows Setup

**Done When**: `scripts\setup.bat` runs clean on Windows and all
services respond on their ports.

### Tasks
- T-0.1.1: Create full monorepo folder structure
- T-0.1.2: Root `package.json` with Turborepo config
- T-0.1.3: `.env.example` with all variables (Windows paths, Windows notes)
- T-0.1.4: `scripts\setup.bat` (Windows batch) + `scripts\setup.ps1` (PowerShell)
- T-0.1.5: `scripts\health_check.bat` — ping all services
- T-0.1.6: `.gitattributes` — enforce LF line endings except .bat/.ps1
- T-0.1.7: `scripts\install_fonts.bat` — install Noto Sans Devanagari + Mukta

### Windows-Specific Notes
- Use `pathlib.Path` everywhere in Python
- All scripts provided as `.bat` (simple) and `.ps1` (PowerShell)
- Docker uses named volumes (not bind mounts) for databases
- Celery workers use `--pool=solo` on Windows

### Tests
```batch
:: Verify setup worked
scripts\health_check.bat
:: Expected: all 5 services show [OK]
```

---

## EP-0.2 — Docker Compose (Windows)

**Done When**: `docker compose up -d` starts all services and they pass health checks.

### Tasks
- T-0.2.1: `infra\docker\docker-compose.yml` with named volumes (Windows-safe)
- T-0.2.2: `infra\docker\docker-compose.dev.yml` override for development
- T-0.2.3: `infra\docker\Dockerfile.api` — Python 3.11 + FFmpeg
- T-0.2.4: `infra\docker\Dockerfile.worker` — same base, Celery cmd
- T-0.2.5: MinIO bucket init script (creates `viraedit-media` bucket)
- T-0.2.6: Windows firewall rule script for all ports

---

## EP-0.3 — Database Schema

**Done When**: `alembic upgrade head` runs clean; all models importable.

### Tasks
- T-0.3.1: Alembic setup with initial migration
- T-0.3.2: All SQLAlchemy ORM models (users, projects, assets, transcripts,
           scenes, timelines, suggestions, renders, shorts, brands, costs, embeddings)
- T-0.3.3: Indexes (FK indexes, pgvector GiST index)
- T-0.3.4: Seed data with a sample Nepali project

---

# PHASE 1: BACKEND CORE

## EP-1.1 — FastAPI Core

**Done When**: `GET /health` returns `{"status": "ok"}` and OpenAPI docs load.

### Tasks
- T-1.1.1: FastAPI app with lifespan, CORS, rate limiting, request ID middleware
- T-1.1.2: Pydantic Settings config (all env vars, validated on startup)
- T-1.1.3: Async SQLAlchemy engine with connection pool
- T-1.1.4: structlog configuration (pretty dev, JSON prod)
- T-1.1.5: Standard error response format (error code + human message)
- T-1.1.6: FastAPI dependencies (db, current_user, storage, cost_tracker)
- T-1.1.7: Language detection middleware (sets request.state.content_language)

### Tests
```python
def test_health_returns_ok()
def test_invalid_json_returns_422_with_human_message()
def test_request_id_in_every_response()
```

---

## EP-1.2 — Authentication

**Done When**: Register → Login → access protected endpoint works.

### Tasks
- T-1.2.1: Auth router (register, login, refresh, logout, me)
- T-1.2.2: JWT with 15min access / 7day refresh, Redis blacklist
- T-1.2.3: bcrypt password hashing
- T-1.2.4: UI-friendly auth errors (not "401 Unauthorized" — "Incorrect password")

### Tests
```python
def test_register_login_access_protected()
def test_wrong_password_returns_friendly_error()
def test_expired_token_returns_friendly_error()
```

---

## EP-1.3 — Project & Asset APIs

**Done When**: Upload a file → see it in project → status updates in real time.

### Tasks
- T-1.3.1: Projects CRUD (list, create, get, update, delete, duplicate)
- T-1.3.2: StorageService (signed upload URLs, MinIO + S3 abstraction)
- T-1.3.3: Assets API (upload-url, confirm, status, transcript, scenes)
- T-1.3.4: Chunked upload (5MB chunks, resume support, up to 10GB)
- T-1.3.5: File validation (MIME type, size, Nepali filename support — Unicode)
- T-1.3.6: Asset fingerprinting (SHA256 deduplication)

### Nepali-Specific
- Filenames in Nepali (Devanagari) must be stored and returned correctly
- Use Unicode-safe path handling everywhere

### Tests
```python
def test_upload_file_with_nepali_filename()
def test_duplicate_file_detected_by_fingerprint()
def test_status_updates_through_processing_stages()
```

---

## EP-1.4 — Timeline & Suggestions APIs

**Done When**: Save timeline → undo → redo works; accept suggestion → timeline updates.

### Tasks
- T-1.4.1: Timeline CRUD (get, save with history, undo, redo, version list)
- T-1.4.2: Timeline JSON schema validation on every save
- T-1.4.3: Suggestions API (list, generate, accept, reject, modify, prompt)
- T-1.4.4: Suggestion application logic (decode instructions → apply → save)

---

## EP-1.5 — Render & Worker APIs

**Done When**: Queue render → poll status → get download link works.

### Tasks
- T-1.5.1: Render API (preview, export, short render, status, download, cancel)
- T-1.5.2: Shorts API (list, extract, approve, render)
- T-1.5.3: Costs API (project costs, user monthly costs)
- T-1.5.4: Celery app with 4 queues, Windows `solo` pool, retry config
- T-1.5.5: Worker startup scripts (`.bat` files for Windows)

---

# PHASE 2: AI PIPELINE (NEPALI-FIRST)

## EP-2.1 — Model Router & Cost Control

**Done When**: Every AI call routes to cheapest model; budget enforced.

### Tasks
- T-2.1.1: ModelRouter with all models and costs
- T-2.1.2: Budget enforcement ($2/hr hard limit, switch to local at 90%)
- T-2.1.3: Ollama client wrapper (local fallback)
- T-2.1.4: Redis response cache (24hr TTL)
- T-2.1.5: Cost alert system (log warning at 80%, error at 100%)

---

## EP-2.2 — Nepali Transcription Pipeline

**Done When**: Upload Nepali audio → get word-level transcript with speaker labels.

### Tasks
- T-2.2.1: Groq Whisper client with `language="ne"` always set
- T-2.2.2: Code-switching handler (mixed Nepali-English)
- T-2.2.3: Chunked audio for files > 25MB (Groq limit)
- T-2.2.4: faster-whisper local fallback with Nepali language
- T-2.2.5: Speaker diarization (pyannote.audio)
- T-2.2.6: Filler word detection using `NEPALI_FILLER_WORDS` list
- T-2.2.7: Transcript saved with Devanagari text correctly encoded (UTF-8)

### Tests
```python
def test_nepali_transcription_produces_devanagari_text()
def test_language_code_always_set_to_ne()
def test_code_switching_handled_correctly()
def test_nepali_filler_words_detected()
def test_large_nepali_file_chunked_correctly()
```

---

## EP-2.3 — Scene Detection & Analysis (Nepali)

**Done When**: Scenes detected; each scene has intent, emotion, scores, Nepali hooks.

### Tasks
- T-2.3.1: Scene detection (PySceneDetect + transcript topic breaks)
- T-2.3.2: Scene analyzer with Nepali system prompt (see nepali-ai.md)
- T-2.3.3: Nepali intent patterns (direct address, problem, story hooks)
- T-2.3.4: Nepali hook rewriting (5 alternatives per scene)
- T-2.3.5: Audio intelligence (silence, breaths, room tone, Nepali filler words)
- T-2.3.6: Editorial engine with Nepali content type profiles
- T-2.3.7: J-cut/L-cut planning (works same in Nepali)

### Tests
```python
def test_scene_analysis_returns_nepali_summary()
def test_hooks_generated_in_nepali()
def test_nepali_cultural_references_detected()
def test_filler_words_mapped_to_scene_words()
```

---

## EP-2.4 — Nepali Shorts Engine

**Done When**: 5-10 short candidates extracted with Nepali hooks and platform scores.

### Tasks
- T-2.4.1: Shorts extraction (15-60s, self-contained Nepali narratives)
- T-2.4.2: Platform scoring with Nepal-specific rules (Facebook added!)
- T-2.4.3: Nepali hook generation (5 options using Nepali templates)
- T-2.4.4: Reframe instructions (9:16 for TikTok/Reels)
- T-2.4.5: Facebook scoring (important in Nepal market)

### Platform Priority for Nepal
```python
NEPAL_PLATFORM_PRIORITY = ['youtube', 'facebook', 'tiktok', 'instagram', 'linkedin']
# Facebook ranks higher for Nepal than in Western markets
```

---

## EP-2.5 — Prompt Compiler

**Done When**: "यो video लाई viral बनाउनुस्" → specific timeline changes.

### Tasks
- T-2.5.1: Intent parser (supports Nepali prompts + English prompts)
- T-2.5.2: Nepali prompt patterns ("छिटो बनाउनुस्", "caption थप्नुस्", etc.)
- T-2.5.3: Strategy mapper (intents → timeline operations)
- T-2.5.4: Edit instruction validator

### Nepali Prompt Examples
```python
NEPALI_PROMPT_EXAMPLES = {
    "छिटो बनाउनुस्": "increase_pacing",
    "viral बनाउनुस्": "make_viral",
    "caption थप्नुस्": "add_captions",
    "छोटो clips बनाउनुस्": "extract_shorts",
    "आवाज सफा गर्नुस्": "clean_audio",
    "hooks राम्रो बनाउनुस्": "strengthen_hook",
}
```

---

## EP-2.6 — Visual Opportunity Engine

**Done When**: Stats, lists, comparisons detected from Nepali transcript.

### Tasks
- T-2.6.1: Visual trigger detection (extended for Nepali number formats)
- T-2.6.2: Nepali number parsing (१२३ Devanagari numerals + Arabic numerals)
- T-2.6.3: Content extractor with Devanagari text support
- T-2.6.4: Timing alignment to Nepali word timestamps

### Nepali-Specific
```python
# Nepali uses both Devanagari (१२३) and Arabic (123) numerals
NEPALI_STAT_PATTERNS = [
    r'\b\d+%|\d+x|\$[\d,]+',          # Arabic numerals
    r'[१२३४५६७८९०]+%',                  # Devanagari numerals
    r'\b(lakh|crore|लाख|करोड)\b',      # Nepali large numbers
]
```

---

# PHASE 3: TIMELINE ENGINE

## EP-3.1 — Timeline Schema & Types
## EP-3.2 — Timeline Operations (Pure Functions)
## EP-3.3 — Timeline Compiler (→ FFmpeg)

*(Same as original but FFmpeg paths use `.as_posix()` on Windows)*

---

# PHASE 4: FRONTEND (INTUITIVE UI)

## EP-4.1 — App Shell & Design System

**Done When**: App opens, loads fast, looks professional, Nepali font renders.

### Tasks
- T-4.1.1: Next.js 15 with Tailwind + shadcn/ui
- T-4.1.2: Color system (crimson accent from ui-principles.md)
- T-4.1.3: Typography (Plus Jakarta Sans + Noto Sans Devanagari)
- T-4.1.4: Zustand + React Query setup
- T-4.1.5: Auth pages (with friendly error messages, not HTTP codes)
- T-4.1.6: Language toggle (English / नेपाली) in header
- T-4.1.7: Bilingual component wrapper (all key labels in EN + NE)

### UI Must-Haves
- Devanagari text renders correctly in browser
- Font loaded via next/font (no FOUT)
- Keyboard shortcut `?` opens shortcut modal on any page

---

## EP-4.2 — Dashboard (Intuitive)

**Done When**: First-time user knows exactly what to do without any explanation.

### Tasks
- T-4.2.1: Project grid with thumbnails, status, cost display
- T-4.2.2: **Onboarding flow** (5-step welcome wizard — see ui-principles.md)
- T-4.2.3: Upload modal with chunked upload + real-time progress
- T-4.2.4: Processing stages display (animated, real-time via WebSocket)
- T-4.2.5: Empty state with clear CTA: "Upload your first video"
- T-4.2.6: **"Use Sample Video"** button (downloads a 2min Nepali sample)
- T-4.2.7: Processing complete notification → "Open Editor" button

### Onboarding Wizard (5 steps)
1. Welcome screen (Nepali greeting: "नमस्ते!")
2. Language preference (Nepali pre-selected)
3. Content type picker (affects AI style)
4. Brand style picker (4 presets with previews)
5. First upload prompt

---

## EP-4.3 — Editor Layout

**Done When**: 4-panel layout loads, panels are resizable, feels natural.

### Tasks
- T-4.3.1: 4-panel layout (left/center-top/right/bottom) — see ui-principles.md
- T-4.3.2: Resizable panels (drag borders, persist sizes)
- T-4.3.3: Editor header with project title, undo/redo, save status, export
- T-4.3.4: Left panel tabs (Media / Scenes / Shorts / Brand) with counts
- T-4.3.5: **First-time tooltips** (pulsing hint dots on each panel)
- T-4.3.6: **"What is this?"** help icon on every panel → brief explanation

---

## EP-4.4 — Timeline (Full NLE)

**Done When**: All editing operations work; keyboard shortcuts all work.

### Tasks
- T-4.4.1: Timeline container (zoom, scroll, time ruler, playhead)
- T-4.4.2: Track header (mute/lock/visibility with labels)
- T-4.4.3: Clip component (thumbnails, waveforms, trim handles, context menu)
- T-4.4.4: Playhead (drag to scrub, synced to player)
- T-4.4.5: ALL keyboard shortcuts (see ui-principles.md keyboard modal)
- T-4.4.6: Snap system (visual orange indicator)
- T-4.4.7: **After every edit**: "Ctrl+Z to undo" toast (3 second auto-dismiss)
- T-4.4.8: **Clip tooltip on hover**: clip name, duration, source file

---

## EP-4.5 — AI Suggestions Panel (Trustworthy)

**Done When**: Suggestions are clear enough to accept/reject in <5 seconds each.

### Tasks
- T-4.5.1: Suggestion cards (icon, title, reasoning, confidence, impact)
- T-4.5.2: Suggestions shown in **Nepali AND English** (bilingual)
- T-4.5.3: Confidence bar with color (green/yellow/red)
- T-4.5.4: Preview button → shows before/after on player
- T-4.5.5: AI prompt input (supports Nepali text input)
- T-4.5.6: **"Why did AI suggest this?"** expandable section
- T-4.5.7: **"What will this change?"** diff preview before accepting
- T-4.5.8: Batch accept with confirmation ("Accept 8 high-confidence cuts?")

---

## EP-4.6 — Video Player & Shorts Tab

**Done When**: Preview plays correctly; shorts are easy to review and export.

### Tasks
- T-4.6.1: VideoPlayer (synced to timeline, caption overlay, speed control)
- T-4.6.2: ShortsTab (grid, platform scores, Nepali hook previews)
- T-4.6.3: ScenesPanel (thumbnails, intent icons, score bars, Nepali summaries)
- T-4.6.4: Waveform (canvas rendering, matches audio clips)
- T-4.6.5: **Nepali caption preview** in player (Devanagari renders correctly)

---

# PHASE 5: VISUAL ENGINE

## EP-5.1 — SVG Visual Generator (Nepali)

**Done When**: Stat display, list, comparison generate animated SVGs with Nepali text.

### Tasks
- T-5.1.1: All 7 visual types (stat, comparison, process, timeline, chart, quote, list)
- T-5.1.2: **Devanagari text in SVGs** (use `font-family: 'Noto Sans Devanagari'`)
- T-5.1.3: Nepali number formatting (₹ currency, लाख/करोड notation)
- T-5.1.4: Style presets (4 styles per visual type)

---

## EP-5.2 — Caption Engine (Nepali)

**Done When**: Nepali captions render in video without boxes; multiple styles work.

### Tasks
- T-5.2.1: Word grouping for Nepali (max 3-4 words, respect Devanagari boundaries)
- T-5.2.2: Filler suppression (NEPALI_FILLER_WORDS list)
- T-5.2.3: 4 caption styles: Nepali Bold, Subtitle, TikTok, Bilingual
- T-5.2.4: ASS/SSA caption renderer with Noto Sans Devanagari font
- T-5.2.5: SRT/VTT export (UTF-8 BOM for Windows compatibility)
- T-5.2.6: **Caption font validation** (fail loudly if Devanagari font missing)

### Critical
SRT files exported for Windows must have UTF-8 BOM:
```python
with open(srt_path, 'w', encoding='utf-8-sig') as f:  # utf-8-sig = UTF-8 with BOM
    f.write(srt_content)
```

---

## EP-5.3 — Brand Style Engine

*(Same as original + Nepali-appropriate presets)*

### Additional Nepali Preset
```python
'nepali_creator': {
    description: 'Popular Nepali YouTube style — warm, direct, energetic',
    caption_style: 'nepali_bold',
    color_grade: {'temperature': 0.15, 'saturation': 0.1},
    hook_style: 'direct_address',  # "साथीहरू..."
    music_energy: 'medium',
}
```

---

# PHASE 6: REAL-TIME SYSTEM

## EP-6.1 — WebSocket Server
## EP-6.2 — Frontend Real-time Integration

*(Same as original — add Nepali stage labels in progress messages)*

```python
PIPELINE_STAGE_LABELS = {
    'transcription': {
        'en': 'Transcribing audio...',
        'ne': 'अडियो transcribe गर्दैछ...'
    },
    'scene_detection': {
        'en': 'Detecting scenes...',
        'ne': 'Scenes पहिचान गर्दैछ...'
    },
    # ... all stages bilingual
}
```

---

# PHASE 7: RENDER PIPELINE

## EP-7.1 — FFmpeg Render Engine (Windows)

**Done When**: Simple timeline renders to valid MP4 with Nepali captions.

### Windows-Specific FFmpeg Notes
- Use `.as_posix()` for all paths passed to FFmpeg
- Hardware acceleration: check for `h264_amf` (AMD) or `h264_nvenc` (NVIDIA) first
- Devanagari font path must use Windows font directory:
  `C:/Windows/Fonts/NotoSansDevanagari-Regular.ttf`

```python
def get_devanagari_font_path() -> str:
    """Get correct Devanagari font path for current OS"""
    import platform
    if platform.system() == "Windows":
        candidates = [
            Path("C:/Windows/Fonts/NotoSansDevanagari-Regular.ttf"),
            Path("C:/Windows/Fonts/Mukta-Regular.ttf"),
        ]
    else:
        candidates = [
            Path("/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf"),
        ]
    
    for font in candidates:
        if font.exists():
            return font.as_posix()
    
    raise RuntimeError(
        "Nepali font not found! Run scripts/install_fonts.bat to install fonts."
    )
```

## EP-7.2 — Face Detection & Reframing
## EP-7.3 — Render Queue & Progress

*(Same as original)*

---

# PHASE 8: TESTING & QA

## EP-8.1 — Unit Tests

**Additional Nepali tests:**
```python
def test_nepali_transcription_language_code_is_ne()
def test_devanagari_text_stored_as_utf8()
def test_nepali_filler_words_all_detected()
def test_caption_font_falls_back_gracefully()
def test_nepali_hooks_generated_in_devanagari()
def test_devanagari_numerals_parsed_correctly()
def test_windows_paths_use_pathlib()
def test_ffmpeg_receives_posix_paths()
```

## EP-8.2 — Integration Tests
## EP-8.3 — Error Logging & Observability
## EP-8.4 — End-to-End Smoke Test

**Smoke test uses Nepali sample video:**
```python
SMOKE_TEST_VIDEO = "tests/fixtures/nepali_sample_30s.mp4"
EXPECTED_LANGUAGE = "ne"
EXPECTED_DEVANAGARI_WORDS = ["नमस्ते", "साथीहरू"]
```

---

# PHASE 9: LAUNCH PREP

## EP-9.1 — Polish & Developer Experience

### Additional UI Polish
- T-9.1.5: Verify Devanagari renders in ALL browsers (Chrome, Edge, Firefox)
- T-9.1.6: Test on 1366x768 laptop screen (common in Nepal)
- T-9.1.7: Verify Windows-specific file path handling in all export flows
- T-9.1.8: Test uploading files with Nepali filenames (Unicode)

## EP-9.2 — Documentation

**README must include:**
- Windows setup section (prominent, first)
- Nepali language configuration section
- Screenshot of editor with Nepali content
- FAQ: "Why are my captions showing boxes?" → install fonts

---

# EPIC SUMMARY

| Epic | Phase | Name | Nepali-Specific? | Windows-Specific? |
|------|-------|------|-----------------|------------------|
| EP-0.1 | Foundation | Monorepo & Setup | - | ✅ .bat scripts |
| EP-0.2 | Foundation | Docker Compose | - | ✅ named volumes |
| EP-0.3 | Foundation | Database Schema | ✅ Unicode | - |
| EP-1.1 | Backend | FastAPI Core | ✅ lang middleware | - |
| EP-1.2 | Backend | Authentication | - | - |
| EP-1.3 | Backend | Project & Assets | ✅ Unicode filenames | - |
| EP-1.4 | Backend | Timeline & Suggestions | - | - |
| EP-1.5 | Backend | Render & Workers | - | ✅ solo pool |
| EP-2.1 | AI | Model Router | - | - |
| EP-2.2 | AI | **Nepali Transcription** | ✅✅ CORE | - |
| EP-2.3 | AI | **Scene Analysis** | ✅✅ CORE | - |
| EP-2.4 | AI | **Shorts Engine** | ✅ + Facebook | - |
| EP-2.5 | AI | Prompt Compiler | ✅ Nepali prompts | - |
| EP-2.6 | AI | Visual Engine | ✅ Devanagari nums | - |
| EP-3.1 | Timeline | Schema & Types | - | - |
| EP-3.2 | Timeline | Operations | - | - |
| EP-3.3 | Timeline | Compiler | - | ✅ posix paths |
| EP-4.1 | Frontend | App Shell | ✅ Deva font | - |
| EP-4.2 | Frontend | Dashboard | ✅ Nepali onboard | - |
| EP-4.3 | Frontend | Editor Layout | ✅ bilingual | - |
| EP-4.4 | Frontend | Timeline | - | - |
| EP-4.5 | Frontend | AI Panel | ✅ bilingual | - |
| EP-4.6 | Frontend | Player & Shorts | ✅ caption preview | - |
| EP-5.1 | Visual | SVG Generator | ✅ Devanagari SVG | - |
| EP-5.2 | Visual | Caption Engine | ✅✅ CORE | ✅ UTF-8 BOM |
| EP-5.3 | Visual | Brand Styles | ✅ Nepali preset | - |
| EP-6.1 | Realtime | WebSocket | ✅ bilingual msgs | - |
| EP-6.2 | Realtime | Frontend WS | - | - |
| EP-7.1 | Render | FFmpeg Engine | ✅ Deva font | ✅ posix paths |
| EP-7.2 | Render | Face Detection | - | - |
| EP-7.3 | Render | Queue & Progress | - | - |
| EP-8.1 | Testing | Unit Tests | ✅ Nepali tests | ✅ path tests |
| EP-8.2 | Testing | Integration Tests | ✅ Nepali fixtures | - |
| EP-8.3 | Testing | Error Logging | - | - |
| EP-8.4 | Testing | Smoke Test | ✅ Nepali video | - |
| EP-9.1 | Launch | Polish | ✅ font verify | ✅ 1366x768 |
| EP-9.2 | Launch | Docs | ✅ Nepali section | ✅ Windows section |

---

# PHASE 4B: COMPETITOR-INSPIRED FEATURES
# These epics extend Phase 4 with the 6 competitor UI patterns

---

## EP-4.7 — Transcript Editor (Descript-style)

**User Story**: As a Descript user, I can click any word in the transcript
to jump to that moment, select text to delete video sections, and see
filler words highlighted — exactly like Descript but in Nepali.

### Tasks

**T-4.7.1** Create `TranscriptEditor.tsx`
- Renders full transcript as interactive text
- Each word is a clickable span with timestamp data
- Click word → seeks video player to that timestamp
- Word highlight syncs with video playback (real-time)
- Filler words: yellow background (हैन र, भनेको, uh, um)
- Silences: grey background with duration shown
- Deleted words: strikethrough + dimmed (non-destructive)
- Speaker labels as colored section headers (Speaker A in blue, B in orange)

**T-4.7.2** Text-selection → video delete
- Select words with mouse drag (same as selecting text)
- Right-click → "Delete this section" → ripple deletes from timeline
- Keyboard: Select + Delete key = delete selected section
- Show confirmation: "Delete 4.2 seconds from video?" [Delete] [Cancel]
- Undo works (Ctrl+Z restores)

**T-4.7.3** Filler word management
- "Remove all fillers" button → shows preview count first
- "Review fillers" → steps through each one (keep/remove per word)
- Nepali fillers (हैन र, भनेको) + English fillers (um, uh, basically)
- Shows time saved: "Removing 12 fillers saves 8.4 seconds"

**T-4.7.4** Silence visualization
- Grey blocks in transcript show silence duration
- Click silence → plays that section
- "Remove all silences > 0.8s" one-click button
- Manual: click silence → drag to adjust duration

**T-4.7.5** Transcript search
- Ctrl+F opens search in transcript
- Highlights all matches
- Navigate with arrows
- "Jump to" each match in video

### Tests
```typescript
test('clicking word seeks player to correct timestamp')
test('selecting words and deleting updates timeline')
test('filler words highlighted in correct color')
test('undo restores deleted transcript section')
test('nepali filler words detected and highlighted')
test('silence blocks show correct duration')
```

### Done Criteria
A Descript user can use this panel without any instructions.

---

## EP-4.8 — Shorts Mode & Virality UI (Opus Clip-style)

**User Story**: As an Opus Clip user, I see viral scores immediately,
can preview and export any short in one click, and understand WHY
each clip scored what it scored.

### Tasks

**T-4.8.1** Create `ShortsMode.tsx` — full-screen shorts workflow
- Grid of short candidates (3 columns)
- Large virality score (number + color ring)
- Platform tabs: [All] [TikTok] [Reels] [YouTube] [Facebook]
- Sort: [🔥 Virality] [⏱ Duration] [📅 Created]
- Search/filter shorts by topic

**T-4.8.2** Virality score breakdown popover
- Hover over score → popover shows breakdown:
  ```
  Virality Score: 94%
  ────────────────────
  ✓ Strong hook (first 0.5s)    +25
  ✓ Complete story arc           +20
  ✓ High energy speaker          +18
  ✓ Quotable insight             +15
  ✓ Good pacing (fast)           +16
  ────────────────────
  Weak: No explicit CTA          -10
  Tip: Add "comment below" CTA!
  ```

**T-4.8.3** Hook selector
- Each short has 5 hook options (Nepali)
- Radio button to pick hook
- "Edit hook" → inline text editor
- Hook preview: shows first frame + text overlay

**T-4.8.4** One-click export per platform
- [Export for TikTok] → renders with TikTok spec
- [Export for Reels] → renders with Reels spec  
- [Export All Platforms] → queues all renders
- Shows file size estimate before render

**T-4.8.5** Bulk operations
- Select multiple shorts (checkbox)
- "Export Selected" → batch render
- "Approve Selected" → marks as ready
- "Regenerate Hooks" → re-runs AI on selected

### Tests
```typescript
test('virality score breakdown shows all factors')
test('hook selection updates preview correctly')
test('platform export queues correct render settings')
test('bulk export queues multiple tasks')
```

---

## EP-4.9 — Effects & Templates Drawer (CapCut-style)

**User Story**: As a CapCut user, I can tap "Effects" and see a visual
drawer of templates, transitions, and text styles — then click to apply.

### Tasks

**T-4.9.1** Create `EffectsDrawer.tsx`
- Slides up from bottom of timeline (like CapCut mobile)
- Tabs: [Transitions] [Filters] [Text Templates] [Overlays] [Audio]
- Each item: animated thumbnail preview + name
- Click to apply at playhead position
- Recently used shown first
- Search within effects

**T-4.9.2** Transition templates
Built-in: Cut, Dissolve, Zoom In/Out, Slide, Wipe, Whip Pan
- Preview plays on hover
- Applied between clips on click
- Duration adjustable after applying

**T-4.9.3** Text template presets
- Nepali-ready text overlays
- Categories: Lower Third, Title Card, Quote, Stat, CTA
- Each in 4 styles (Bold, Minimal, Corporate, Fun)
- Devanagari font used for all Nepali text

**T-4.9.4** Speed presets
- Speed curve panel (like CapCut)
- Presets: Normal, Fast, Slow-mo, Ramping
- Visual curve editor
- Applies to selected clip

### Tests
```typescript
test('drawer opens and closes smoothly')
test('clicking transition applies between clips')
test('text template inserts with Nepali font')
test('speed curve applies to selected clip only')
```

---

## EP-4.10 — Subtitle Editor (VEED-style)

**User Story**: As a VEED user, I can see all my captions in a list,
click any to edit the text, and see changes instantly in the preview.

### Tasks

**T-4.10.1** Create `SubtitleEditorPanel.tsx`
- Right panel (slides in when Captions tab active)
- Scrollable list of all captions with timestamps
- Click caption → editable inline text field
- Edit text → preview updates in real-time
- Timestamp shown + editable (click to change timing)

**T-4.10.2** Subtitle style picker
- 4 presets at top: Nepali Bold / Subtitle / TikTok / Bilingual
- Custom style options (font, size, color, position)
- Live preview of style change across all captions

**T-4.10.3** Subtitle search and replace
- Find text in captions (supports Devanagari search)
- Replace all occurrences
- Case-sensitive option

**T-4.10.4** Caption export options
- [Download SRT] → UTF-8 BOM encoded (Windows-safe)
- [Download VTT]
- [Burn into video] → renders captions into video file

### Tests
```typescript
test('editing caption text updates preview immediately')
test('style change applies to all captions')
test('srt export is valid and utf8 encoded')
test('devanagari search finds nepali text')
```

---

## EP-4.11 — Visual Template Library (Canva-style)

**User Story**: As a Canva user, I can browse visual templates,
drag one onto my video, and customize it — with my brand colors
applied automatically.

### Tasks

**T-4.11.1** Create `VisualLibraryPanel.tsx`
- Tabs: [Templates] [Elements] [Text] [My Brand]
- Grid layout with preview thumbnails
- Filter: [All] [Charts] [Stats] [Quotes] [Lists] [Lower Thirds]
- Nepali text versions of all templates

**T-4.11.2** Template drag-to-timeline
- Drag template thumbnail → drop on timeline
- Drops at the frame position where it's dropped
- Auto-duration: matches speech segment it covers
- Snaps to clip boundaries

**T-4.11.3** Brand kit panel
- "My Brand" tab shows brand-colored versions of all templates
- Set once: primary color, secondary color, logo, fonts
- All templates auto-update when brand is applied
- "Apply brand to entire video" one-click

**T-4.11.4** Template customization
- Click placed template → properties panel opens
- Edit: text, colors, animation speed, duration
- "Reset to template defaults" option
- Changes are non-destructive (stored as overlay edits)

**T-4.11.5** Nepali template texts
- Every template has Nepali text variant
- Toggle: [नेपाली] / [English] per template
- Devanagari renders correctly in all templates

### Tests
```typescript
test('template drag inserts at correct timeline position')
test('brand colors apply to all templates')
test('nepali text renders without boxes in templates')
test('template customization is non-destructive')
```

---

## EP-4.12 — AI Producer Panel (Riverside-style)

**User Story**: As a Riverside user, I upload my podcast and get
show notes, chapters, key quotes, and social posts generated — just
like Riverside's AI Producer, but for Nepali content.

### Tasks

**T-4.12.1** Create `AIProducerPanel.tsx`
- Shown automatically in Podcast Mode
- Sections: Show Notes, Chapters, Key Quotes, Summary, Social Posts
- Each section: [Generate] button → loading → result

**T-4.12.2** Show notes generator
- Calls AI with full transcript
- Returns structured show notes:
  - Episode summary (2-3 sentences)
  - Key topics covered (bullet points)
  - Resources mentioned
  - Guest info (if applicable)
- Output in Nepali (or English — toggle)
- [Copy] [Export as PDF] [Export as TXT]

**T-4.12.3** Chapter detection
- Auto-detect topic shifts from transcript
- Generate chapter titles (Nepali)
- Timestamps for each chapter
- Export as: YouTube chapters format, Podcast chapter tags
- Edit: rename chapters, adjust timestamps

**T-4.12.4** Key quotes extractor
- Find 5-10 most quotable moments
- Show as pull-quote cards
- One-click to create a short from any quote
- Export as: image card (for Instagram), text (for Twitter)

**T-4.12.5** Social post generator
- Generates platform-specific posts from episode:
  - Twitter/X: thread format
  - LinkedIn: professional post with key insights
  - Facebook: engaging post (important for Nepal)
  - Instagram caption: with hashtags
- Nepali AND English versions of each

**T-4.12.6** Newsletter blurb
- 2-3 paragraph newsletter section
- Links to full episode
- In Nepali or English

### Tests
```python
def test_show_notes_cover_main_topics()
def test_chapters_align_with_transcript_topics()
def test_key_quotes_are_quotable()
def test_social_posts_fit_platform_limits()
def test_all_outputs_available_in_nepali()
```

---

## EP-4.13 — UI Mode Switcher & Onboarding "Switch"

**User Story**: The app knows which tool I'm coming from and shows
me the right layout immediately. I feel at home within 30 seconds.

### Tasks

**T-4.13.1** Mode switcher in header
- Small dropdown: [🎙 Podcast] [⚡ Shorts] [🎨 Visual] [✂ Editor] [📚 Tutorial] [🚀 Quick Export]
- Smooth animated transition between modes (panels slide, not jump)
- Mode saved per project

**T-4.13.2** "Coming from" onboarding step
- Step 2 of onboarding wizard: "Which tool are you currently using?"
- Options: Descript / Opus Clip / CapCut / VEED / Canva / Riverside / Other
- Sets default mode + customizes first-launch tooltips

**T-4.13.3** Per-tool onboarding customization
- Descript → transcript panel tooltip: "Click any word to jump there →"
- Opus Clip → shorts tab active on first load, tooltip on virality score
- CapCut → effects drawer tooltip on first open
- VEED → subtitle editor tooltip on first caption
- Canva → template library tooltip on first open
- Riverside → AI Producer tooltip + auto-generate triggered

**T-4.13.4** Quick Export Mode (for VEED users)
- Ultra-simplified 3-step flow:
  1. Upload → captions auto-generated
  2. Review captions (just the subtitle editor, nothing else)
  3. Export (platform picker + button)
- No timeline shown in this mode
- "Switch to full editor" button always visible

### Tests
```typescript
test('selecting descript shows transcript panel first')
test('selecting opus clip shows shorts grid first')
test('mode transition animation plays smoothly')
test('mode persists when reopening project')
test('quick export mode hides timeline correctly')
```

---

## UPDATED EPIC SUMMARY WITH PHASE 4B

| Epic | Name | Competitor Inspiration |
|------|------|----------------------|
| EP-4.7 | Transcript Editor | Descript |
| EP-4.8 | Shorts Mode & Virality UI | Opus Clip |
| EP-4.9 | Effects & Templates Drawer | CapCut |
| EP-4.10 | Subtitle Editor | VEED |
| EP-4.11 | Visual Template Library | Canva |
| EP-4.12 | AI Producer Panel | Riverside |
| EP-4.13 | UI Mode Switcher & Onboarding | All 6 |

**Total epics: 34** (was 27)
**Estimated sessions: 22-25 "continue" sessions**

---

# PHASE 5: BEST-OF-BREED QUALITY (User Priority — May 2026)

These epics close the gap between "demo UI" and production-grade editing.
Target quality bars: Transcript 10/10 · Scenes/Suggestions 6–8/10 · Shorts Opus-level.

---

## EP-5.1 — Transcription Quality (10/10)

**User Story**: Upload a Nepali podcast → word-level Devanagari transcript with
accurate click-to-seek, speaker labels, and filler detection — Descript-grade.

**Gap**: EP-2.2 exists but word timestamps, diarization, and Nepali post-processing
are incomplete. Transcript often falls back to evenly-spaced words.

### Tasks
- T-5.1.1: Force `whisper-large-v3` (not turbo) when word timestamps required
- T-5.1.2: Nepali post-processor (Devanagari normalization, common ASR fixes)
- T-5.1.3: Speaker diarization (pyannote or heuristic pause-based A/B labels)
- T-5.1.4: Silence blocks inserted between words from gap analysis
- T-5.1.5: Transcript API returns words + speakers + confidence per word
- T-5.1.6: Frontend never shows placeholder/demo transcript when asset is ready

### Done Criteria
Click any word → seeks within 100ms. Nepali text readable. Two speakers labeled.

---

## EP-5.2 — Scene & AI Suggestion Quality (6–8/10)

**User Story**: Scenes reflect real topic arcs; suggestions are actionable and
specific to the content — not generic placeholders.

**Gap**: EP-2.3/EP-4.5 built but suggestions lack podcast-specific editorial rules.

### Tasks
- T-5.2.1: Content-type-aware suggestion generator (podcast vs tutorial vs vlog)
- T-5.2.2: Apply editorial-intelligence.md rules per content profile
- T-5.2.3: Scene titles from transcript topics, not generic labels
- T-5.2.4: Suggestion confidence + "why" explanation in English UI
- T-5.2.5: Auto-apply safe suggestions (filler trim, long silence) with undo

### Done Criteria
Podcast upload yields ≥8 relevant suggestions; ≥80% mention specific transcript content.

**Implemented (2026-05):** Micro-scenes (30–90s) + `chapter_planner` merges to 4–15 min chapters;
`master_edit_planner` + podcast LLM suggestions; `scene_kind` micro/chapter in DB.

---

## EP-5.3 — Topic Short Compiler (Opus Clip++)

**User Story**: App detects topics discussed across the video, finds every segment
where that topic appears, and compiles one short (30s–3min) from multiple cuts.

**Gap**: EP-2.4 only extracts single contiguous 15–60s windows.

**Implemented (2026-05):** Shorts engine 30–240s tiers; `shorts_analyzer` LLM hooks/titles.

### Tasks
- T-5.3.1: Topic clustering from scene `topics[]` + title similarity
- T-5.3.2: Multi-segment short candidate (`segments[]` in action JSON)
- T-5.3.3: Title = topic name; hooks generated from compiled excerpt
- T-5.3.4: Duration budget 30s–240s; bridge pacing between non-adjacent cuts
- T-5.3.5: Export renders concatenated segments (FFmpeg concat demuxer)
- T-5.3.6: Shorts UI shows "Compiled from 3 moments" badge

### Done Criteria
One topic spanning 3+ scenes → one short with accurate title and multi-cut preview.

---

## EP-5.4 — Podcast Auto-Edit Pipeline

**User Story**: Upload podcast → analysis completes → timeline auto-trimmed with
filler/silence cuts applied; user lands in a partially edited project.

**Gap**: EP-4.12 generates show notes but does not edit the timeline.

### Tasks
- T-5.4.1: `podcast_autopilot` task after analyze (content_type=podcast)
- T-5.4.2: Auto-apply filler removal + silence trim per podcast profile
- T-5.4.3: Chapter markers on timeline from topic shifts
- T-5.4.4: Speaker lower-thirds inserted at segment starts (editable)
- T-5.4.5: "Review auto-edits" banner with Accept all / Revert

### Done Criteria
Podcast upload → within 2 min user sees trimmed timeline ready to review.

---

## EP-5.7 — Chapter Thumbnails (Frame + AI Layout)

**User Story**: Every chapter and short shows a real thumbnail with designed headline overlay.

### Tasks
- T-5.7.1: `thumbnail_service` — FFmpeg frame extract + Pillow overlay
- T-5.7.2: LLM layout spec (headline, brand colors, no emoji)
- T-5.7.3: Upload to MinIO; `thumbnail_url` on scenes/highlights

### Done Criteria
Chapters tab shows image thumbnails after analyze (not color placeholders only).

---

## EP-5.8 — Highlights & Platform Packs

**User Story**: Promo-style highlights exportable per social aspect ratio (16:9, 9:16, 4:5, 1:1).

### Tasks
- T-5.8.1: `highlights_engine` — 15–90s diverse promo picks
- T-5.8.2: `highlights` table + GET API + Highlights tab UI
- T-5.8.3: Platform pack JSON per highlight (crop plan)

### Done Criteria
Highlights tab filters by platform; preview aspect matches selection.

---

## EP-5.9 — Reject + Scoped Regeneration

**User Story**: User rejects a suggestion and types what to find; app regenerates only that scope.

### Tasks
- T-5.9.1: `POST .../regenerate` with scope + `user_prompt` + confirmation
- T-5.9.2: Celery `tasks.regenerate.run`
- T-5.9.3: UI RegeneratePromptDialog on suggestions + Highlights tab

### Done Criteria
Reject + prompt re-queues scoped job without full re-upload.

---

## EP-5.5 — Interactive Overlay Studio

**User Story**: Every brand template, element, stat, and speaker name is
moveable, resizable, and text-editable on the preview — nothing hardcoded.

**Gap**: EP-4.11 T-4.11.4 partial; Elements tab inserts wrong template (star → stat box).

### Tasks
- T-5.5.1: Overlay transform model (x%, y%, width%, height%, rotation, scale)
- T-5.5.2: Drag-to-move on video preview; resize handles
- T-5.5.3: Elements insert correct visual (emoji, shape, arrow) — not stat template
- T-5.5.4: Full-screen vs corner overlay mode toggle per element
- T-5.5.5: Import B-roll / clip from file (overlay track, not main timeline)
- T-5.5.6: Speaker name cards — draggable lower-thirds linked to transcript speakers
- T-5.5.7: Stats/charts as true overlays with editable numbers

### Done Criteria
Star element shows ⭐; user drags speaker name; edits stat value; exports with position.

---

## EP-5.6 — Auto-Edit on Upload (Best-of-Breed Entry)

**User Story**: Drop a podcast video → app immediately starts editing without
the user clicking anything.

### Tasks
- T-5.6.1: Upload confirm triggers full pipeline (transcribe → analyze → autopilot)
- T-5.6.2: Progress UI: Transcribing → Finding scenes → Auto-editing → Shorts
- T-5.6.3: Open editor in Podcast mode when content_type=podcast
- T-5.6.4: Quality gate: block "ready" until transcript words exist

### Done Criteria
Single upload action → user returns to a project that is already partially edited.

---

## UPDATED EPIC SUMMARY WITH PHASE 5

| Epic | Name | Target Quality |
|------|------|----------------|
| EP-5.1 | Transcription Quality | 10/10 |
| EP-5.2 | Scene & Suggestion Quality | 6–8/10 |
| EP-5.3 | Topic Short Compiler | Opus++ |
| EP-5.4 | Podcast Auto-Edit | Riverside++ |
| EP-5.5 | Interactive Overlay Studio | Canva++ |
| EP-5.6 | Auto-Edit on Upload | Best-of-breed entry |

**Total epics: 40**
**Current build priority: EP-5.1 → EP-5.3 → EP-5.5 → EP-5.4 → EP-5.2 → EP-5.6**

---

## EP-5.7 — Transcription v2 + Regenerate

**User Story**: Nepali STT quality is maximized via Groq Whisper v3 tuning; user can regenerate transcript on uploaded videos.

### Tasks
- T-5.7.1: FFmpeg audio prep (highpass + loudnorm) before Whisper
- T-5.7.2: Whisper temperature=0, Nepali code-switch prompt, regenerate prompt
- T-5.7.3: Chunk overlap word dedup; expanded Nepali post-process
- T-5.7.4: `quality_metrics` on transcript (grade A–D, avg confidence)
- T-5.7.5: `POST /assets/{id}/retranscribe` + Script panel Regenerate button

### Done Criteria
Poor transcript → user clicks Regenerate → new transcript with quality grade shown.

---

## EP-10.1 — Hard Project Delete

**User Story**: Delete project removes all DB rows, MinIO files, and cancels Celery jobs.

### Tasks
- T-10.1.1: `purge_project_storage()` — prefix delete media/temp + render keys
- T-10.1.2: Wire into `DELETE /projects/{id}`
- T-10.1.3: Dashboard delete button + confirmation dialog

### Done Criteria
Delete project → 404 on GET; MinIO prefix empty.

---

## EP-10.2 — Style Templates + Capability Registry

**User Story**: Reference video analyzed into a reusable template; app reports missing effects to build.

### Tasks
- T-10.2.1: `EffectCapability` registry (supported/partial/missing)
- T-10.2.2: `build_gap_report()` from StyleDNA
- T-10.2.3: StylePreset template fields (inventory, coverage %, fidelity score)
- T-10.2.4: Style tab shows coverage + missing capabilities list

### Done Criteria
Extract style from URL → template saved with gap report visible in library.

---

## EP-10.3 — Style Fidelity Preview (future)

Side-by-side reference vs styled preview render with fidelity score ≥ 85% target.

---

## EP-10.4 — Missing Effect Renderers

Implement whip-pan, speed ramps, SFX-on-cut, progress bars per gap report epics.

---

## UPDATED EPIC SUMMARY WITH PHASE 10

| Epic | Name | Status |
|------|------|--------|
| EP-5.7 | Transcription v2 + Regenerate | ✅ Built |
| EP-10.1 | Hard Project Delete | ✅ Built |
| EP-10.2 | Style Templates + Gap Report | ✅ Built |
| EP-10.3 | Style Fidelity Preview | Planned |
| EP-10.4 | Missing Effect Renderers | Planned |

**Total epics: 45**
