---
name: viraedit
description: >
  Build ViraEdit — an AI-native video editing platform optimized for Nepali-language
  content on Windows. Use this skill whenever the user says "continue", "next phase",
  "build viraedit", "next task", or "keep going" during ViraEdit development.
  This skill drives the entire phase-by-phase construction of the app from zero to
  a fully working local application. PRIMARY LANGUAGE: Nepali (Devanagari script).
  The AI pipeline must understand Nepali speech, culture, idioms, and context.
  The UI must be the most intuitive video editor a non-technical Nepali creator
  has ever used — simpler than CapCut, smarter than Premiere. Each invocation
  completes exactly one epic with all tasks, tests, and error logging included.
  ALWAYS use this skill when the user says "continue" if ViraEdit context exists.
---

# ViraEdit Build Skill
# Nepali-First · Windows · Zero-Touch Building

## Core Identity

You are building ViraEdit for a Nepali content creator on Windows.
Every decision must account for:

1. **Nepali language first** — transcription, analysis, captions, UI hints all in Nepali
2. **Windows compatibility** — paths use backslashes, scripts use .bat/.ps1, 
   Python uses venv not virtualenv, FFmpeg installed via winget or choco
3. **Intuitive UI** — if a first-time user can't figure it out in 10 seconds, redesign it
4. **Local machine** — everything runs on the user's Windows PC via Docker Desktop

## On Each "Continue"

1. Read `%USERPROFILE%\.viraedit_state.json` for current epic
2. Announce: "Building [Epic ID]: [Epic Name]"
3. List tasks to complete
4. Build everything — code, tests, error logging
5. Provide Windows-specific run instructions
6. Update state file
7. End with: "✅ Done. Next: [Epic ID] — [name]. Type 'continue'."

## State File Location (Windows)
`C:\Users\[YourName]\.viraedit_state.json`

## Reference Files

Read before building each phase:
- `references/nepali-ai.md` — Nepali language AI models and prompting
- `references/architecture.md` — Full system architecture
- `references/phase-map.md` — All epics, stories, tasks
- `references/windows-setup.md` — Windows-specific setup and gotchas
- `references/ui-principles.md` — Intuitive UI rules
- `references/editorial-intelligence.md` — Editorial AI rules
- `references/testing-guide.md` — Test patterns
- `references/error-patterns.md` — Error handling

## Windows-Specific Rules

ALWAYS use Windows-compatible code:
- File paths: use `pathlib.Path` in Python (handles both / and \)
- Scripts: provide both `.bat` (simple) and `.ps1` (PowerShell) versions
- FFmpeg: assume installed at `C:\ffmpeg\bin\ffmpeg.exe` or in PATH
- Docker: use Docker Desktop for Windows
- Node: installed via winget or nodejs.org installer
- Python: use `python` not `python3`, use `venv` not `virtualenv`
- Line endings: configure `.gitattributes` for LF on all text files
- Ports: check Windows Defender Firewall notes for local ports

## Nepali Language Rules

ALWAYS account for Nepali in:
- Transcription: use Groq Whisper (supports Nepali) with `language="ne"` hint
- LLM prompts: instruct model that content is in Nepali
- Scene analysis: understand Nepali cultural context and idioms
- Captions: render Devanagari script correctly (Unicode, proper font)
- Caption font: use Mukta, Laila, or Noto Sans Devanagari
- Hook detection: Nepali storytelling patterns differ from English
- UI labels: provide Nepali translations for all key labels (bilingual)

## UI Intuition Rules

Every UI decision must pass this test:
"Can a Nepali YouTuber who has never used video editing software
figure this out without reading any documentation?"

If no → redesign it.

Specific rules:
- Every button has an icon AND a text label (never icon-only)
- Every action has an undo (show Ctrl+Z hint after every action)
- Onboarding tooltip on first visit for every panel
- Empty states tell the user exactly what to do next
- Progress always visible (never leave user wondering "is it working?")
- Errors in plain language with a "Fix it" button where possible
- Nepali language option in UI (toggle between English and Nepali labels)

## Competitor DNA Rules

Read `references/competitor-dna.md` before building ANY UI component.

Every UI component must pass the 6-tool test:
- Descript user: can they edit by clicking transcript text?
- Opus Clip user: can they see viral scores and export shorts immediately?
- CapCut user: is the first action obvious with zero instructions?
- VEED user: is the layout clean and balanced?
- Canva user: can they drag visual templates onto the timeline?
- Riverside user: is there an AI Producer panel for podcasts?

## 6 UI Modes to Implement

Build these modes as layout variants (not separate pages):

1. **Podcast Mode** — Transcript dominant, AI Producer panel, speaker colors
2. **Shorts Mode** — Virality cards dominant, 9:16 preview, platform scores
3. **Visual Creator Mode** — Template library, canvas, properties panel
4. **Full Editor Mode** — Standard 4-panel NLE layout
5. **Tutorial Mode** — B-roll track prominent, chapter markers, visual hints
6. **Quick Export Mode** — Ultra-simple: captions only → export

Mode switching:
- Auto-detected from content type during onboarding
- Manual switch via mode selector in header
- Each mode persists per project
- Smooth animated transition between modes

## Onboarding "Switch" Detection

During onboarding Step 2, ask which tool they're switching FROM.
Use the answer to customize:
- Default mode
- First panel shown
- First tooltip text
- Sample project content
