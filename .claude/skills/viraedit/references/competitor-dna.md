# ViraEdit — Competitor DNA Reference
# What to steal from each tool. What to fix. How to beat them.

---

## THE POSITIONING STATEMENT

> ViraEdit is the tool users of Descript, Opus Clip, CapCut, VEED,
> Canva, and Riverside have been waiting for — all the best ideas,
> none of the limitations, built for Nepali creators first.

A user switching from ANY of these 6 tools must think:
"This does everything mine did, plus things mine never could."

---

## COMPETITOR ANALYSIS: STEAL AND FIX

---

### 1. DESCRIPT
**What users love:**
- Text-based editing (edit transcript = edit video)
- "Remove filler words" one click
- Overdub (AI voice clone)
- Word-level transcript with video sync
- Studio Sound (background noise removal)
- Underlord AI (auto-remove silences, filler words)

**What users hate:**
- Expensive ($24-$40/month)
- Slow and buggy on large files
- Export quality issues
- No Nepali language support
- No viral shorts extraction
- Weak timeline editor

**What ViraEdit steals:**
- ✅ Text-based editing panel (click word in transcript → jump to that moment)
- ✅ One-click filler word removal (with Nepali filler words)
- ✅ Silence removal with smart detection
- ✅ Studio Sound equivalent (FFmpeg loudnorm + noise reduction)
- ✅ Word-level transcript with video sync (click any word → seek to it)
- ✅ "Underlord"-style AI that auto-prepares edit suggestions

**What ViraEdit fixes:**
- Works with Nepali (Descript doesn't)
- Faster on large files (proxy editing)
- Better timeline editor (full NLE)
- Viral shorts on top of transcript editing
- Cheaper (local AI first)

**UI Pattern to clone:**
```
DESCRIPT'S TRANSCRIPT PANEL:
[00:12] नमस्ते साथीहरू, आज हामी...
         ↑ click any word → video jumps there
         ↑ select words → right-click → delete this section
         ↑ filler words highlighted in yellow
         ↑ silences highlighted in grey
         ↑ strikethrough on deleted words
```

---

### 2. OPUS CLIP
**What users love:**
- Magic: upload → get viral clips in minutes
- Virality score per clip (with explanation)
- Auto-reframe for 9:16
- Hook detection and labeling
- Platform-specific optimization
- Super clean, single-purpose UI

**What users hate:**
- ONLY does shorts (no full video editing)
- Very expensive ($29-$79/month)
- No control over the AI decisions
- Can't edit the clips it generates
- No captions customization
- No Nepali support

**What ViraEdit steals:**
- ✅ Virality score with explanation ("This clip scores high because...")
- ✅ Auto-reframe (face detection → centered 9:16)
- ✅ Hook labeling on each clip
- ✅ Single-click platform export
- ✅ Clean shorts-first workflow when user wants it
- ✅ "Magic clips" mode — upload → instant 5 viral shorts

**What ViraEdit fixes:**
- Full video editing PLUS shorts (Opus Clip is shorts-only)
- You can edit the clips after AI generates them
- Nepali language hooks
- Transparent AI (show why score is what it is)
- Much cheaper

**UI Pattern to clone:**
```
OPUS CLIP'S SHORTS CARDS:
┌─────────────────────────┐
│ [thumbnail]             │
│ 🔥 Virality: 94%        │
│ Hook: "त्यो बेला..."    │
│ Duration: 0:47          │
│ TikTok ████  92%        │
│ Reels  ███░  78%        │
│ [Edit] [Export]         │
└─────────────────────────┘
```

---

### 3. CAPCUT
**What users love:**
- Completely FREE
- Insanely easy to use (zero learning curve)
- Rich effects library (templates, stickers, filters)
- Auto-captions that actually work
- Trending templates
- Mobile + desktop
- Speed curves, keyframes feel fun

**What users hate:**
- No AI editing intelligence (just manual editing with nice UI)
- No transcript-based editing
- No virality analysis
- Watermark on free tier
- Privacy concerns (TikTok-owned, data concerns)
- Limited for long-form content

**What ViraEdit steals:**
- ✅ Zero learning curve UI — first action obvious immediately
- ✅ One-click auto-captions (with Nepali support)
- ✅ Effects templates (presets for brand styles)
- ✅ Speed curves on clips
- ✅ Stickers/overlays library
- ✅ "Fun" feel — editing should feel enjoyable, not engineering
- ✅ Template-based workflows ("Start from a short-form template")

**What ViraEdit fixes:**
- Has the AI intelligence CapCut lacks
- Transcript-based editing
- Long-form support
- No watermark (it's YOUR app)
- Privacy-respecting (local processing)

**UI Pattern to clone:**
```
CAPCUT'S SIMPLICITY:
- Single scrollable timeline (no overwhelming panels)
- Large, colorful action buttons with icons + labels
- Effects accessible via bottom drawer (not buried in menus)
- Preview immediately responsive to every change
- "Text" tab, "Audio" tab, "Effects" tab — no jargon
```

---

### 4. VEED.IO
**What users love:**
- Entirely browser-based (no install)
- Clean, balanced UI (not overwhelming)
- Subtitle editor with manual correction
- Magic Cut (auto-remove silences)
- Screen recording built-in
- Easy sharing via link
- Good collaboration features

**What users hate:**
- Slow rendering (browser-based bottleneck)
- Limited storage
- Expensive for quality exports
- AI features feel shallow
- No viral/shorts intelligence
- Limited for complex edits

**What ViraEdit steals:**
- ✅ Clean, uncluttered UI (nothing overwhelming on first open)
- ✅ Subtitle editor with manual correction (click subtitle → edit text)
- ✅ Magic Cut equivalent (one-click silence removal)
- ✅ Shareable project links for review
- ✅ Screen recording support (important for tutorial creators)
- ✅ Balanced layout (not too minimal, not too complex)

**What ViraEdit fixes:**
- Runs locally (fast, no upload wait)
- Deep AI intelligence (not just cut silences)
- Nepali language
- Full NLE timeline (VEED is limited)
- No storage limits (your own disk)

**UI Pattern to clone:**
```
VEED'S BALANCED APPROACH:
- Media library always visible on left
- Preview always centered (primary focus)
- Bottom timeline not overwhelming
- Top toolbar with text/icons (accessible)
- Subtitle panel slides in from right (doesn't take over)
```

---

### 5. CANVA (Video)
**What users love:**
- Beautiful visual templates
- Massive asset library (stock photos, videos, music)
- Drag-and-drop everything
- Brand kit (fonts, colors, logos stored)
- Instant professional-looking visuals
- Resize for different platforms in one click

**What users hate:**
- Very limited timeline editing
- No AI editing intelligence
- No transcript
- Animations are template-only (can't customize deeply)
- Video quality issues on export
- Not a real video editor

**What ViraEdit steals:**
- ✅ Brand kit system (fonts, colors, logo — apply once, used everywhere)
- ✅ Visual template library (pick a chart style, a text style, etc.)
- ✅ Platform resize in one click (16:9 → 9:16 → 1:1 instantly)
- ✅ Stock footage/music browser integrated
- ✅ Drag-and-drop visual elements onto timeline
- ✅ Beautiful pre-made intro/outro templates
- ✅ "Make it look professional instantly" feeling

**What ViraEdit fixes:**
- Real video editing on top of beautiful visuals
- AI that understands where to PUT the visuals (Canva doesn't)
- Nepali text in all templates
- Export quality (FFmpeg vs browser-based)

**UI Pattern to clone:**
```
CANVA'S VISUAL LIBRARY PANEL:
[Templates] [Elements] [Text] [Media] [Brand]

Templates tab:
┌──────┐ ┌──────┐ ┌──────┐
│ Stat │ │Quote │ │ List │
│ Card │ │ Card │ │Reveal│
└──────┘ └──────┘ └──────┘
[All] [Charts] [Text] [Lower Thirds]

Click → appears on timeline at playhead
Drag → reposition on canvas
```

---

### 6. RIVERSIDE.FM
**What users love:**
- Podcast-specific AI producer
- Separate track recording (host + guest separate audio)
- AI show notes, summaries, chapters
- Magic Clips (podcast → clips automatically)
- Speaker labels in transcript
- Professional audio quality recording
- Remote recording with HD quality

**What users hate:**
- Recording platform only (can't upload existing video)
- Expensive ($15-$29/month)
- Limited video editing after recording
- No Nepali support
- Clips are good but not deep editing

**What ViraEdit steals:**
- ✅ AI show notes generator (from transcript)
- ✅ Chapter detection with timestamps
- ✅ Speaker-separated transcript view (Speaker A / Speaker B panels)
- ✅ "AI Producer" mode for podcast content (Riverside's best feature)
- ✅ Summary generation per episode
- ✅ Multi-speaker waveform display (color-coded per speaker)
- ✅ Podcast-specific editing mode (different from vlog or tutorial mode)

**What ViraEdit fixes:**
- Works with uploaded files (not just Riverside recordings)
- Nepali podcast support
- Better clips (viral scoring on top of podcast clips)
- Full editing after AI producer runs
- No per-minute recording fees

**UI Pattern to clone:**
```
RIVERSIDE'S AI PRODUCER PANEL:
┌────────────────────────────────┐
│ 🎙 AI Producer                 │
│                                │
│ Show Notes        [Generate]   │
│ Chapters          [Generate]   │
│ Summary           [Generate]   │
│ Key Quotes        [Generate]   │
│ Social Posts      [Generate]   │
│                                │
│ ─── Generated ───              │
│                                │
│ 📋 Show Notes                  │
│ This episode covers...         │
│ [Copy] [Export]                │
└────────────────────────────────┘
```

---

## FEATURE MATRIX: US VS THEM

| Feature | Descript | Opus | CapCut | VEED | Canva | Riverside | ViraEdit |
|---------|----------|------|--------|------|-------|-----------|----------|
| Text-based editing | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Virality scoring | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Auto shorts | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Zero learning curve | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Visual templates | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Brand kit | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| AI Producer (podcast) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Full NLE timeline | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Nepali language | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Local / private | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Chapter detection | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Platform resize | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| AI cost < $2/hr | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## HOW EACH USER FINDS THEIR HOME IN VIRAEDIT

### Descript User switching to ViraEdit
**First thing they see:** Transcript panel front and center
**First thing they do:** Click a word → video jumps there ✅
**Familiar pattern:** Select text → delete → ripple edit (same as Descript)
**New power:** Virality scores, shorts, full timeline, Nepali

### Opus Clip User switching to ViraEdit
**First thing they see:** Shorts tab with viral score cards
**First thing they do:** See 8 clips with scores → click Export ✅
**Familiar pattern:** Same virality score UI, same platform badges
**New power:** Can actually edit the clips, has full video editor too

### CapCut User switching to ViraEdit
**First thing they see:** Clean interface, big colorful buttons
**First thing they do:** Upload video, watch it process ✅
**Familiar pattern:** Auto-captions, effects drawer, timeline
**New power:** AI that actually understands what to cut and why

### VEED User switching to ViraEdit
**First thing they see:** Clean 3-panel layout, subtitle editor on right
**First thing they do:** Edit a subtitle by clicking it ✅
**Familiar pattern:** Left media, center preview, right subtitles
**New power:** Much smarter AI, full timeline, viral shorts

### Canva User switching to ViraEdit
**First thing they see:** Templates panel, brand kit, visual library
**First thing they do:** Pick a template, drag it onto video ✅
**Familiar pattern:** Template browser, brand colors, drag-and-drop
**New power:** AI places visuals intelligently, real video editing

### Riverside User switching to ViraEdit
**First thing they see:** AI Producer panel for their podcast
**First thing they do:** Generate show notes + chapters ✅
**Familiar pattern:** Speaker-separated transcript, AI Producer panel
**New power:** Works with any uploaded file, Nepali, viral shorts

---

## THE 6 UI MODES

ViraEdit adapts its layout based on content type.
Each mode surfaces the right tools for that user.

### Mode 1: Podcast Mode (Riverside + Descript users)
Activated when: User selects "Podcast/Interview" in onboarding
OR when AI detects multi-speaker audio content

Layout changes:
- Transcript panel EXPANDS (becomes dominant, left 40% of screen)
- AI Producer panel appears in right panel (show notes, chapters, summary)
- Speaker color-coding in transcript
- Timeline shows audio waveforms prominently
- Silence detection is conservative (podcasts need breathing room)

```
┌─────────────────────┬──────────────────┬──────────────────┐
│  TRANSCRIPT (40%)   │  PREVIEW (35%)   │  AI PRODUCER     │
│                     │                  │  (25%)           │
│  Speaker A (blue)   │  [video player]  │                  │
│  [00:12] नमस्ते...  │                  │  📋 Show Notes   │
│  [00:18] [हैन र]    │                  │  📑 Chapters     │
│   ↑ filler, click   │                  │  ✂ Magic Cuts    │
│   to delete         │  [controls]      │  ⚡ Best Clips   │
│                     │                  │                  │
│  Speaker B (orange) │                  │  [Generate All]  │
│  [00:45] राम्रो...  │                  │                  │
├─────────────────────┴──────────────────┴──────────────────┤
│  TIMELINE (audio-focused, shows waveforms)                 │
└────────────────────────────────────────────────────────────┘
```

### Mode 2: Shorts Mode (Opus Clip users)
Activated when: User selects "Short-form" OR clicks "Shorts" tab

Layout changes:
- Shorts grid becomes DOMINANT center panel
- Virality scores large and prominent
- Platform selector prominent
- Preview shows 9:16 frame
- Timeline minimized (just for trim adjustments)

```
┌────────────────────────────────────────────────────────────┐
│  PLATFORM: [TikTok ▼]  Sort: [🔥 Virality ▼]  [Export All]│
├────────────┬────────────┬────────────┬────────────────────┐
│ 🔥 94%    │ 🔥 87%    │ 🔥 81%    │  SELECTED CLIP     │
│ [thumb]   │ [thumb]   │ [thumb]   │                    │
│ 0:47      │ 1:02      │ 0:38      │  [9:16 preview]    │
│ TT: 92%   │ TT: 85%   │ TT: 79%   │                    │
│ IG: 78%   │ IG: 80%   │ IG: 71%   │  Hook options:     │
│ [Edit]    │ [Edit]    │ [Edit]    │  ○ "त्यो बेला..."  │
│ [Export ↓]│ [Export ↓]│ [Export ↓]│  ○ "साथीहरू..."   │
│           │           │           │  ● "के तपाईं..."   │
│           │           │           │                    │
│           │           │           │  [Export This Clip]│
└────────────┴────────────┴────────────┴────────────────────┘
│  [─────────────── trim timeline ─────────────────────────] │
└────────────────────────────────────────────────────────────┘
```

### Mode 3: Visual Creator Mode (Canva + CapCut users)
Activated when: User opens "Visuals" panel or adds a template

Layout changes:
- Left panel shows Templates / Elements / Brand tabs (Canva-style)
- Center shows canvas with click-to-select overlays
- Right shows properties panel for selected element
- Timeline shows overlay layer prominently

```
┌──────────────────┬──────────────────────┬──────────────────┐
│  VISUAL LIBRARY  │  CANVAS (PREVIEW)    │  PROPERTIES      │
│                  │                      │                  │
│  [Templates]     │  ┌────────────────┐  │  Selected: Stat  │
│  [Elements]      │  │  video frame   │  │                  │
│  [Text]          │  │                │  │  Value: 70%      │
│  [Brand]         │  │  ┌──────────┐  │  │  Label: नेपाली  │
│                  │  │  │ 70%      │  │  │  Style: Bold     │
│  ┌──┐┌──┐┌──┐   │  │  │ नेपाली  │  │  │  Color: ●       │
│  │St││Qu││Li│   │  │  │ मान्छे  │  │  │  Anim: Count-up  │
│  └──┘└──┘└──┘   │  │  └──────────┘  │  │  Duration: 3s   │
│  ┌──┐┌──┐┌──┐   │  └────────────────┘  │                  │
│  │Ch││Pr││Ti│   │  [controls]          │  [Apply Changes] │
│  └──┘└──┘└──┘   │                      │                  │
└──────────────────┴──────────────────────┴──────────────────┘
│  TIMELINE (overlay track highlighted)                       │
└─────────────────────────────────────────────────────────────┘
```

### Mode 4: Full Editor Mode (Power users, Premiere refugees)
Default for "Mix of everything" users.
Standard 4-panel layout as defined in ui-principles.md.

### Mode 5: Tutorial Mode (CapCut + VEED users)
Activated when: AI detects screen recording or tutorial content

Layout changes:
- B-roll/overlay track prominently shown
- "Add explanation visual" button prominent
- Chapter markers auto-created
- Visual opportunities highlighted in transcript

### Mode 6: Quick Export Mode (VEED users)
Activated when: User just wants to add captions and export

Ultra-simplified:
1. Upload → auto-captions generated
2. Review captions (edit any)
3. Pick style
4. Export

No timeline visible. Pure caption-and-go.

---

## FEATURE IMPLEMENTATIONS BY COMPETITOR INSPIRATION

### From Descript: Transcript-Based Editing

```typescript
// components/transcript/TranscriptEditor.tsx
// Renders transcript as selectable, clickable, editable text
// Clicking a word seeks video to that timestamp
// Selecting words + Delete = ripple deletes that video section
// Filler words shown with yellow highlight
// Deleted sections shown with strikethrough (non-destructive)
// Silences shown with grey background

interface TranscriptWord {
  word: string
  startMs: number
  endMs: number
  speaker: string
  isFiller: boolean
  isSilence: boolean
  isDeleted: boolean  // soft-deleted (shown as strikethrough)
  confidence: number
}
```

### From Opus Clip: Virality Score Cards

```typescript
// components/shorts/ViralityCard.tsx
interface ViralityCardProps {
  clip: ShortsCandidate
  onEdit: () => void
  onExport: (platform: Platform) => void
}

// Score breakdown shown on hover:
// "High score because:
//  ✓ Strong hook in first 0.5s
//  ✓ Complete story arc
//  ✓ High speaker energy
//  ✓ Ends with clear insight"
```

### From CapCut: Effects Drawer

```typescript
// components/effects/EffectsDrawer.tsx
// Slides up from bottom (mobile-first pattern)
// Tabs: Transitions | Filters | Text | Stickers | Audio
// Each item: preview thumbnail + name + click to apply
// Recently used items shown first
// "Trending" section at top
```

### From VEED: Subtitle Editor

```typescript
// components/captions/SubtitleEditor.tsx
// Right panel (slides in)
// List of all captions with timestamps
// Click any caption → edit inline
// Drag to reorder
// Style picker at top
// "Auto-fix" button (re-runs AI on edited captions)
// Real-time preview in player
```

### From Canva: Template Browser

```typescript
// components/visuals/TemplateBrowser.tsx
// Grid of templates with live preview
// Filter by: type, style, language (Nepali/English)
// Drag to timeline OR click to insert at playhead
// Customize after inserting (properties panel)
// "My Brand" tab shows brand-styled versions of templates
```

### From Riverside: AI Producer Panel

```typescript
// components/podcast/AIProducerPanel.tsx
// Only shown in Podcast mode
// Sections:
//   - Show Notes (generate → edit → copy/export)
//   - Chapter Markers (auto-generated with timestamps)  
//   - Key Quotes (pull-out quotes for social)
//   - Episode Summary (short + long versions)
//   - Social Posts (Twitter/LinkedIn/Facebook versions)
//   - Newsletter Blurb
// Each section: [Generate] → loading → result with [Copy][Export][Regenerate]
```

---

## ONBOARDING: THE "SWITCH" MOMENT

When a new user signs up, detect which tool they're coming from:

```
"Which tool are you currently using?"
○ Descript
○ Opus Clip  
○ CapCut
○ VEED
○ Canva Video
○ Riverside
○ Premiere Pro / DaVinci
○ None — I'm new to editing
```

Then customize the onboarding:

**Descript user:**
> "ViraEdit works just like Descript — click any word to jump to it.
> Plus you get viral shorts and a full timeline editor."
> First view: Transcript panel prominent

**Opus Clip user:**
> "Your first viral clips are ready. ViraEdit found 8 moments
> that could blow up on TikTok."
> First view: Shorts grid with scores

**CapCut user:**
> "Everything you love about CapCut, plus AI that edits for you."
> First view: Simple clean editor with auto-captions running

**VEED user:**
> "Upload, caption, export. Same flow you know — but smarter."
> First view: Quick export mode (simplified)

**Canva user:**
> "Your brand kit is already set up. Drag any template onto your video."
> First view: Visual templates panel + brand kit setup

**Riverside user:**
> "Your AI Producer is analyzing your podcast now."
> First view: AI Producer panel with show notes, chapters, clips

---

## THE KILLER DIFFERENTIATOR SPEECH

When any user asks "why should I use this instead of [tool]?":

> "Every tool you listed solves ONE problem well.
> Descript edits transcripts. Opus Clip makes shorts.
> CapCut is easy. VEED is online. Canva is beautiful. Riverside does podcasts.
>
> ViraEdit does all six — and understands Nepali.
>
> One upload. One tool. Everything."
