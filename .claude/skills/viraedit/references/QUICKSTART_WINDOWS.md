# ViraEdit — Windows Quickstart
## From Zero to Running in 30 Minutes

---

## STEP 1: Install Prerequisites (15 min, one time)

Open **PowerShell as Administrator** and run each line:

```powershell
# Install everything needed
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.11
winget install Git.Git
winget install Docker.DockerDesktop
winget install Gyan.FFmpeg
```

**Restart PowerShell after this.**

Then verify:
```powershell
node --version    # v20.x.x
python --version  # 3.11.x
docker --version  # 24.x.x
ffmpeg -version   # starts with "ffmpeg version"
```

If anything is missing, install it again and restart.

---

## STEP 2: Get a Free Groq API Key (2 min)

1. Go to **console.groq.com**
2. Sign up (free, no credit card)
3. Go to API Keys → Create Key
4. Copy the key — you'll need it in Step 4

This powers the Nepali transcription and AI analysis.

---

## STEP 3: Install Claude Code (2 min)

```powershell
npm install -g @anthropic/claude-code
```

Verify:
```powershell
claude --version
```

---

## STEP 4: Create Project & Add the Skill

```powershell
# Create project folder
mkdir C:\viraedit
cd C:\viraedit

# Start Claude Code
claude
```

Inside Claude Code, paste this:

```
I want to build ViraEdit — an AI-native video editing platform
for Nepali language content on Windows.

Key requirements:
- Primary language: Nepali (नेपाली) with Devanagari script
- Platform: Windows 10/11
- Content types: mix of podcast, tutorial, vlog, shorts
- UI must be extremely intuitive (no learning curve)
- All AI costs under $2 per hour of video

Read all reference files from the viraedit skill and begin
building from EP-0.1. After each epic completes, wait for
me to say "continue" before starting the next one.

Start with EP-0.1: Monorepo & Windows Setup.
Build everything. Run the tests. Tell me when done.
```

---

## STEP 5: Just Say "continue"

After Claude Code finishes each epic, type:

```
continue
```

That's it. Claude builds the next piece automatically.

---

## HOW LONG WILL IT TAKE?

| Sessions | What Gets Built |
|----------|----------------|
| 1-3 | Foundation + Backend (database, API, auth) |
| 4-6 | AI Pipeline (Nepali transcription, scene analysis) |
| 7-9 | Timeline Engine + Frontend shell |
| 10-13 | Full editor UI (timeline, AI panel, player) |
| 14-16 | Visual engine + captions in Nepali |
| 17-19 | Render pipeline + exports |
| 20 | Tests + Polish + Done |

**Your effort per session: type "continue" once.**
**Each session: 10-20 min of Claude working.**

---

## AFTER THE BUILD: RUNNING THE APP

```batch
cd C:\viraedit

:: Start Docker services (first time or after restart)
docker compose up -d

:: Start the app
npm run dev

:: Start AI workers (new terminal)
scripts\start_workers.bat
```

Open your browser: **http://localhost:3000**

---

## IF SOMETHING BREAKS

Paste this to Claude Code:

```
Error occurred. Here is the full error:

[paste the error message]

File: [paste the file name if known]

Fix it completely. Run tests to confirm fixed.
Then continue to the next epic.
```

---

## NEPALI CAPTIONS SHOWING BOXES (□□□)?

Run this to install the fonts:
```batch
scripts\install_fonts.bat
```

Then restart the app.

---

## CHECK EVERYTHING IS HEALTHY

```batch
scripts\health_check.bat
```

Expected output:
```
[OK] API running
[OK] Frontend running
[OK] PostgreSQL running
[OK] Redis running
[OK] MinIO running
```
