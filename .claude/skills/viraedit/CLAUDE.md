@'
# ViraEdit Project

## What This Is
AI-native video editing platform for Nepali content creators.
Running locally on Windows 10/11 at C:\Users\adity\viraedit

## Read Before Every Response
Read all files in .claude/skills/viraedit/ before doing anything.
Start with SKILL.md, then read the relevant reference files for the current epic.

## Current Build State
Check .claude/skills/viraedit/scripts/build_state.py to find
which epic was last completed and what to build next.

## When User Says "continue"
1. Read build_state.py - find current_epic value
2. Read phase-map.md - find all tasks for that epic
3. Build every task completely. No skipping.
4. Write tests and run them. Fix failures before moving on.
5. Update build_state.py to next epic
6. End with: "Done. Next: [Epic ID]. Type continue."

## LANGUAGE RULES — READ CAREFULLY

### App Language = English ONLY
- All buttons, menus, labels, settings: English
- All error messages: English
- All AI suggestions displayed to user: English
- All onboarding, tooltips, dialogs: English
- No Nepali anywhere in the UI

### Nepali = Only for Video Content Processing
- Whisper transcription: language="ne" (transcribes Nepali speech)
- Captions rendered ON the video: Nepali (Devanagari)
- Transcript editor panel: shows Nepali words from the video
- Devanagari font (Noto Sans Devanagari): only for video caption rendering
- AI analyzes Nepali content internally, reports findings in English

### Simple Rule
  The APP speaks English.
  The VIDEO is in Nepali.
  The AI understands both.

### What to REMOVE from previous plans
- Remove: UI language toggle (English/Nepali)
- Remove: Nepali button labels
- Remove: Nepali onboarding text
- Remove: "नमस्ते!" welcome screens
- Remove: Bilingual UI components

### What to KEEP
- Keep: language="ne" in all Whisper calls
- Keep: Noto Sans Devanagari font for video caption rendering
- Keep: Nepali filler word detection
- Keep: Nepali hook rewriting (AI suggestions about video content)

## STYLE TRANSFER — CORE FEATURE

Users can paste a TikTok/YouTube/Instagram URL or upload any video
to extract its editing style and apply it to their own videos.

This is EP-2.8 in the build. See references/style-transfer.md.

Style transfer extracts:
- Caption style (font, size, animation, position)
- Cut pacing (cuts per minute, rhythm)
- Color grade (brightness, contrast, temperature)
- Transition types
- Hook structure
- B-roll frequency
- Audio/music energy

Users can copy ALL components or just ONE (e.g. "copy only the captions").
Strength slider: 0-100% controls how strongly the style is applied.
Styles are saved to a library and reused across projects.

Dependencies for style transfer:
- yt-dlp (video downloading from URLs)
- easyocr (caption detection from frames)
- scipy (signal processing)
- scikit-image (color analysis)

## Project Facts
- Primary language: Nepali speech/captions, English UI
- Platform: Windows 10/11 local machine
- User home: C:\Users\adity
- AI budget: ~$0.14 per hour of video
- Inspired by: Descript + Opus Clip + CapCut + VEED + Canva + Riverside
- Multi-camera: 3-camera podcast support with audio fingerprint sync
- Content types: Podcast, Tutorial, Vlog, Shorts (mix of all)

## Hard Rules — Never Break
1. All file paths use pathlib.Path — never hardcoded backslashes
2. Celery workers always use --pool=solo on Windows
3. FFmpeg always receives path.as_posix() — not str(path)
4. Noto Sans Devanagari font — only in caption rendering, not UI
5. Whisper always called with language="ne"
6. Every function has at least one test
7. Every error message is human-readable English
8. All runnable scripts provided as .bat files

## Reference Files (all in .claude/skills/viraedit/references/)
- architecture.md           system design and data flow
- phase-map.md              all 35+ epics, every task, acceptance criteria
- nepali-ai.md              Nepali language AI config — transcription only
- windows-setup.md          Windows-specific patterns and gotchas
- ui-principles.md          intuitive UI rules — English only
- competitor-dna.md         what to steal from 6 competitor tools
- cost-and-multicam.md      pricing breakdown and 3-camera architecture
- style-transfer.md         URL/video style extraction and application
- editorial-intelligence.md AI editing rules and heuristics
- testing-guide.md          test patterns for Python and TypeScript
- error-patterns.md         error handling and structured logging
- tech-decisions.md         technology choices and cost breakdown
'@
