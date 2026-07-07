## Role & Operational Protocol
 
You are continuing as the Staff Creative Engineer on ViraEdit. Every subsystem needed to make a fully automatic edit exists in isolated form: transcription produces word-level timestamps, the B-roll system can fetch Pexels clips, the Motion Graphics Library has atomic components per content pillar, the Theme system resolves brand identity, and the Audio Analysis system produces real amplitude data. **None of these currently talk to each other.** Your job is to build the Director Engine: the orchestration layer that reads a video's content, decides what should happen and when, and emits one unified Timeline that the existing render pipeline already knows how to play.
 
This is a large body of work. Follow every phase below in strict order. Pause at every ⏸️ checkpoint — do not proceed to the next phase until the current one is verified working on a real test video.
 
---
 
## PHASE 1 — Extend `skills.md` with Assembly Laws
 
### The Single Source of Truth Timeline Law
 
There is exactly one canonical data structure per project: the **Timeline**. Every track — video, audio, captions, B-roll, motion graphics — is a list of time-bounded entries inside this one structure. No subsystem may maintain its own separate "list of things to show" outside the Timeline. The renderer only ever reads the Timeline; it never independently queries the transcript, B-roll service, or director rules at render time.
 
**Violation to reject:** any component or render pass that fetches transcript data, B-roll suggestions, or trigger logic live during render instead of reading pre-resolved Timeline entries. (This is a direct extension of the Determinism Law — the Timeline itself must be the one resolved, static artifact.)
 
### The Trigger-Driven Assembly Law
 
Every automatic Timeline entry must trace back to an explicit, named **Trigger** (e.g. `stat_mention`, `speaker_change`, `topic_shift`, `feature_callout_phrase`) detected from the source content, with a confidence score and the exact transcript timestamp range that caused it. Nothing gets placed on the Timeline "because the AI felt like it" — every auto-inserted element must be traceable and therefore removable/explainable to the user.
 
**Violation to reject:** any Director rule that inserts a component without a corresponding logged Trigger object the user could inspect ("why did this chart appear here?").
 
### The Density Throttle Law
 
Every content-type Director has a Graphics Density setting (Minimalist → Balanced → Immersive). Triggers are ranked by confidence/impact and only the top N (per density level, per time window) are actually realized as Timeline entries — the rest are logged as "considered but suppressed" for transparency and future manual insertion. This is what prevents the auto-assembly from becoming a cluttered mess of every possible graphic firing on every possible topic sentence.
 
⏸️ **Stop and confirm** these three laws are written before proceeding to Phase 2.
 
---
 
## PHASE 2 — Define the Unified Timeline Schema
 
Create `@types/timeline.ts`. This is the single artifact everything else produces and the renderer consumes:
 
```typescript
export interface Timeline {
  schemaVersion: number;
  projectId: string;
  contentType: 'podcast' | 'consultancy' | 'social' | 'showcase';
  fps: number;
  durationInFrames: number;
 
  theme: ThemeToken;                 // from the Theme Token System
  audioAnalysisRef: string;          // pointer to a cached AudioAnalysisTrack
 
  tracks: {
    video: VideoClipEntry[];         // raw source cuts (in/out points, speed ramps)
    audio: AudioClipEntry[];         // dialogue + music + sfx, with ducking rules
    captions: CaptionCueEntry[];     // word-level cues, styled via theme
    broll: BRollEntry[];             // Pexels/AI B-roll insertions
    motionGraphics: MotionGraphicsEntry[]; // atomic components from the Jitter-style library
  };
 
  triggers: TriggerLogEntry[];       // every Trigger considered, realized or suppressed
}
 
export interface MotionGraphicsEntry {
  id: string;
  componentId: string;               // references a JitterComponentSchema from the Motion Graphics Library
  startFrame: number;
  durationInFrames: number;
  layerDepth: number;                // must respect the Layer Depth Registry band for its type
  props: Record<string, unknown>;    // e.g. { title: "Revenue", value: "40%" } for a metric card
  triggerId: string;                 // links back to the TriggerLogEntry that caused this
}
 
export interface BRollEntry {
  id: string;
  startFrame: number;
  durationInFrames: number;
  source: 'pexels' | 'ai_generated' | 'user_upload';
  assetUrl: string;
  searchQuery?: string;              // what query produced this, for transparency/re-roll
  triggerId: string;
}
 
export interface CaptionCueEntry {
  id: string;
  startFrame: number;
  endFrame: number;
  words: { text: string; startFrame: number; endFrame: number }[];
  style: 'standard' | 'karaoke' | 'pull_quote';
}
 
export interface TriggerLogEntry {
  id: string;
  type: string;                      // e.g. 'stat_mention', 'topic_shift', 'feature_callout_phrase'
  transcriptStart: number;           // seconds
  transcriptEnd: number;
  confidence: number;                // 0–1
  status: 'realized' | 'suppressed'; // did Density Throttle let it through?
  resultingEntryId?: string;         // the MotionGraphicsEntry/BRollEntry it produced, if realized
}
```
 
⏸️ **Stop and confirm** this type compiles and a minimal hand-written `Timeline` JSON renders correctly through the existing pipeline before proceeding.
 
---
 
## PHASE 3 — Signal Extraction Modules (build what's missing)
 
The Director Engine needs richer signals than raw transcript text. Some of these exist already (transcription); most do not. Build each as an independent, testable module that outputs structured data — none of these should be entangled with rendering:
 
1. **Speaker Diarization** — *(build if not present)* who is speaking when. Required for Podcast's Active Speaker Split-Cards to actually track real speaker changes instead of manual/inferred switching. Use an existing diarization library/model (e.g. `pyannote.audio`) in the same backend pipeline that runs transcription.
2. **Topic Segmentation** — *(build if not present)* semantic clustering over the transcript to find chapter/topic boundaries (this is the "Context Engine" chaptering mentioned in earlier planning — implement it now as a concrete module). Output: list of `{ startTime, endTime, topicLabel }`.
3. **Stat/Number Extraction** — *(new)* NLP pass over the transcript to catch spoken numbers, percentages, and comparisons ("revenue grew 40% this quarter"). Output: `{ time, rawText, extractedValue, extractedLabel }` candidates for auto-populating Metric Cards.
4. **Feature/Product Mention Detection** — *(new)* keyword/phrase spotting for Product Showcase ("as you can see here," "this button," "swipe to") to trigger Dynamic Feature Callouts near screen-recording segments.
5. **Scene/Shot Classification** — *(new)* lightweight computer-vision pass per segment: talking-head vs. screen-recording vs. B-roll-already-present. Required so the Director doesn't try to wrap a talking-head shot in a 3D device mockup, or insert B-roll over a segment that's already screen-share content.
6. **Emphasis/Pull-Quote Scoring** — *(new)* combine vocal energy from the Audio Analysis System's `isTransient`/`overallAmplitude` data with sentence boundaries to score which transcript sentences are said with the most emphasis — candidates for pull-quote captions or a highlight graphic.
7. **Silence/Pause Detection** — *(new, may partially exist)* required for the Pacing Slider to actually do something concrete: Aggressive pacing trims detected silences hard; Relaxed pacing leaves natural pauses intact.
Each module outputs to the same `TriggerLogEntry`-compatible shape so Phase 4 can consume them uniformly.
 
⏸️ **Stop and confirm** each module runs independently against a real test podcast, a real test consultancy video, and a real test product-demo screen recording, with output spot-checked for accuracy before proceeding.
 
---
 
## PHASE 4 — The Director Rule Sets (per content type)
 
Create `@lib/director/rules/{podcast,consultancy,social,showcase}.ts`. Each Director is a pure function: `(signals, densitySetting, theme) => TriggerLogEntry[]`. It does not touch the Timeline directly — it only proposes triggers, which Phase 5 resolves and throttles.
 
### Podcast Director
| Trigger | Source signal | Resulting component |
|---|---|---|
| `speaker_change` | Diarization | Active Speaker Split-Card switch |
| `episode_start` | Fixed (t=0) | Lower-third nameplate intro for host/guest |
| `sustained_speech` | Diarization + amplitude | Reactive Equalizer Rails active state |
| `high_emphasis_moment` | Emphasis scoring | Pull-quote caption style |
 
B-roll is used **sparingly** for podcasts — talking-head content is the primary visual; only insert B-roll on strong topic-shift + low visual-interest stretches.
 
### Consultancy Director
| Trigger | Source signal | Resulting component |
|---|---|---|
| `stat_mention` | Stat/Number extraction | Glassmorphic Metric Ticker |
| `topic_shift` (sequential, 3+ phases) | Topic segmentation | Self-Assembling Strategy Funnel or Corporate Timeline |
| `comparison_phrase` ("compared to," "versus") | NLP phrase spotting | Self-drawing bar/line chart |
 
Motion is forced to `elegant_glide` regardless of global theme default, per the existing Physics Constant Manifest rule for this pillar.
 
### Social Director
| Trigger | Source signal | Resulting component |
|---|---|---|
| every word | Transcript timestamps | Kinetic Karaoke Text (always on for this pillar) |
| `hook_phrase` (first 3 seconds, high emphasis) | Emphasis scoring | Bold kinetic typography intro |
| `topic_shift` | Topic segmentation | Hard cut (Pacing Slider dependent) |
| `cta_phrase` ("follow," "link in bio," "subscribe") | NLP phrase spotting | Subscribe/CTA Badge |
 
### Product Showcase Director
| Trigger | Source signal | Resulting component |
|---|---|---|
| `screen_recording_segment` | Scene classification | 3D Perspective Device Mockup framing |
| `feature_callout_phrase` | Feature mention detection | Dynamic Feature Callout at detected UI region |
| `talking_head_segment` | Scene classification | Standard framing, no device mockup |
 
⏸️ **Stop and confirm** each Director produces a sane, human-reviewable list of proposed triggers (not yet placed on a Timeline) for one real test video per content type before proceeding.
 
---
 
## PHASE 5 — Trigger Resolution & Density Throttling
 
Create `@lib/director/resolveTimeline.ts`. This is where proposed triggers become actual Timeline entries:
 
1. **Rank** all proposed triggers by confidence score within each rolling time window (e.g. every 10 seconds).
2. **Throttle** per the Density Throttle Law — Minimalist keeps only the single highest-confidence trigger per window; Immersive allows several as long as they don't collide in the Layer Depth Registry bands.
3. **Layer conflict resolution** — if two realized triggers would occupy the same layer band at overlapping frames, keep the higher-confidence one and mark the other `suppressed` in the `TriggerLogEntry` log rather than silently dropping it.
4. **Resolve component props** — e.g. a realized `stat_mention` trigger becomes a concrete `MotionGraphicsEntry` referencing the Metric Card component, with `props: { label, value }` filled from the extracted data, themed via the project's `ThemeToken`, and timed to the exact transcript timestamp range (converted to frames via the composition fps).
5. **B-roll resolution** — realized `topic_shift`/low-visual-interest triggers query the existing Pexels fallback system with a search term derived from the topic label, and produce a `BRollEntry`.
Output: a complete, valid `Timeline` object satisfying the schema from Phase 2.
 
⏸️ **Stop and confirm** by rendering the full resolved Timeline for one real test video per content type, end to end, through the existing render pipeline — this is the actual "click Podcast, get a finished edit" moment. Do not proceed to Phase 6 until this works convincingly on at least three different real uploads per content type.
 
---
 
## PHASE 6 — Non-Destructive Manual Override
 
Since the Timeline is just JSON (per the existing "infinite editability" principle already established for chart data), the user must be able to:
 
1. **Delete a realized trigger's entry** — removing a `MotionGraphicsEntry`/`BRollEntry` from the Timeline and marking its `TriggerLogEntry.status` back to `suppressed`, without needing to touch anything else.
2. **Promote a suppressed trigger** — the "considered but suppressed" log from the Density Throttle should be user-visible ("we also noticed a stat here — want to show it?") so users can manually promote things the AI held back, rather than the suppression being invisible.
3. **Swap a component in a slot** — per the theme system's typed-socket principle, let a user replace a resolved component (e.g. swap a bar chart for a funnel) without re-running the whole Director pass.
4. **Re-roll a single trigger** — regenerate just one B-roll clip or one metric card's styling without touching the rest of the Timeline.
⏸️ **Stop and confirm** at least the delete and promote flows work against a real resolved Timeline before considering this phase complete.
 
---
 
## PHASE 7 — Chat-Driven Timeline Edits (stretch goal, only after Phases 1–6 are solid)
 
Once the Timeline is the reliable single source of truth, a natural-language edit layer becomes tractable: a user says "make the funnel appear earlier" or "remove the B-roll in the second half," and an LLM call translates that into a targeted mutation of the `Timeline` JSON (add/remove/adjust specific entries) rather than regenerating the whole thing. Do not start this phase until Phases 1–6 are verified — it depends entirely on the Timeline being trustworthy and inspectable first.
 
---
 
## Execution Directives
 
- **This is not a single-session build.** Treat each Phase as its own working session with its own checkpoint. Resist the urge to jump ahead to Phase 5's "magic moment" before Phases 1–4 are solid — an impressive-looking auto-assembled video built on unreliable signal extraction will just produce confidently wrong edits.
- **Every automatic decision must be inspectable.** The `TriggerLogEntry` log is not optional bookkeeping — it's what lets a non-editor trust the tool ("why did this happen") and what makes Phase 6/7 possible at all.
- **Test on real, messy content, not clean demos** — cross-talk podcasts, screen recordings with UI glitches, consultancy videos with filler words around every stat. The Director rules will need real tuning once you see how often each Trigger type over- or under-fires.
- Update `motion-graphics.md` and add a new `director-engine.md` documenting the Timeline schema, each Director's rule table, and the density throttle behavior with before/after examples per content type.

---

## Compile API (Integration Phase 1)

### `POST /api/v1/director/compile` (FastAPI)

**Auth:** Bearer token required. Project must belong to the authenticated user.

**Request body:**

```json
{
  "project_id": "uuid",
  "content_type": "podcast | consultancy | social | showcase (optional override)",
  "density": "minimalist | balanced | immersive",
  "pacing": "relaxed | balanced | aggressive (optional)",
  "signals": { "...DirectorSignals (optional — extracted from transcript when omitted)" },
  "asset_id": "uuid (optional — defaults to first ready upload)",
  "overwrite": false,
  "fps": 30,
  "width": 1920,
  "height": 1080
}
```

**Pipeline:**

1. Load project + primary asset + transcript from DB.
2. `extract_director_signals()` unless `signals` is pre-supplied.
3. Resolve `ThemeToken` from `project.settings.brand_kit` (falls back to ViraEdit defaults).
4. `POST {REMOTION_SERVICE_URL}/director/compile` → `runDirector()` → `resolveTimeline()`.
5. Persist to `director_timelines` table (version chain, separate from legacy `timelines`).
6. Archive JSON to MinIO at `projects/{projectId}/director-timelines/{timelineId}.json` when storage is available.

**Response `200`:**

```json
{
  "timelineId": "uuid",
  "timeline": { "...DirectorTimeline" },
  "version": 1,
  "hasManualOverrides": false,
  "contentType": "podcast"
}
```

**Response `409`** when active timeline has `has_manual_overrides=true` and `overwrite` is not set:

```json
{
  "detail": {
    "code": "manual_overrides_present",
    "message": "...",
    "existingTimelineId": "uuid"
  }
}
```

### `POST /director/compile` (remotion-service)

Internal Node endpoint called by the Python API. Runs `scripts/compile-director.ts` via `tsx`.

**Required fields:** `projectId`, `contentType`, `signals`, `theme`, `fps`, `durationSeconds`, `width`, `height`.

**Response:** `{ "success": true, "timeline": DirectorTimeline }`

### Overwrite safety (Phase 6 integration)

- `director_timelines.has_manual_overrides` is set when a user applies delete/promote/swap/re-roll (Phase 3 UI).
- Re-compile without `overwrite=true` returns `409` rather than clobbering hand-edited timelines.
- Each compile creates a new version row; the previous active row is deactivated (`is_active=false`, `parent_id` chain preserved).

### Content-type mapping (project → director pillar)

| Project `content_type` | Director pillar | Default resolution |
|------------------------|-----------------|--------------------|
| podcast, interview     | podcast         | 1920×1080          |
| tutorial               | consultancy     | 1920×1080          |
| vlog, shorts           | social          | 1080×1920          |
| other                  | podcast         | 1920×1080          |

---

## Long-Form Analysis Scaling (Phase 12)

Signal extraction automatically chunks content longer than **15 minutes**. Short-form
projects (≤15 min) use the original single-pass path with identical output.

### Chunk planning thresholds

| Parameter | Value |
|-----------|-------|
| Chunk threshold | 15 minutes (900 s) — below this, no chunking |
| Core window target | 9 minutes per chunk |
| Overlap buffer | 25 seconds on each side of every core window |

Implementation: `apps/api/services/director/analysis/plan_chunks.py` (Python) and
`remotion-service/src/lib/analysis/planChunks.ts` (TypeScript mirror).

### Reconciliation per module

| Module | Reconciler | Strategy |
|--------|------------|----------|
| Diarization | `reconcile_diarization` | Embedding cosine similarity (≥0.82) or temporal overlap at chunk boundaries → global speaker IDs (`G0`, `G1`, …) |
| Topic segmentation | `reconcile_topics` | Merge boundaries in overlap zones; keep higher-confidence boundary |
| Stats, emphasis, features, CTAs, scenes | `reconcile_triggers` | Deduplicate triggers within 1.5 s in overlap zones; keep highest confidence |

### Dispatch

- **Sync path:** `extract_director_signals()` → `extract_director_signals_chunked()` with `ThreadPoolExecutor` when duration > 15 min.
- **Async path:** Celery `group` of `tasks.chunked_analysis.process_chunk` + `chord` callback `tasks.chunked_analysis.reconcile` on the `analysis` queue.

### Cost accounting

Each parallel chunk records cost via `budget.record_chunk_atomic()` — one `INSERT` per
chunk into `ai_spend_records` (no read-modify-write races). The $2/hour hard limit and
$1.60/hour warning threshold see incremental cost as chunks complete.

---

## Long-Form Storage Efficiency (Phase 13)

### Binary audio analysis format

Per-frame `AudioAnalysisTrack` data is stored as gzip-compressed binary in MinIO
(`*.vae.bin.gz`), not as JSON arrays in Postgres. Encode/decode:
`processors/audio_analysis_binary.py` and `remotion-service/src/lib/audio/encodeAnalysisTrack.ts`.

Metadata pointer rows live in `audio_analysis_records` (sourceHash, storageKey, frameCount,
bandCount, peakAmplitude). Legacy JSON sidecars remain readable; migration script:
`scripts/migrate_audio_analysis_binary.py`.

### Windowed timeline API

```
GET /api/v1/timelines/{timeline_id}/window?startFrame=X&endFrame=Y
GET /api/v1/timelines/{timeline_id}/triggers?cursor=0&limit=50&status=realized
```

`timeline_entry_index` is regenerated from canonical `director_timelines.data` JSONB on every
compile/override write — never edited independently. Render/compile always reads full JSONB.

---

## Long-Form Render Scaling (Phase 14)

### Segment planning

| Parameter | Value |
|-----------|-------|
| Split threshold | 10 minutes of frames |
| Target segment duration | 4 minutes |
| Boundary rule | Split only at clip edges — never inside `TransitionEntry` or mid-clip |

Implementation: `services/render/plan_render_segments.py` and
`remotion-service/src/lib/render/planRenderSegments.ts`.

### Resumability model

`render_segments` table tracks each segment: `pending | rendering | complete | failed`.
Celery `group` renders segments in parallel; `chord` callback stitches via FFmpeg concat
(`-c copy`). Retry via `POST .../renders/{id}/retry-segments` re-dispatches **failed only**.

### Pre-export estimate

`POST /api/v1/projects/{id}/renders/estimate` — wall-clock seconds and optional infra cost
from duration × layer complexity × parallel segment factor.

### Phase 1 validation (2026-07-05)

Compile script verified for all four pillars with synthetic transcript fixtures:

| Pillar      | Motion graphics | Realized triggers | Grade warmth |
|-------------|-----------------|-------------------|--------------|
| podcast     | 1               | 4                 | 0.15         |
| consultancy | 2               | 5                 | -0.05        |
| social      | 2               | 6                 | 0.05         |
| showcase    | 2               | 6                 | 0.00         |

Each output includes `tracks.video`, `tracks.transitions`, `theme.grade`, `triggers[]` with realized/suppressed status, and traceable `triggerId` on motion graphics entries.

---

## Render Bridge (Integration Phase 2)

### Composition stack (`DirectorRenderComposition`)

When `project.settings.useDirectorEngine` is true and an active `director_timelines` row exists, export uses Remotion composition `DirectorRender` instead of the legacy FFmpeg overlay path.

**Layer order (bottom → top):**

| Layer | Component | Band |
|-------|-----------|------|
| Video + camera motion | `DirectorVideoLayer` + `CameraMotionWrapper` | 0–10 |
| Motion graphics | `MotionGraphicsComposition` (transparent bg) | 10–70 |
| VFX overlays | `VfxOverlayLayer` (math → rendered SVG/HTML) | 70–85 |
| Color grade | `ColorGrade` (full-frame SVG feColorMatrix pass) | 70–85 top |
| Audio | `DirectorAudioMixer` (dialogue + music + SFX + ducking) | n/a |

### Endpoints

- **`POST /render-director`** (remotion-service) — full H.264 export from `DirectorTimeline` JSON + presigned asset URLs.
- **Legacy path unchanged** — `POST /render-motion-graphics` still produces transparent WebM overlays for FFmpeg compositing when `useDirectorEngine` is off.

### Bridge functions

| Function | Location | Role |
|----------|----------|------|
| `timelineToMotionPlan()` | `remotion-service/src/lib/director/timelineToMotionPlan.ts` | Director timeline → `MotionPlan` (`applyColorGrade: true`) |
| `render_director_export()` | `apps/api/processors/remotion_client.py` | Python → remotion-service |
| `_try_render_director_engine()` | `apps/api/tasks/render_task.py` | Celery export gate behind `useDirectorEngine` |

### Ducking

Music bed ducking uses Remotion `<Audio volume={(f) => duckingVolumeAtFrame(...)} />` — pure function of frame per Deterministic Ducking Law.

### Multicam

`DirectorVideoLayer` reads `tracks.multicam` + `project.settings.cameraFeeds`. Layout modes: `single`, `split_dual`, `grid` with `<OffthreadVideo>` per feed.

### Feature-flag gate

```json
{ "useDirectorEngine": true }
```

in `projects.settings`. Legacy `timelines` table and FFmpeg pipeline remain the default until Phase 5 validation passes.

---

## Ingest Hardening (Integration Phase 4)

### Real diarization (pyannote.audio)

After STT completes, `tasks.transcribe` runs `diarize_audio_path()` on the extracted audio while the temp file still exists. When `HUGGINGFACE_TOKEN` (or `HF_TOKEN`) is set and `DIARIZATION_ENABLED=true`, pyannote assigns speakers to words; otherwise the pause-based A/B heuristic is used.

Speaker segments include `confidenceSource: 'ml' | 'heuristic'`. ML-sourced speaker changes rank higher in the Density Throttle (×1.0 vs ×0.85 effective confidence).

**Env:** `HUGGINGFACE_TOKEN`, `DIARIZATION_ENABLED` (default true), `PYANNOTE_DIARIZATION_MODEL` (default `pyannote/speaker-diarization-3.1`).

### B-roll resolution (No-Empty-Asset Law)

After `runDirector()` returns, `resolve_broll_entries()` searches Pexels for each B-roll entry with an empty `assetUrl`. On success the URL is populated; on failure the trigger is marked `suppressed` with `metadata.suppressionReason: 'no_asset_found'`. Re-roll overrides use the same resolver.

Requires `PEXELS_API_KEY` for stock search.

### Multicam auto-sync

When a project has **2+ video assets**, `tasks.multicam_sync.sync_project` runs automatically after upload confirm. It cross-correlates RMS audio envelopes and stores synced feeds in `project.settings.cameraFeeds`:

```json
[{ "id": "<asset-uuid>", "label": "Host camera", "sourceUrl": "<asset-uuid>", "syncOffsetFrames": 0, "speakerId": "A" }]
```

`compile_project_director_timeline` calls `ensure_project_camera_feeds()` and passes `cameraFeeds` into `runDirector()` so `tracks.multicam` is populated. Single-camera projects no-op gracefully.

---

## End-to-End Validation (Integration Phase 5)

### Automated checks (`validate_director_timeline`)

Python service: `apps/api/services/director/validate_timeline.py`

| Check ID | Law / criterion |
|----------|-----------------|
| `schema_valid` | DirectorTimeline schema complete |
| `no_empty_asset_urls` | No-Empty-Asset Law — no realized B-roll with empty `assetUrl` |
| `trigger_attribution` | Every realized trigger + MG/SFX entry has `triggerId` linkage |
| `layer_depths` | Motion graphics in content band (10–70), VFX in 70–85 |
| `flash_safety` | Glitch transitions/VFX ≤ 4 frames (Photosensitive Flash Safety) |
| `grade_*` | Content-type grade presets (warm podcast, clean consultancy, punchy social) |
| `ducking_windows` | Ducking frame ranges within timeline duration |
| `multicam_consistency` | Multicam entries reference active feeds |

### Manual checks (real exported video)

Listed in every validation report but require human review:

- Devanagari captions not clipped
- Safe-zone compliance for aspect ratio
- Grade visibly correct per pillar
- Ducking sounds natural
- Multicam switches align with speakers
- SFX audible at trigger frames

### API & scripts

| Endpoint / script | Purpose |
|-------------------|---------|
| `POST /api/v1/director/validate` | Validate arbitrary `DirectorTimeline` JSON |
| `GET /api/v1/projects/{id}/director-timeline/validation` | Validate active compiled timeline |
| `python scripts/validate_director_e2e.py --synthetic` | All 4 pillars via local TS compile + Python checks |
| `python scripts/validate_director_e2e.py --project-id UUID --compile` | Real upload → compile → validate via API |

### Phase 5 synthetic gate (2026-07-05)

Automated compile + validate passes for all four pillars using messy synthetic signals (`tests/fixtures/director_phase5_signals.py`). Real-video validation on uploaded content is still required before recommending `useDirectorEngine` as default-on.

| Pillar | Automated | Real video manual |
|--------|-----------|-------------------|
| podcast (cross-talk) | ✅ synthetic | ⏸️ pending |
| consultancy (stats + filler) | ✅ synthetic | ⏸️ pending |
| social (fast-cut hooks) | ✅ synthetic | ⏸️ pending |
| showcase (screen demo) | ✅ synthetic | ⏸️ pending |

**Production gate:** all four real-video rows must pass automated + manual checks before default-on.

---

## Phase 11 — Director-Styled Shorts & Sizzle

Shorts and Sizzle exports route through the same Director compile + `POST /render-director` path as full projects (Preview/Export Parity Law).

### Pipeline

1. **`sliceTimeline()`** — pure function `(parentTimeline, startFrame, endFrame)` → trimmed timeline; drops truncated motion-graphics/B-roll triggers per Re-Skin Consistency Law.
2. **Fallback compile** — when no parent `DirectorTimeline` exists, scoped signal extraction on the clip window + `runDirector()` (Social pillar).
3. **`reskinTimeline()`** — Consultancy/Podcast parent → Social Short: replaces pacing (`aggressive`), grade (Social preset), captions (`karaoke`), and re-runs Cuts & Motion transitions.
4. **`applyPlatformVariantToTimeline()`** — render-time only: TikTok/Instagram vs LinkedIn CTA/caption density (Platform Variant Law — one compile, many exports).
5. **`enforceVerticalSafeZones()`** — forces 9:16 dimensions so motion components apply social safe zones (bottom 15%, right 10%).

### Platform variant table

| Platform | CTA badge | Caption density | End card |
|----------|-----------|-----------------|----------|
| TikTok | yes | full_karaoke | follow_prompt |
| Instagram | yes | full_karaoke | follow_prompt |
| YouTube Shorts | yes | full_karaoke | follow_prompt |
| LinkedIn | no | reduced (standard) | none |

### Before / after

| | Raw Short extraction | Director-styled Short |
|--|---------------------|----------------------|
| Captions | Burned FFmpeg ASS | Kinetic karaoke via `DirectorRender` |
| Grade | None | Social pillar preset |
| Cuts | Single trim | Beat-synced aggressive pacing |
| CTA | None | Platform-variant badge at render time |

### API wiring

| Endpoint | Change |
|----------|--------|
| `POST /projects/{id}/shorts/{id}/render` | Passes `asset_id`, `hook`, `viral_score`; render task calls `_render_director_styled_short()` → `POST /director/prepare-styled-short` → `POST /render-director` |
| `POST /sizzle/generate` | After montage assembly, `_try_director_styled_sizzle()` compiles Social timeline; falls back to legacy caption burn |

---

## Phase 15 — Long-Form Editor Performance

Keeps the NLE and Director preview responsive on 90-minute projects. **Below threshold** (≤150 clips and ≤15 min): legacy full-timeline behavior — no windowing, full snapshot undo.

### Thresholds

| Constant | Value | Effect |
|----------|-------|--------|
| `LONG_FORM_CLIP_COUNT_THRESHOLD` | 150 | Enables viewport windowing + diff undo |
| `LONG_FORM_DURATION_THRESHOLD_SECONDS` | 900 (15 min) | Same |
| `WINDOW_PREFETCH_SECONDS` | 30 | Scroll/zoom buffer around viewport |

### Frontend (NLE)

| Module | Role |
|--------|------|
| `apps/web/stores/timelineStore.ts` | `longFormMode`, `allClips` (full set), `clips` (visible window), `totalDurationSec`, diff undo |
| `apps/web/lib/editor/timelineWindowing.ts` | Visible time window + clip filter |
| `apps/web/lib/editor/timelineHistory.ts` | JSON patch undo/redo |
| `apps/web/lib/editor/waveformPeaks.ts` | Peak cache per zoom bucket; optional `AudioAnalysisTrack` amplitudes |
| `apps/web/hooks/useTimelineWindowSync.ts` | Scroll/zoom → refresh window; debounced `GET /timelines/{id}/window` |
| `apps/web/components/editor/player/Waveform.tsx` | Cached peaks (no per-frame re-seed) |

### Remotion (DirectorRender)

| Change | Detail |
|--------|--------|
| `MotionGraphicsComposition` | Timed elements wrapped in `<Sequence>` (not internal `currentTime` checks) |
| `MulticamCompositor` | One `<Sequence>` per multicam entry |

### API

| Endpoint | Phase 15 use |
|----------|--------------|
| `GET /api/v1/timelines/{id}/window?startFrame=&endFrame=` | Prefetch director track entries on scroll (via `syncDirectorWindow`) |

### Laws (skills.md)

- **Viewport Windowing Law** — render/fetch only viewport + buffer for long projects.
- **Diff-Based Undo Law** — store structural patches, not full snapshots, above threshold.
| `POST /director/prepare-styled-short` | Remotion service orchestrator (slice → reskin → platform variant) |

---

## Phase 16 — Production Completeness

Closes coverage gaps on real long-form Podcast and Consultancy exports.

### Laws (skills.md)

- **Fallback Guarantee** — every realized trigger produces a visible outcome; B-roll failures convert to MG fallbacks.
- **Style Depth** — cloned styles populate `grade`, `motion.defaultCurve`, and `meta.brollMoodKeywords`.
- **Pre-Export Completeness Gate** — static stretches, low-confidence B-roll, and suppressed high-confidence triggers are flagged or auto-fixed before export.

### Coverage audit

| Module | Role |
|--------|------|
| `remotion-service/src/lib/director/auditCoverage.ts` | Trigger type → built/partial/missing gap report |
| `remotion-service/src/lib/director/fallbackChain.ts` | Tiered component resolution per trigger type |

### B-roll thresholds (validated Phase 16)

| Constant | Value | Meaning |
|----------|-------|---------|
| `MATCH_THRESHOLD` | 0.75 | Strong topical match |
| `PARTIAL_THRESHOLD` | 0.45 | Usable with awareness; below → Topic Title Card fallback |

| Module | Role |
|--------|------|
| `apps/api/services/director/broll_confidence.py` | Positional prior + query/tag overlap scoring |
| `apps/api/services/director/resolve_broll.py` | Pexels resolve or MG fallback (never suppress-only) |

### Pre-export gate

| Module | Role |
|--------|------|
| `apps/api/services/director/export_readiness.py` | Static stretch scan (45s), B-roll confidence, suppressed-trigger gaps |
| `POST /api/v1/director/export-readiness` | Run gate; optional `auto_resolve` inserts Topic Title Cards |
| `POST /projects/{id}/renders/estimate` | Includes `exportReadiness` summary |
| `GET /projects/{id}/director-timeline/export-readiness` | Project-scoped gate (used by Export modal) |
| `POST /projects/{id}/director-timeline/export-readiness` | Auto-fix + persist Director timeline |

### Phase 7 validation

```bash
python scripts/phase16_validate.py
```

Synthetic Podcast + Consultancy compile → B-roll fallback → readiness gate. Real uploads still required for final production proof.