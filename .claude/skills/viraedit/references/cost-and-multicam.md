# ViraEdit — Cost Breakdown & Multi-Camera Architecture
# Real 2026 pricing. Honest numbers. No surprises.

---

# PART 1: WHAT THIS COSTS TO RUN

## The Only Costs You Pay

You are running this locally on your own Windows PC.
There are NO monthly subscription fees to ViraEdit itself.

Your only costs are:
1. **Groq API** — transcription + AI analysis (pay per use)
2. **Electricity** — your PC running during processing
3. **Optionally**: Claude/OpenAI API for premium suggestions (you control this)

Everything else (database, storage, rendering, workers) runs on your machine for free.

---

## REAL 2026 API PRICING (Verified)

### Groq Whisper Large v3 Turbo (Transcription)
- **Price**: $0.04 per hour of audio
- **Speed**: 228x real-time (1 hour audio transcribed in ~16 seconds)
- **Nepali**: Supported with `language="ne"`
- **Free tier**: 2,000 requests/day (enough for testing)

### Groq Llama 3.3 70B (AI Analysis)
- **Input**: $0.59 per million tokens
- **Output**: $0.79 per million tokens
- **Speed**: ~394 tokens/second (very fast)
- **Quality**: GPT-4o equivalent quality

### Groq Llama 3.1 8B (Cheap reasoning, simple tasks)
- **Input**: $0.05 per million tokens
- **Output**: $0.08 per million tokens
- **Use for**: Caption generation, simple classifications

### Local Ollama (Free fallback)
- **Price**: $0.00 (runs on your CPU/GPU)
- **Speed**: Slower (depends on your hardware)
- **Auto-activated**: When Groq budget limit hit

---

## COST PER 1 HOUR OF VIDEO — DETAILED BREAKDOWN

### Assumptions
- 1 hour video = 3,600 seconds of audio
- Average scene: 45 seconds (≈80 scenes per hour)
- Average tokens per scene analysis: ~800 input, ~400 output
- Captions: generated from transcript (no LLM needed)
- SVG visuals: code-generated (no LLM needed)

### Line-by-Line Cost Table

```
TASK                          MODEL               CALC                    COST
────────────────────────────────────────────────────────────────────────────────
Transcription (1hr audio)     Groq Whisper        1hr × $0.04/hr          $0.040
Speaker diarization           pyannote (local)    runs on your CPU        $0.000
Scene detection               PySceneDetect       runs locally            $0.000
Scene analysis (80 scenes)    Groq Llama 3.3 70B  80 × 800 tokens in      
                                                  = 64,000 tokens in
                                                  × $0.59/M               $0.038
                              +                   80 × 400 tokens out
                                                  = 32,000 tokens out
                                                  × $0.79/M               $0.025
Hook rewriting (80 scenes)    Groq Llama 3.3 70B  80 × 300 in / 200 out   
                                                  = 24,000 in / 16,000 out
                                                  ($0.014 + $0.013)       $0.027
Filler detection              Rule-based          no API call             $0.000
Silence detection             librosa (local)     runs locally            $0.000
Shorts extraction (10 clips)  Groq Llama 3.3 70B  10 × 500 in / 300 out  $0.009
Viral scoring                 Groq Llama 3.3 70B  10 × 200 in / 100 out  $0.002
Caption generation            Rule-based          no API call             $0.000
SVG visual generation         Code templates      no API call             $0.000
Prompt commands (avg 5/hr)    Groq Llama 3.3 70B  5 × 300 in / 200 out   $0.002
Embeddings (semantic search)  local model         runs locally            $0.000
────────────────────────────────────────────────────────────────────────────────
TOTAL per 1 hour of video                                                 $0.143
────────────────────────────────────────────────────────────────────────────────
```

### **Cost per 1 hour of video: ~$0.14**

That's **14 cents** per hour of video processed.
The original budget was $2.00/hr.
**You're using only 7% of the budget.**

---

## COST BY CONTENT LENGTH

| Video Length | Transcription | AI Analysis | Total | Notes |
|-------------|---------------|-------------|-------|-------|
| 5 min short | $0.003 | $0.012 | **$0.015** | ~1.5 cents |
| 15 min vlog | $0.010 | $0.035 | **$0.045** | ~4.5 cents |
| 30 min podcast | $0.020 | $0.071 | **$0.091** | ~9 cents |
| 1 hour podcast | $0.040 | $0.143 | **$0.143** | ~14 cents |
| 2 hour podcast | $0.080 | $0.143 | **$0.223** | ~22 cents* |

*2hr+ uses caching and hierarchical summarization — cost doesn't scale linearly.

---

## MONTHLY COST SCENARIOS

### Light User (4 videos/month, avg 30 min each)
```
4 videos × 30 min × $0.091/hr ÷ 2  =  $0.18/month
```
**Less than 20 cents per month.**

### Regular Creator (12 videos/month, avg 45 min each)
```
12 videos × 45 min × $0.143/hr ÷ (60/45)  =  $1.29/month
```
**About $1.30/month.**

### Heavy Podcaster (20 episodes/month, avg 90 min each)
```
20 episodes × 90 min × $0.143/hr ÷ (60/90)  =  $6.44/month
```
**About $6.50/month.**

### Multi-Camera Podcast (3 cameras × 90 min, 10 episodes/month)
```
Transcription: only 1 audio track needed
Analysis: same as single camera
Extra cost for multi-camera sync: ~0 (FFmpeg, local)
10 episodes × 90 min × $0.143/hr ÷ (60/90)  =  $3.22/month
```
**About $3.25/month.**

---

## IF YOU USE PREMIUM AI (Optional)

If you enable Claude Sonnet or GPT for high-quality suggestions
(only for specific "premium analysis" requests):

| Task | Model | Cost |
|------|-------|------|
| Premium hook rewrite | Claude Sonnet | +$0.05/video |
| Deep narrative analysis | Claude Sonnet | +$0.08/video |
| Full premium analysis | Claude Sonnet | +$0.15/video |

Still cheap. And it's opt-in — only when you ask for it.

---

## GROQ FREE TIER: WHAT YOU GET

Before you spend a single dollar:

| Limit | Free Tier |
|-------|-----------|
| Whisper requests/day | 2,000 |
| Llama 3.3 70B tokens/min | 6,000 |
| Llama 3.3 70B requests/day | 1,000 |
| Cost | $0.00 |

**For testing: completely free.**
For regular use: pay-as-you-go, no monthly minimum.

**Developer tier** (add credit card, still mostly free):
- 10x higher rate limits
- 25% discount on all paid usage
- Recommended once you start using it regularly

---

## COST CONTROLS BUILT INTO VIRAEDIT

The app enforces your budget automatically:

```
Budget: $2.00 per hour of video (you can lower this)

At $0.00 - $1.60:  Use Groq Llama 3.3 70B (best quality)
At $1.60 - $1.80:  Switch to Groq Llama 3.1 8B (slightly lower quality)
At $1.80 - $2.00:  Switch to Ollama local (free, slower)
At $2.00+:         Block expensive calls, use local only
```

You can set this limit to anything. Set it to $0.50/hr if you want
to force local-only processing.

---

# PART 2: MULTI-CAMERA ARCHITECTURE

## The Problem

You record a podcast with 3 camera angles:
- Camera A: Wide shot (both hosts)
- Camera B: Close-up Host 1
- Camera C: Close-up Host 2

These are 3 separate video files that must be:
1. Synchronized to the exact same moment in time
2. Auto-switched based on who is speaking
3. Editable manually if the AI picks wrong angles
4. Exportable as a single polished video

---

## SYNC METHODS (In Priority Order)

### Method 1: Audio Fingerprint Sync (Best, automatic)
All 3 cameras record the same audio.
Find the same audio moment in all 3 files.
Align them to within 1 frame (33ms at 30fps).

```python
# packages/ai/src/multicam/audio_sync.py

class AudioFingerprintSync:
    """
    Uses audio cross-correlation to find offset between cameras.
    Works even if one camera was started late.
    Accurate to within 1-2 frames.
    """
    
    def sync_cameras(self, camera_files: list[str]) -> list[CameraOffset]:
        """
        Returns the start offset for each camera relative to the earliest.
        
        Example output:
        [
          CameraOffset(camera=0, offset_ms=0),      # reference camera
          CameraOffset(camera=1, offset_ms=1240),   # started 1.24s late
          CameraOffset(camera=2, offset_ms=-320),   # started 0.32s early
        ]
        """
        # 1. Extract audio from all cameras
        # 2. Use cross-correlation to find offset of each vs camera 0
        # 3. Return offsets for timeline alignment
        
        audio_tracks = [self._extract_mono_audio(f) for f in camera_files]
        reference = audio_tracks[0]
        offsets = [CameraOffset(camera=0, offset_ms=0)]
        
        for i, audio in enumerate(audio_tracks[1:], 1):
            offset_ms = self._cross_correlate(reference, audio)
            offsets.append(CameraOffset(camera=i, offset_ms=offset_ms))
        
        return offsets
    
    def _cross_correlate(self, ref: np.ndarray, target: np.ndarray) -> float:
        """
        Find time offset using cross-correlation.
        Returns offset in milliseconds.
        """
        from scipy.signal import correlate
        correlation = correlate(ref, target, mode='full')
        offset_samples = np.argmax(correlation) - len(ref) + 1
        return (offset_samples / self.sample_rate) * 1000
```

### Method 2: Clap/Slate Detection (Fallback)
If audio sync fails, look for a sharp transient (clap, slate clapper, finger snap).

### Method 3: Manual Sync Point (User fallback)
User plays all 3 cameras and marks a common point in each.
UI shows 3 video thumbnails side by side, user drags to align.

---

## MULTI-CAMERA TIMELINE MODEL

Once synced, cameras become tracks in the timeline:

```
Timeline (synchronized):
                    t=0        t=30s       t=1min      t=1:30
                    |          |           |           |
Cam A (Wide)   ████████████████████████████████████████  ← always present
Cam B (Host 1)      [active when H1 speaks]              ← auto-switched
Cam C (Host 2)              [active when H2 speaks]      ← auto-switched
Audio          ████████████████████████████████████████  ← single audio track
Captions       ████████████████████████████████████████
```

**Key principle**: Only ONE video track is "active" at any frame.
The multicam switcher decides which camera to show.
The underlying cameras are all still there — just not visible until activated.

---

## AUTO-SWITCHING LOGIC (AI Director)

The AI acts as a camera director, switching based on:

```python
# packages/ai/src/multicam/ai_director.py

class AIDirector:
    """
    Decides which camera to show at each moment.
    Thinks like a professional video director.
    """
    
    SWITCHING_RULES = {
        # Rule 1: Active speaker gets close-up
        'active_speaker': {
            'priority': 1,
            'description': 'Show close-up of whoever is speaking',
            'min_duration_ms': 2000,  # stay on speaker for at least 2s
        },
        
        # Rule 2: Reaction shots
        'reaction_shot': {
            'priority': 2,
            'description': 'Cut to listener during long speaker turns',
            'trigger': 'speaker talking > 15s without cut',
            'duration_ms': 3000,  # hold reaction for 3s
        },
        
        # Rule 3: Wide shot for transitions
        'topic_transition': {
            'priority': 3,
            'description': 'Use wide shot at topic changes',
            'trigger': 'topic_change_detected',
            'duration_ms': 2000,
        },
        
        # Rule 4: Wide shot for emotional moments
        'emotional_moment': {
            'priority': 4,
            'description': 'Wide shot shows both hosts during key moments',
            'trigger': 'emotion_score > 0.8',
        },
        
        # Rule 5: Avoid rapid cutting
        'min_shot_duration': {
            'description': 'Never cut faster than every 2 seconds',
            'min_ms': 2000,
        },
        
        # Rule 6: Nepali conversation patterns
        'nepali_turn_taking': {
            'description': '''
                Nepali podcast conversations often have longer turn-taking
                (less frequent interruption than English podcasts).
                Hold on speaker longer before cutting to reaction.
            ''',
            'min_speaker_duration_ms': 4000,  # vs 2000 for English
        }
    }
    
    def generate_cut_plan(
        self, 
        speakers: list[SpeakerSegment],
        cameras: list[CameraAssignment],
        scenes: list[Scene]
    ) -> list[CameraSwitch]:
        """
        Generate a complete cut plan for the multicam edit.
        Returns a list of switches: {time_ms, camera_id, reason}
        """
```

---

## SPEAKER-TO-CAMERA MAPPING

The system needs to know which camera shows which speaker.
This is detected automatically but user can correct it.

```python
class SpeakerCameraMapper:
    
    def auto_detect_mapping(
        self, 
        diarization: list[SpeakerSegment],
        camera_files: list[str]
    ) -> dict[str, int]:
        """
        Auto-detect which camera shows which speaker using:
        1. Face detection per camera
        2. Speaker diarization from audio
        3. Correlation: when Speaker A is active, which camera
           shows a single face vs two faces?
        
        Returns: {'SPEAKER_0': 1, 'SPEAKER_1': 2, 'both': 0}
        """
```

**UI for speaker mapping:**
```
┌──────────────────────────────────────────────┐
│  Map Speakers to Cameras                     │
│                                              │
│  [Camera A frame]  [Camera B frame]  [Cam C] │
│  Wide Shot         Close-up          Close-up│
│                                              │
│  Speaker A (blue)  [Camera A ▼]             │
│  Speaker B (orange)[Camera B ▼]             │
│  Both speaking     [Camera A ▼]             │
│                                              │
│  [Auto-detect] [Save Mapping]               │
└──────────────────────────────────────────────┘
```

---

## MULTI-CAMERA UPLOAD FLOW (UI)

### Step 1: Upload Detection
When user uploads multiple files simultaneously, detect if they're multi-camera:

```typescript
// Detection heuristics:
// - Similar duration (within 10% of each other)
// - Uploaded at the same time (same session)
// - Same audio fingerprint detected
// → Ask user: "These look like multi-camera footage. Set up as multicam project?"
```

### Step 2: Multi-Camera Upload UI

```
┌────────────────────────────────────────────────┐
│  📹 Multi-Camera Project Detected              │
│                                                │
│  3 files uploaded with similar duration        │
│                                                │
│  [Camera 1]  vlog_cam_a.mp4  (1:24:32)  Wide  │
│  [Camera 2]  vlog_cam_b.mp4  (1:24:28)  ✏    │
│  [Camera 3]  vlog_cam_c.mp4  (1:24:35)  ✏    │
│                                                │
│  Sync method:                                  │
│  ● Auto sync (audio fingerprint)               │
│  ○ Manual sync point                           │
│  ○ Use timecode                                │
│                                                │
│  [Set Up as Multi-Camera] [Upload Separately]  │
└────────────────────────────────────────────────┘
```

### Step 3: Processing Progress (Multi-Camera)

```
✅ All 3 cameras uploaded
✅ Syncing cameras...
   Camera B: starts 1.24s after Camera A
   Camera C: starts 0.32s before Camera A
✅ Cameras synchronized (±1 frame accuracy)
⟳ Transcribing audio...
⟳ Detecting speakers...
⟳ AI Director planning cuts...
✅ Ready to edit!

Sync accuracy: ±1 frame (33ms)
[View sync report]
```

### Step 4: Multicam Editor

The editor shows all cameras as selectable options:

```
┌──────────┬──────────────────────────┬─────────────────────┐
│ CAMERAS  │   ACTIVE PREVIEW         │  AI SUGGESTIONS     │
│          │                          │                     │
│ [Cam A]  │  ┌──────────────────┐   │ 🎬 Camera Switches  │
│  Wide    │  │  ACTIVE CAMERA   │   │                     │
│ [Cam B]* │  │  (currently B)   │   │ 12 auto-switches    │
│  Host 1  │  └──────────────────┘   │ 94% match to        │
│ [Cam C]  │                          │ director rules      │
│  Host 2  │  Click camera to         │                     │
│          │  override at playhead    │ [Review Switches]   │
└──────────┴──────────────────────────┴─────────────────────┘

MULTICAM TIMELINE:
         0s        30s       1min      1:30      2min
Active   AAABBBAAACCCBBBAAABBBCCCAAABBBAAACCCBBB (A=wide,B=host1,C=host2)
Cam A    ──────────────────────────────────────── (always present)
Cam B    ──────────────────────────────────────── (always present)
Cam C    ──────────────────────────────────────── (always present)
Audio    ──────────────────────────────────────── 
Captions ██████████████████████████████████████
```

**Editing a camera switch:**
- Click any segment in "Active" row → select which camera to use instead
- Drag boundary between segments → move the switch point
- Right-click → "Let AI re-decide this section"

---

## MULTI-CAMERA RENDER

When rendering, the compiler selects the correct camera frame at each timecode:

```python
# workers/render/multicam_renderer.py

class MulticamRenderer:
    
    def compile_to_ffmpeg(
        self, 
        timeline: Timeline,
        camera_files: list[str],
        camera_offsets: list[CameraOffset],
        switches: list[CameraSwitch]
    ) -> str:
        """
        Generates FFmpeg filter_complex that:
        1. Loads all camera files with correct offsets
        2. Uses 'select' filter to switch between cameras at correct times
        3. Produces single output video with best camera at each moment
        
        Example FFmpeg filter_complex:
        [0:v]trim=start=1.24,setpts=PTS-STARTPTS[cam_a];
        [1:v]trim=start=0,setpts=PTS-STARTPTS[cam_b];
        [2:v]trim=start=0,setpts=PTS-STARTPTS[cam_c];
        [cam_a][cam_b][cam_c]concat=n=3:v=1[out]
        """
```

---

## DATABASE CHANGES FOR MULTI-CAMERA

Additional tables needed:

```sql
-- Multi-camera project group
CREATE TABLE multicam_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  sync_method VARCHAR(50),           -- audio_fingerprint, clap, manual, timecode
  sync_accuracy_ms DECIMAL,          -- achieved sync accuracy
  reference_camera_id UUID,          -- which camera is the reference (offset=0)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Camera assignments
CREATE TABLE multicam_cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  multicam_project_id UUID REFERENCES multicam_projects(id),
  asset_id UUID REFERENCES assets(id),
  camera_label VARCHAR(100),         -- 'Wide Shot', 'Host 1', 'Host 2'
  camera_angle VARCHAR(50),          -- wide, close_up, medium, broll
  speaker_assignment VARCHAR(100),   -- 'SPEAKER_0', 'SPEAKER_1', 'both', null
  offset_ms INTEGER DEFAULT 0,       -- sync offset from reference
  order_index INTEGER                -- display order in UI
);

-- AI-generated cut plan
CREATE TABLE multicam_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  multicam_project_id UUID REFERENCES multicam_projects(id),
  time_ms INTEGER NOT NULL,          -- when to switch
  from_camera_id UUID,               -- switching from
  to_camera_id UUID,                 -- switching to
  reason VARCHAR(100),               -- 'active_speaker', 'reaction', 'transition'
  confidence DECIMAL(3,2),
  is_manual_override BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## COST IMPACT OF MULTI-CAMERA

Multi-camera adds almost NO extra AI cost:

| Step | Extra cost vs single camera |
|------|-----------------------------|
| Audio sync | $0.00 (FFmpeg cross-correlation) |
| Extra transcription | $0.00 (only transcribe 1 audio track) |
| Camera switch AI | ~$0.02 (one extra LLM call for cut plan) |
| Render | $0.00 (FFmpeg, local) |
| **Total extra** | **~$0.02 per episode** |

Multi-camera is basically free in terms of API costs.
The only real cost is extra disk space and render time.

---

## MULTI-CAMERA EPIC (EP-2.7)

Add to Phase 2 build:

### EP-2.7 — Multi-Camera Sync & AI Director

**User Story**: I upload 3 camera angle videos, ViraEdit automatically
syncs them and switches cameras intelligently based on who is speaking.

### Tasks

**T-2.7.1** Audio fingerprint sync engine
- Cross-correlation using scipy
- Handles cameras started at different times
- Returns offset_ms for each camera
- Accuracy: ±1 frame (33ms)

**T-2.7.2** Multi-camera upload UI
- Detect when multiple similar-duration files uploaded
- Show multicam setup dialog
- Camera labeling (drag to reorder, rename)

**T-2.7.3** Speaker-to-camera mapper
- Face detection per camera
- Correlation with diarization
- Manual override UI

**T-2.7.4** AI Director cut planner
- Apply SWITCHING_RULES to generate cut plan
- Nepali conversation pattern awareness
- Returns list of CameraSwitch events

**T-2.7.5** Multicam timeline UI
- Active camera row at top of timeline
- All camera tracks visible below
- Click to override any switch
- Drag boundaries to adjust timing

**T-2.7.6** Multicam render
- FFmpeg filter_complex for multi-input select
- Applies all offsets correctly
- Handles cameras with different resolutions (normalize to highest)

### Tests
```python
def test_audio_sync_accurate_within_2_frames()
def test_clap_detection_finds_sync_point()
def test_speaker_mapping_assigns_cameras_correctly()
def test_ai_director_follows_min_shot_duration()
def test_multicam_render_produces_valid_mp4()
def test_manual_override_respected_in_render()
def test_nepali_turn_taking_rules_applied()
```

### Done Criteria
3-camera podcast syncs automatically and plays back with
intelligent camera switching matching who is speaking.
