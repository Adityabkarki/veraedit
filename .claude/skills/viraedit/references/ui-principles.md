# ViraEdit — UI Principles
# Intuitive Video Editing for Nepali Creators

---

## THE CORE TEST

Before shipping any UI, ask:
> "Can a Nepali YouTuber who has NEVER used video editing software
> figure this out in 10 seconds without reading anything?"

If no → it needs to be redesigned.

---

## DESIGN PHILOSOPHY

ViraEdit is not Premiere Pro. It is not CapCut.

It is the editing tool you wish existed when you started:
- **Smart enough** to do the hard work automatically
- **Simple enough** that you control everything
- **Fast enough** that editing feels like writing, not engineering

---

## THE 10 UI LAWS FOR VIRAEDIT

### Law 1: Every Action Is Visible
Never hide features in right-click menus that users need to discover.
Put primary actions in visible buttons. Reserve right-click for power users.

```
BAD:  Hidden "Split" in right-click only
GOOD: "✂ Split" button in toolbar, ALSO in right-click
```

### Law 2: Every Button Has a Label
Never use icon-only buttons except in the most space-constrained situations.
Always pair icon + text label.

```
BAD:  [✂] (just scissors icon)
GOOD: [✂ Split]
```

### Law 3: Progress Is Always Visible
Never leave users wondering "is it working?"
Every operation that takes > 1 second shows progress.

```
BAD:  Click "Transcribe" → nothing visible for 2 minutes
GOOD: Click "Transcribe" → progress bar with "Transcribing Nepali audio... 45%"
```

### Law 4: Errors Speak Human
No technical jargon in error messages. Tell users what happened AND what to do.

```
BAD:  "Error 500: ECONNREFUSED 127.0.0.1:5432"
GOOD: "Couldn't connect to the database.
       Make sure Docker is running, then click Retry."
       [Retry] [Get Help]
```

### Law 5: Undo Is Always Available
Every action can be undone. Show users this is possible.
After every change: show "Ctrl+Z to undo" toast briefly.

### Law 6: Empty States Guide Action
When something is empty, tell the user exactly what to do next.

```
BAD:  [Empty grey box with nothing]
GOOD: [Illustration]
      "No videos yet"
      "Upload your first video to get started"
      [+ Upload Video]
```

### Law 7: AI Is Transparent
Never hide AI decisions. Always show:
- What the AI decided
- Why it decided it
- How confident it is
- How to override it

```
BAD:  Silent cut applied automatically
GOOD: "AI removed a 2.3s pause here (confidence: high)
       [Preview] [Keep It] [Undo]"
```

### Law 8: Nepali First
Default language is English UI (wider compatibility)
BUT: all key labels also show Nepali translation in smaller text.
Toggle in settings: "UI Language: English / नेपाली"

Nepali captions work perfectly — Devanagari renders correctly always.

### Law 9: Mobile-Responsive Editor
The editor must work on a 13" laptop screen.
Use collapsible panels. Never require horizontal scrolling at 1366x768.

### Law 10: One Primary Action Per Screen
Every screen has ONE obvious next action.
On Dashboard: Upload Video.
In Editor: Play / Accept Suggestions.
After Processing: Review Suggestions.

---

## COLOR SYSTEM

```css
/* Base — Dark professional */
--bg-base:        #0A0A0B;    /* Deepest background */
--bg-surface:     #111113;    /* Panel backgrounds */
--bg-elevated:    #1A1A1E;    /* Cards, dropdowns */
--bg-overlay:     #242428;    /* Hover states, clips */

/* Accent — Nepali flag-inspired */
--accent-primary:  #C41E3A;   /* Deep crimson (Nepali flag) */
--accent-glow:     #E8284A;   /* Hover/active states */
--accent-muted:    #3D0912;   /* Subtle accent backgrounds */

/* Text */
--text-primary:    #F2F2F3;   /* Main text */
--text-secondary:  #8B8B96;   /* Labels, hints */
--text-disabled:   #4A4A52;   /* Disabled states */

/* Status */
--status-success:  #22C55E;   /* Green — processed, accepted */
--status-warning:  #F59E0B;   /* Amber — processing, medium confidence */
--status-error:    #EF4444;   /* Red — failed, rejected */
--status-info:     #3B82F6;   /* Blue — info, suggestions */

/* Track colors (timeline) */
--track-video:     #3B82F6;   /* Blue */
--track-audio:     #8B5CF6;   /* Purple */
--track-captions:  #F59E0B;   /* Amber */
--track-music:     #10B981;   /* Green */
--track-overlay:   #EC4899;   /* Pink */
```

---

## TYPOGRAPHY

```css
/* Display / Headers */
--font-display: 'Plus Jakarta Sans', sans-serif;

/* Body / UI */
--font-body: 'Inter Variable', sans-serif;

/* Nepali / Devanagari */
--font-nepali: 'Noto Sans Devanagari', 'Mukta', sans-serif;

/* Monospace (timecodes, file names) */
--font-mono: 'JetBrains Mono', monospace;
```

---

## LAYOUT — EDITOR

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEADER (56px)                                                        │
│ [≡ Menu] ViraEdit  [Project Name ✏]  [◀ Undo ▶ Redo]  [Export ↑]  │
├──────────────┬──────────────────────────┬───────────────────────────┤
│              │                          │                           │
│  LEFT PANEL  │     VIDEO PREVIEW        │    AI PANEL              │
│  (280px)     │     (flexible, 16:9)     │    (320px)               │
│              │                          │                           │
│  [📁 Media]  │  ┌────────────────────┐  │  ✨ AI Suggestions (12) │
│  [🎬 Scenes] │  │                    │  │                          │
│  [⚡ Shorts] │  │    VIDEO PLAYER    │  │  [All][Cuts][Visuals]   │
│  [🎨 Brand]  │  │                    │  │                          │
│              │  └────────────────────┘  │  ┌────────────────────┐ │
│  [thumbnail] │  [◀◀][◀][▶ Play][▶][▶▶] │  │ ✂ Remove 2s pause  │ │
│  [thumbnail] │  00:00:14.22 / 00:05:30  │  │ "feels slow here"  │ │
│  [thumbnail] │  [0.5x][1x][1.5x][2x]   │  │ ████░░ 82%         │ │
│  [thumbnail] │                          │  │ [✓ Accept][✗ Skip] │ │
│              │  ┌─── AI Prompt ──────┐  │  └────────────────────┘ │
│  [+ Upload]  │  │ Tell AI what to... │  │  [+ more suggestions]   │
│              │  └────────────────────┘  │                          │
├──────────────┴──────────────────────────┴───────────────────────────┤
│ TIMELINE (240px min, resizable)                                      │
│                                                                      │
│ [Tools: ↖ ✂ ⟺] [Zoom: ─────●─────] [Snap ⊞] [00:00:14:22]        │
│                                                                      │
│ 🎬 Video  │ ████████████████░░░░░░████████████████████              │
│ 🎬 B-Roll │         ████████              ███████                   │
│ 📝 Captions│ ██████     ████████     ██████████                     │
│ 🎵 Music  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░                  │
│                                                                      │
│ [+ Add Track]                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ONBOARDING FLOW (First Launch)

Step 1: Welcome screen
```
┌──────────────────────────────────┐
│     Welcome to ViraEdit 🎬       │
│                                  │
│  The AI editor that speaks       │
│  Nepali — and thinks like a      │
│  20-year editor.                 │
│                                  │
│  Let's set up in 2 minutes.      │
│                                  │
│         [Get Started →]          │
└──────────────────────────────────┘
```

Step 2: Language preference
```
Select your content language:
[🇳🇵 Nepali (नेपाली)] ← pre-selected
[🇬🇧 English]
[Both (mixed)]
```

Step 3: Content type (affects AI editing style)
```
What kind of videos do you make?
[🎙 Podcast/Interview]
[📚 Educational/Tutorial]  
[🎥 Vlog/Storytelling]
[⚡ Short-form (TikTok/Reels)]
[🔀 Mix of everything] ← user's choice
```

Step 4: Brand style
```
Choose a starting style:
(Can change anytime)

[Bold & Direct]  [Clean & Minimal]
[Warm & Personal] [Professional]
```

Step 5: First upload prompt
```
You're ready! Upload your first video.

Your AI editor will:
✓ Transcribe in Nepali
✓ Find the best moments
✓ Suggest edits
✓ Generate captions

[📤 Upload First Video]  [Use Sample Video]
```

---

## UPLOAD EXPERIENCE

### While Uploading
```
Uploading "vlog_jan_2025.mp4"
████████████░░░░░░░░  63%  |  12.4 MB/s  |  ~8 seconds left

[Cancel]
```

### While Processing (real-time stage updates)
```
✅ Upload complete
✅ Preparing audio...
⟳ Transcribing in Nepali...  (इमानदार हुँदा 43%)
○ Detecting scenes...
○ AI analysis...
○ Finding best moments...

[Working in background — you can leave this page]
```

### When Ready
```
🎉 Your video is ready to edit!

📊 Quick Analysis:
  Duration:    8 min 24 sec
  Scenes:      12 detected
  AI Edits:    24 suggestions
  Best Short:  "त्यो बेला..." (47s, 91% viral score)
  Estimated:   Save ~3 hours of editing time

[Open Editor →]
```

---

## AI SUGGESTION CARDS

Each suggestion must be immediately understandable:

```
┌──────────────────────────────────────────┐
│ ✂  Remove Filler Words                   │
│                                          │
│ Found 8 "हैन र" that slow the pace.     │
│ Removing them saves 12 seconds.          │
│                                          │
│ Example: "...त्यसपछि [हैन र] हामीले..." │
│                     ↑ removed            │
│                                          │
│ ████████████░░  Confidence: 94%          │
│                                          │
│ [▶ Preview]   [✓ Accept All]  [✗ Skip]  │
└──────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────┐
│ 📊  Add Stat Graphic at 2:14             │
│                                          │
│ You said "नेपालमा ७०% मान्छे..."         │
│ A visual would make this 3x more        │
│ memorable.                               │
│                                          │
│ [Preview graphic]  ↓                    │
│ ┌─────────────────┐                     │
│ │      70%        │                     │
│ │  नेपाली मान्छे │                     │
│ └─────────────────┘                     │
│                                          │
│ ████████░░░░  Confidence: 78%           │
│                                          │
│ [▶ Preview]  [✓ Add It]  [✗ Skip]      │
└──────────────────────────────────────────┘
```

---

## SHORTS TAB DESIGN

```
⚡ Viral Shorts  (8 candidates found)

Sort by: [🔥 Virality] [⏱ Duration] [📱 Platform]

Filter: [All] [TikTok] [YouTube] [Instagram]

┌─────────────────────────────────────────┐
│ [thumbnail]  "त्यो बेला मैले..."        │
│              Duration: 0:47             │
│              🔥 Viral Score: 91%        │
│              TikTok ████░ 89%           │
│              Reels  ███░░ 76%           │
│              Shorts ████  85%          │
│                                         │
│ Hook: "त्यो बेला मैले एउटा गल्ती गरें"  │
│                                         │
│ [▶ Preview]  [✏ Edit Hook]  [↓ Export] │
└─────────────────────────────────────────┘
```

---

## RESPONSIVE BREAKPOINTS

```
Desktop (1440px+):   Full 4-panel layout
Laptop (1280px):     Collapsed left panel (toggle)
Small laptop (1024px): AI panel in bottom drawer
Tablet (768px):      Editor disabled — show upload/manage only
```

---

## KEYBOARD SHORTCUT REFERENCE MODAL

Press `?` anywhere in editor:

```
┌──────────────────────────────────────────────────┐
│  ⌨ Keyboard Shortcuts                            │
│                                                  │
│  PLAYBACK                                        │
│  Space        Play / Pause                       │
│  J K L        Shuttle (back / stop / forward)    │
│  , .          Step one frame back / forward      │
│                                                  │
│  EDITING                                         │
│  S            Split clip at playhead             │
│  Delete       Ripple delete selection            │
│  Ctrl+Z       Undo                               │
│  Ctrl+Y       Redo                               │
│  Ctrl+A       Select all clips                   │
│                                                  │
│  TOOLS                                           │
│  V            Select tool                        │
│  B            Blade / Razor tool                 │
│  [ ]          Trim in / out point                │
│                                                  │
│  TIMELINE                                        │
│  + -          Zoom in / out                      │
│  \            Fit timeline to window             │
│  I O          Set in / out points                │
│                                                  │
│  AI                                              │
│  Ctrl+Enter   Submit AI prompt                   │
│  Tab          Next suggestion                    │
│  A            Accept current suggestion          │
│  X            Skip current suggestion            │
│                                                  │
│                              [Close]             │
└──────────────────────────────────────────────────┘
```
