## Role & Operational Protocol
 
You are continuing as the Staff Creative Engineer on ViraEdit. Two things are still missing: (1) the audio mix is dialogue-only — no SFX layer tied to visual events, no ducking under music — and (2) the platform assumes a single camera feed, with no concept of shot type or multi-camera switching. This spec adds both, sharing infrastructure with the Director Engine wherever possible.
 
Follow the phases in order. Pause at every ⏸️ checkpoint.
 
---
 
## PART A — SFX & Audio Ducking
 
### PHASE A1 — Extend `skills.md`
 
#### The SFX Attribution Law
Every SFX cue must be tied to a specific `TriggerLogEntry` or `TransitionEntry` — a whoosh plays *because* a whip-pan transition happened at that frame, a pop plays *because* a karaoke word landed. No SFX may be placed on the Timeline as an independent, untraceable decoration. This is a direct extension of the Trigger-Driven Assembly Law.
 
#### The Deterministic Ducking Law
Audio ducking (lowering music/background volume under dialogue or an SFX hit) must be expressed as a volume envelope that is a pure function of frame — computed once during Timeline resolution as a list of `{ startFrame, endFrame, targetVolume, attackFrames, releaseFrames }` windows, not as a live audio-analysis pass during render or export.
 
⏸️ **Stop and confirm** both laws are written before proceeding.
 
---
 
### PHASE A2 — SFX & Ducking Schema
 
Extend `@types/timeline.ts`:
 
```typescript
export interface SfxEntry {
  id: string;
  soundId: string;         // reference into a curated SFX asset library
  startFrame: number;
  triggerId: string;       // required — see SFX Attribution Law
  volume: number;          // 0–1
}
 
export interface DuckingWindow {
  id: string;
  trackId: string;         // which AudioClipEntry this applies to (usually the music bed)
  startFrame: number;
  endFrame: number;
  targetVolume: number;    // e.g. 0.3 = duck to 30%
  attackFrames: number;    // fade-down duration
  releaseFrames: number;   // fade-back-up duration
}
 
// Extend Timeline.tracks:
// sfx: SfxEntry[];
// (ducking windows live alongside AudioClipEntry, referenced by trackId)
```
 
Curate an initial SFX library (`@assets/sfx/`) covering: whoosh (paired with whip-pan/zoom transitions), soft pop (paired with karaoke word emphasis and callout appearances), subtle click (paired with metric card/chart reveals), riser (paired with hook-phrase moments in Social).
 
⏸️ **Stop and confirm** the schema compiles and one hand-written `SfxEntry` + `DuckingWindow` pair renders correctly (audible SFX, audible music dip) through the existing render pipeline.
 
---
 
### PHASE A3 — Ducking Resolution
 
Build `@lib/audio/resolveDucking.ts`:
 
1. For every dialogue segment (from the transcript's word-level timestamps) and every `SfxEntry`, generate a `DuckingWindow` against the music/background track: attack starts slightly before the dialogue/SFX begins, release starts slightly after it ends.
2. Overlapping ducking windows on the same track merge into one continuous envelope rather than stacking multiplicatively (avoid the music dropping to near-silence when dialogue and an SFX overlap).
3. The resulting `targetVolume` at any frame is computed once during Timeline resolution and stored — the actual playback simply reads `AudioClipEntry`'s per-frame volume via Remotion's `<Audio volume={...}>` prop as an `interpolate()` over frame, per the Deterministic Ducking Law.
⏸️ **Stop and confirm** a test composition with dialogue + a music bed + at least one SFX cue produces a natural-sounding mix — music audibly ducks under dialogue and swells back up in gaps — before proceeding to Part B.
 
---
 
### PHASE A4 — Director Integration
 
Extend each Director's rule set with SFX defaults:
- **Podcast** — minimal SFX; maybe a subtle riser/pop only on strong `high_emphasis_moment` triggers. Music bed ducking under dialogue always active if a music bed is present.
- **Consultancy** — SFX limited to a subtle click on metric card/chart reveals; no whooshes (matches the restrained VFX approach from the Look & VFX Engine).
- **Social** — full SFX palette: whoosh on every beat-synced transition, pop on karaoke emphasis, riser on hook phrases.
- **Showcase** — click/chime on feature callouts, subtle whoosh on device-mockup transitions.
⏸️ **Stop and confirm** with one full end-to-end render per content type.
 
---
 
## PART B — Shot Type & Multicam Layout
 
### PHASE B1 — Extend `skills.md`
 
#### The Multicam Sync Law
When a project has multiple camera feeds, they must be aligned to a single shared timeline via cross-correlation of their audio waveforms (or clapperboard/timecode if present), computed once at ingest — never assumed pre-synced by upload order. All downstream shot-switching logic operates on this one synced timeline.
 
#### The Shot Continuity Law
Automatic camera-angle switching must respect a minimum shot duration (avoid rapid, disorienting flicker between angles) and should bias toward cutting on speaker changes or topic shifts (existing Director signals) rather than on arbitrary timers.
 
⏸️ **Stop and confirm** both laws are written before proceeding.
 
---
 
### PHASE B2 — Shot Type Detection
 
Extend the Director Engine's Scene/Shot Classification module (Phase 3 of the Director Engine spec) from its narrow talking-head/screen-recording distinction into a general shot-type classifier:
 
```typescript
export type ShotType = 'wide' | 'medium' | 'close_up' | 'screen_recording' | 'insert_broll';
 
export interface ShotClassification {
  startTime: number;
  endTime: number;
  shotType: ShotType;
  confidence: number;
  faceBoundingBoxRatio?: number; // face area / frame area, used to derive wide/medium/close_up
}
```
 
Use face-detection bounding-box size relative to frame as the primary heuristic for wide/medium/close-up on talking-head footage; reuse the existing screen-recording classifier for that category.
 
**Use case:** feeds the Cuts & Motion Engine's `push_in` camera motion — a `wide` shot is a good candidate for a slow push-in over a long monologue segment; a `close_up` shot should not get additional push-in (already tight).
 
⏸️ **Stop and confirm** shot classification runs against a real test video and produces sane labels before proceeding.
 
---
 
### PHASE B3 — Multicam Feed & Layout Schema
 
Create `@types/multicam.ts`:
 
```typescript
export interface CameraFeedRef {
  id: string;
  label: string;             // e.g. "Host camera", "Guest camera", "Wide shot"
  sourceUrl: string;
  syncOffsetFrames: number;  // resolved once at ingest via the Multicam Sync Law
}
 
export type LayoutMode = 'single' | 'split_dual' | 'grid';
 
export interface MulticamEntry {
  id: string;
  startFrame: number;
  endFrame: number;
  layoutMode: LayoutMode;
  activeFeedIds: string[];   // one feed for 'single', two+ for 'split_dual'/'grid'
  triggerId: string;         // links to the speaker_change/topic_shift trigger that caused this switch
}
 
// Extend Timeline.tracks:
// multicam: MulticamEntry[];
```
 
⏸️ **Stop and confirm** the schema compiles and supports at least a 2-camera podcast test project.
 
---
 
### PHASE B4 — Multicam Switching Logic
 
Build `@lib/director/resolveMulticam.ts`:
 
1. On `speaker_change` triggers (from diarization), switch `layoutMode: 'single'` to the feed matching the now-speaking person, if a dedicated camera exists for them.
2. When both speakers talk simultaneously (cross-talk) or during a natural conversational beat, switch to `split_dual` — this directly reuses the existing **Active Speaker Split-Cards** component's visual logic, but now driving real camera feed selection instead of a decorative card, per the Shot Continuity Law's minimum-duration rule.
3. `grid` layout is reserved for 3+ camera setups or explicit multi-guest podcast formats.
4. Respect `minCameraHoldFrames` (a pacing-profile-aligned floor, reusing the Cuts & Motion Engine's `PacingProfile.minClipDurationFrames`) so switches never flicker faster than is watchable.
⏸️ **Stop and confirm** a full end-to-end render of a real 2-camera test podcast recording, showing sensible angle-switching synced to actual speaker changes, before considering this system complete.
 
---
 
## Execution Directives
 
- **Multicam only activates if multiple synced feeds actually exist for a project** — single-camera podcasts (the common case) should be entirely unaffected; verify the Director gracefully no-ops the multicam system when only one feed is present, per the existing Graceful Degradation Law.
- **SFX restraint matters as much as VFX restraint** — a Consultancy pitch with click sounds on every metric card is charming for the first three and annoying by the tenth; verify the Density Throttle is actually suppressing excess SFX triggers, not just motion graphics ones.
- Update `director-engine.md` with the SFX/ducking rules per content type, the shot-type classifier's heuristics, and the multicam switching logic with a before/after example on a real 2-camera test recording.