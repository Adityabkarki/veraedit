# ViraEdit — Style Transfer & Language Reference

---

# PART 1: LANGUAGE ARCHITECTURE

## What Is and Isn't in Nepali

### English (App Language — Everything UI)
- All button labels, menus, settings
- All error messages
- All AI suggestion text
- All onboarding text
- All dashboard, editor, panels
- All export dialogs
- API responses
- Log files

### Nepali (Content Language — Only What Comes FROM Videos)
- Transcription output (Devanagari text from speech)
- Auto-generated captions (rendered on video)
- Transcript editor panel (shows Nepali words from video)
- Speaker labels in transcript (shows actual spoken words)
- AI analysis of Nepali content (internal, results shown in English)
- Show notes / chapters generated FROM Nepali podcast content
  → Generated IN ENGLISH (summarizing Nepali content)
  → Optional: toggle to also show Nepali version

### Bilingual (User's Choice)
- Caption style: English translation below Nepali (optional toggle)
- AI Producer outputs: English summary of Nepali content
- Hook suggestions: shown in English AND Nepali alternatives

## The Simple Rule

> The APP speaks English.
> The VIDEO CONTENT is in Nepali.
> The AI understands both.

```
User interface:     "Remove filler words"     ← English
Transcript panel:   "हैन र, भनेको, साथीहरू"  ← Nepali (from video)
AI suggestion:      "Found 8 filler words,    ← English
                     saves 12 seconds"
Caption on video:   "साथीहरू, आज हामी..."    ← Nepali (user's speech)
Export dialog:      "Export to TikTok"        ← English
```

## Whisper Configuration (Unchanged)
```python
# Still transcribe as Nepali — this doesn't change
response = groq_client.audio.transcriptions.create(
    file=audio_file,
    model="whisper-large-v3-turbo",
    language="ne",           # Detect Nepali speech
    response_format="verbose_json",
    timestamp_granularities=["word"]
)
```

## Remove From Codebase
- ❌ UI language toggle (English/नेपाली) — not needed
- ❌ Bilingual button labels
- ❌ Nepali onboarding text
- ❌ Nepali error messages
- ❌ "नमस्ते!" welcome screen

## Keep in Codebase
- ✅ Nepali transcription (language="ne")
- ✅ Devanagari font for captions rendered ON video
- ✅ Nepali filler word detection
- ✅ Nepali hook rewriting (for AI suggestions about video content)
- ✅ Nepali caption styles (Noto Sans Devanagari on video)
- ✅ Bilingual caption option (Nepali + English translation on video)

---

# PART 2: STYLE TRANSFER SYSTEM

## What This Does

User provides a reference video (URL or upload).
ViraEdit analyzes it and extracts its "editing DNA":
- Cut frequency and rhythm
- Caption style (font, size, position, animation)
- Color grade
- Transition types
- B-roll frequency
- Music energy
- Hook structure
- Pacing pattern
- Visual overlay style
- Text overlay style

Then applies that DNA to the user's own video.

## Input Methods

### Method 1: Paste a URL
```
Supported:
- YouTube: https://youtube.com/watch?v=...
- TikTok:  https://tiktok.com/@user/video/...
- Instagram Reels: https://instagram.com/reel/...
- X/Twitter video URLs
- Direct MP4 URLs
```

### Method 2: Upload a Video File
- Drag and drop any MP4/MOV file
- Used as style reference only (not published anywhere)
- Deleted after style extraction

### Method 3: Component Extraction
User marks WHICH part of the reference video to learn from:
- "Just copy the caption style"
- "Just copy the intro hook structure"
- "Just copy the b-roll pacing"
- "Copy everything"

---

## STYLE EXTRACTION PIPELINE

```python
# packages/ai/src/style_transfer/extractor.py

class StyleExtractor:
    """
    Analyzes a reference video and extracts its editing style
    as a reusable StyleDNA object.
    """

    async def extract(
        self,
        video_path: str,
        components: list[StyleComponent] = None  # None = extract all
    ) -> StyleDNA:

        # Run all extraction in parallel
        results = await asyncio.gather(
            self._extract_pacing(video_path),
            self._extract_caption_style(video_path),
            self._extract_color_grade(video_path),
            self._extract_transitions(video_path),
            self._extract_audio_profile(video_path),
            self._extract_visual_overlays(video_path),
            self._extract_hook_structure(video_path),
            self._extract_broll_pattern(video_path),
        )

        return StyleDNA(
            pacing=results[0],
            captions=results[1],
            color=results[2],
            transitions=results[3],
            audio=results[4],
            visuals=results[5],
            hook=results[6],
            broll=results[7],
            source_url=video_path,
            extracted_at=datetime.now()
        )
```

---

## WHAT GETS EXTRACTED (StyleDNA)

```python
@dataclass
class StyleDNA:
    # ── PACING ──────────────────────────────────────────────
    pacing: PacingProfile
    # avg_cut_duration_ms: 2300
    # cuts_per_minute: 26
    # rhythm: "constant" | "variable" | "building"
    # silence_tolerance_ms: 200
    # speed_ramps: bool

    # ── CAPTIONS ────────────────────────────────────────────
    captions: CaptionStyleProfile
    # font_family: "Impact" | "Inter" | etc
    # font_size_vw: 5.2          (% of video width)
    # position: "center" | "bottom" | "top"
    # color: "#FFFFFF"
    # stroke: "#000000"
    # stroke_width: 3
    # animation: "pop" | "word-by-word" | "none" | "slide"
    # max_words_per_line: 3
    # case: "uppercase" | "normal"
    # highlight_color: "#FFD700"

    # ── COLOR GRADE ─────────────────────────────────────────
    color: ColorProfile
    # brightness: 0.05
    # contrast: 0.15
    # saturation: 0.1
    # temperature: 0.1    (warm/cool)
    # shadows: -0.05
    # highlights: 0.05
    # lut_match: str       (closest named LUT)

    # ── TRANSITIONS ─────────────────────────────────────────
    transitions: TransitionProfile
    # primary_type: "cut" | "dissolve" | "zoom" | "whip"
    # avg_duration_ms: 150
    # uses_sound_effects: bool
    # sound_effect_type: "whoosh" | "hit" | "none"

    # ── AUDIO ────────────────────────────────────────────────
    audio: AudioProfile
    # music_energy: "none" | "low" | "medium" | "high"
    # music_genre_hint: "lo-fi" | "hiphop" | "cinematic" | etc
    # ducking_aggressiveness: "subtle" | "moderate" | "heavy"
    # voice_eq: "warm" | "bright" | "neutral"
    # normalization_target_lufs: -14

    # ── VISUAL OVERLAYS ──────────────────────────────────────
    visuals: VisualProfile
    # uses_text_overlays: bool
    # text_style: "minimal" | "bold" | "neon" | "corporate"
    # uses_arrows_circles: bool
    # uses_emoji: bool
    # overlay_density: "sparse" | "moderate" | "dense"

    # ── HOOK STRUCTURE ───────────────────────────────────────
    hook: HookProfile
    # hook_type: "bold_claim" | "story" | "question" | "reaction"
    # hook_duration_s: 4.2
    # uses_text_hook_overlay: bool
    # hook_text_style: detected style of text if present

    # ── B-ROLL PATTERN ───────────────────────────────────────
    broll: BrollProfile
    # frequency: "low" | "medium" | "high"
    # avg_broll_duration_ms: 2800
    # broll_timing: "motivated" | "random" | "rhythmic"
    # reaction_shots: bool
```

---

## HOW EXTRACTION WORKS TECHNICALLY

### Pacing Extraction
```python
async def _extract_pacing(self, video_path: str) -> PacingProfile:
    """
    Use PySceneDetect to find every cut.
    Calculate: avg cut duration, cuts/minute, rhythm pattern.
    """
    scenes = detect_scenes(video_path, threshold=27.0)
    durations = [s.end_ms - s.start_ms for s in scenes]
    return PacingProfile(
        avg_cut_duration_ms=statistics.mean(durations),
        cuts_per_minute=len(scenes) / (total_duration_ms / 60000),
        rhythm=self._classify_rhythm(durations),
        # std_dev tells us if pacing is constant or variable
        rhythm_variance=statistics.stdev(durations)
    )
```

### Caption Style Extraction
```python
async def _extract_caption_style(self, video_path: str) -> CaptionStyleProfile:
    """
    Use OpenCV to sample frames and detect text overlays.
    Use Tesseract/EasyOCR to read caption text.
    Analyze: position, font size (relative), color, stroke.
    """
    # Sample 1 frame per second
    frames = sample_frames(video_path, fps=1)

    # Detect text regions using EAST text detector
    text_regions = [detect_text_regions(f) for f in frames]

    # Analyze the most common text style
    return self._analyze_text_style(text_regions)
```

### Color Grade Extraction
```python
async def _extract_color_grade(self, video_path: str) -> ColorProfile:
    """
    Sample frames, analyze color statistics.
    Compare to neutral baseline to detect grade.
    """
    frames = sample_frames(video_path, fps=0.5)  # 1 per 2 seconds
    return ColorProfile(
        brightness=mean_brightness(frames) - 0.5,
        contrast=measure_contrast(frames),
        saturation=measure_saturation(frames),
        temperature=measure_color_temperature(frames),
    )
```

### Hook Structure Extraction
```python
async def _extract_hook_structure(self, video_path: str) -> HookProfile:
    """
    Analyze first 10 seconds.
    Transcribe if speech present.
    Classify hook type using LLM.
    """
    first_10s = trim_video(video_path, 0, 10000)
    transcript = await transcribe(first_10s)  # auto-detect language

    hook_type = await llm.classify(
        prompt=f"""
        Analyze this video hook transcript and classify it:
        "{transcript}"

        Return JSON: {{
            "hook_type": "bold_claim|story|question|reaction|tutorial",
            "duration_s": estimated hook duration,
            "uses_text_overlay": true/false
        }}
        """,
        model="groq-llama-3.3-70b"
    )
    return HookProfile(**hook_type)
```

---

## URL DOWNLOADER

```python
# packages/ai/src/style_transfer/downloader.py

class VideoDownloader:
    """
    Downloads reference videos from URLs for style analysis.
    Uses yt-dlp (supports YouTube, TikTok, Instagram, Twitter/X).
    Downloads lowest quality sufficient for style analysis (480p).
    Deletes after extraction.
    """

    SUPPORTED_PLATFORMS = {
        "youtube.com": "youtube",
        "youtu.be": "youtube",
        "tiktok.com": "tiktok",
        "instagram.com": "instagram",
        "twitter.com": "twitter",
        "x.com": "twitter",
    }

    async def download_for_analysis(self, url: str) -> str:
        """
        Download video at minimum quality needed for style extraction.
        Returns local file path.
        Auto-deletes after StyleDNA is extracted.
        """
        platform = self._detect_platform(url)

        # 480p is enough for color, pacing, caption analysis
        # No need for 1080p — saves time and disk
        opts = {
            "format": "best[height<=480]",
            "outtmpl": f"{TEMP_DIR}/style_ref_%(id)s.%(ext)s",
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            return ydl.prepare_filename(info)
```

---

## STYLE APPLICATION

Once StyleDNA is extracted, apply it to user's project:

```python
# packages/ai/src/style_transfer/applicator.py

class StyleApplicator:

    async def apply(
        self,
        timeline: Timeline,
        style_dna: StyleDNA,
        components: list[StyleComponent],  # which parts to apply
        strength: float = 1.0              # 0.0 = no change, 1.0 = full copy
    ) -> Timeline:
        """
        Apply StyleDNA to a timeline.
        Returns modified timeline (non-destructive).
        """

        if StyleComponent.PACING in components:
            timeline = self._apply_pacing(timeline, style_dna.pacing, strength)

        if StyleComponent.CAPTIONS in components:
            timeline = self._apply_captions(timeline, style_dna.captions)

        if StyleComponent.COLOR in components:
            timeline = self._apply_color(timeline, style_dna.color, strength)

        if StyleComponent.TRANSITIONS in components:
            timeline = self._apply_transitions(timeline, style_dna.transitions)

        if StyleComponent.AUDIO in components:
            timeline = self._apply_audio(timeline, style_dna.audio)

        return timeline

    def _apply_pacing(self, timeline, pacing, strength):
        """
        Adjust silence removal threshold to match target pacing.
        If reference cuts every 2.3s avg and current is 4.1s avg,
        tighten silence removal to close the gap (by strength %).
        """

    def _apply_captions(self, timeline, caption_style):
        """
        Update all Caption objects in timeline to match extracted style.
        Preserves Nepali text content, only changes visual style.
        """
        for track in timeline.tracks:
            if track.type == "captions":
                for clip in track.clips:
                    clip.captionStyle = CaptionStyle(
                        fontFamily=caption_style.font_family,
                        fontSize=caption_style.font_size_vw,
                        color=caption_style.color,
                        animation=caption_style.animation,
                        case=caption_style.case,
                        maxWordsPerLine=caption_style.max_words_per_line,
                        position=caption_style.position,
                    )
        return timeline

    def _apply_color(self, timeline, color, strength):
        """
        Apply color grade to all video clips.
        Interpolate between current and target by strength.
        """
```

---

## STYLE TRANSFER UI

### Entry Points (3 ways to trigger)

**1. From Dashboard — "Inspire from video"**
```
New Project options:
  [📤 Upload Video]
  [✨ Inspire from URL]   ← new
  [📁 Use Template]
```

**2. From Editor — "Match this style"**
```
In header bar:
  [🎨 Style] → dropdown:
    → Apply preset (Hormozi / Ali Abdaal / etc)
    → Match from URL...       ← new
    → Match from file...      ← new
    → Save current as preset
```

**3. From AI Prompt Bar**
```
User types: "Make this look like this TikTok: [URL]"
→ Prompt compiler detects URL
→ Triggers style extraction
→ Applies to timeline
```

---

### Style Transfer Modal

```
┌─────────────────────────────────────────────────────────┐
│  ✨ Style Transfer                                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Reference video:                                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Paste TikTok, YouTube, or Instagram URL...      │   │
│  └─────────────────────────────────────────────────┘   │
│                      — or —                             │
│  [📁 Upload video file]                                 │
│                                                         │
│  ─── What to copy ───────────────────────────────────  │
│                                                         │
│  [x] Caption style     [ ] Color grade                  │
│  [x] Cut pacing        [x] Transitions                  │
│  [ ] Hook structure    [ ] Audio/music energy           │
│  [ ] Visual overlays   [ ] Everything                   │
│                                                         │
│  Strength:  ──────────●──────  80%                      │
│  (100% = exact copy, 50% = subtle influence)            │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  ⚡ Analyzing reference... (usually < 30 seconds)       │
│                                                         │
│  [Cancel]                    [Extract & Apply →]        │
└─────────────────────────────────────────────────────────┘
```

### After Extraction — Preview

```
┌─────────────────────────────────────────────────────────┐
│  Style extracted from: @creator/video                   │
├────────────────────┬────────────────────────────────────┤
│  REFERENCE         │  YOUR VIDEO                        │
│  [thumbnail]       │  [thumbnail]                       │
│                    │                                     │
│  Captions: Bold    │  Captions: Bold ✓ applied          │
│  Cuts/min: 26      │  Cuts/min: 26  ✓ adjusted          │
│  Color: Warm       │  Color: Warm   ✓ applied           │
│  Transitions: Zoom │  Transitions: Zoom ✓ applied       │
├────────────────────┴────────────────────────────────────┤
│  [▶ Preview result]  [↩ Undo]  [✓ Apply to Timeline]   │
└─────────────────────────────────────────────────────────┘
```

---

## COMPONENT EXTRACTION (Partial Style Copy)

User can extract just ONE component from a video:

```
Use cases:
- "I love the captions on this TikTok, copy just that"
- "Copy the intro hook structure from this YouTube video"
- "Match the color grade from this video"
- "Same transition style as this Reel"
```

### Component Picker UI
```
┌─────────────────────────────────────────┐
│  What do you want to copy?              │
│                                         │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │    Aa    │ │  🎨      │ │   ✂    │ │
│  │ Captions │ │  Color   │ │ Pacing  │ │
│  └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │   ~~~    │ │  🎵      │ │  ↗ ✨  │ │
│  │Transitions│ │  Audio   │ │Overlays │ │
│  └──────────┘ └──────────┘ └─────────┘ │
│                                         │
│         [Pick Multiple] [All]           │
└─────────────────────────────────────────┘
```

---

## STYLE LIBRARY (Saved Styles)

Extracted styles are saved and reusable:

```
My Styles:
┌────────────────────────────────────────────────────────┐
│  + Add new style                                        │
├────────────────────────────────────────────────────────┤
│  [thumb] Hormozi Style          [Apply] [Edit] [Delete] │
│          Extracted from: youtube.com/...                │
│          Components: captions, pacing, color            │
│                                                         │
│  [thumb] Nepali Creator Style   [Apply] [Edit] [Delete] │
│          Extracted from: tiktok.com/...                 │
│          Components: all                                │
│                                                         │
│  [thumb] Minimal Podcast        [Apply] [Edit] [Delete] │
│          Extracted from: uploaded file                  │
│          Components: captions, audio                    │
└────────────────────────────────────────────────────────┘
```

---

## EPIC: EP-2.8 — Style Transfer Engine

**User Story**: I paste a TikTok URL, ViraEdit extracts its editing
style in under 30 seconds, and I can apply it to my own video with
one click.

### Tasks

**T-2.8.1** VideoDownloader
- yt-dlp integration (pip install yt-dlp)
- Support YouTube, TikTok, Instagram, Twitter/X
- Download at 480p (style analysis doesn't need HD)
- Auto-delete after extraction
- Handle private/age-restricted videos gracefully

**T-2.8.2** StyleExtractor
- Parallel extraction of all components
- PacingProfile from PySceneDetect
- CaptionStyleProfile from OpenCV text detection
- ColorProfile from frame sampling
- TransitionProfile from cut detection
- HookProfile from first-10s LLM analysis

**T-2.8.3** StyleApplicator
- Apply any combination of components to timeline
- Strength parameter (0.0 to 1.0)
- Non-destructive (creates new timeline version)
- Preview before committing

**T-2.8.4** Style Library (DB + UI)
- Save extracted styles with name + source
- Apply saved style to any project
- Export style as shareable preset file

**T-2.8.5** Style Transfer Modal (UI)
- URL input + file upload
- Component checkboxes
- Strength slider
- Before/after preview
- Apply button

**T-2.8.6** AI Prompt integration
- "Make it look like [URL]" → triggers extraction
- "Copy the caption style from [URL]" → captions only
- "Match the pacing of [URL]" → pacing only

### Tests
```python
def test_youtube_url_downloads_successfully()
def test_tiktok_url_downloads_successfully()
def test_pacing_extracted_within_10_percent_accuracy()
def test_caption_style_extracted_correctly()
def test_color_grade_extracted_correctly()
def test_style_applied_to_timeline_non_destructively()
def test_strength_parameter_interpolates_correctly()
def test_temp_file_deleted_after_extraction()
def test_private_video_fails_gracefully()
def test_style_saved_and_reloaded()
```

### Done Criteria
User pastes a TikTok URL → sees style extracted in < 30s →
applies to their video → timeline updates with new style.

---

## DEPENDENCIES TO ADD

```
# requirements.txt additions
yt-dlp>=2024.1.0          # URL video downloading
easyocr>=1.7.0            # Caption text detection from frames
scikit-image>=0.21.0      # Color analysis
scipy>=1.11.0             # Audio cross-correlation (also used in multicam)
```

```json
// package.json additions (none needed — all Python)
```

---

## COST OF STYLE TRANSFER

| Step | Cost |
|------|------|
| Video download (480p) | $0.00 |
| Frame sampling (OpenCV) | $0.00 |
| Pacing analysis (PySceneDetect) | $0.00 |
| Color analysis (scikit-image) | $0.00 |
| Hook LLM analysis (first 10s) | ~$0.001 |
| Caption OCR (EasyOCR local) | $0.00 |
| **Total per style extraction** | **~$0.001** |

Style transfer costs essentially nothing.
The only API call is the hook classifier (10 seconds of transcript).
