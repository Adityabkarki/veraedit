# ViraEdit — Windows Setup Reference
# Everything Windows-specific for local development

---

## PREREQUISITES INSTALL (Windows)

Run this in PowerShell as Administrator (one time):

```powershell
# setup_windows.ps1

Write-Host "Installing ViraEdit prerequisites..." -ForegroundColor Green

# 1. Install winget if not present (usually pre-installed on Win 10/11)
# Check: winget --version

# 2. Install Node.js LTS
winget install OpenJS.NodeJS.LTS

# 3. Install Python 3.11
winget install Python.Python.3.11

# 4. Install Git
winget install Git.Git

# 5. Install Docker Desktop
winget install Docker.DockerDesktop

# 6. Install FFmpeg
winget install Gyan.FFmpeg
# OR via Chocolatey: choco install ffmpeg

# 7. Install Visual Studio Build Tools (needed for some Python packages)
winget install Microsoft.VisualStudio.2022.BuildTools

# 8. Restart PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + 
            [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "Prerequisites installed! Please restart your terminal." -ForegroundColor Green
```

**After install, restart PowerShell and verify:**
```powershell
node --version       # should show v20.x.x
python --version     # should show 3.11.x
git --version        # should show 2.x.x
docker --version     # should show 24.x.x
ffmpeg -version      # should show ffmpeg version
```

---

## FFMPEG ON WINDOWS

After installing FFmpeg via winget, it should be in PATH automatically.
If not, add manually:

```powershell
# Add FFmpeg to PATH permanently
$ffmpegPath = "C:\Program Files\FFmpeg\bin"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$ffmpegPath", "Machine")
```

In Python code, always use pathlib for cross-platform paths:
```python
import shutil
from pathlib import Path

# Find FFmpeg
ffmpeg_path = shutil.which("ffmpeg")
if not ffmpeg_path:
    # Try common Windows locations
    candidates = [
        Path("C:/ffmpeg/bin/ffmpeg.exe"),
        Path("C:/Program Files/FFmpeg/bin/ffmpeg.exe"),
        Path(os.environ.get("FFMPEG_PATH", "")) / "ffmpeg.exe"
    ]
    for candidate in candidates:
        if candidate.exists():
            ffmpeg_path = str(candidate)
            break

if not ffmpeg_path:
    raise RuntimeError(
        "FFmpeg not found. Install with: winget install Gyan.FFmpeg\n"
        "Then restart your terminal."
    )
```

---

## DOCKER DESKTOP ON WINDOWS

### First-time setup
1. Install Docker Desktop
2. During setup, choose "WSL 2" backend (NOT Hyper-V) — faster for this app
3. Enable WSL 2 integration in Docker Desktop settings
4. Start Docker Desktop (it runs in system tray)

### Windows-specific docker-compose notes

```yaml
# docker-compose.yml — Windows-compatible version

services:
  postgres:
    image: pgvector/pgvector:pg16
    volumes:
      # Windows: use named volumes, NOT bind mounts for DB
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: viraedit
      POSTGRES_PASSWORD: viraedit_dev_password
      POSTGRES_DB: viraedit
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    ports:
      - "9000:9000"
      - "9001:9001"

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

**Named volumes** (not bind mounts) are used for databases because Windows
bind mounts have permission issues with PostgreSQL.

---

## PYTHON VIRTUAL ENVIRONMENT (WINDOWS)

```batch
:: setup_python.bat
cd apps\api

:: Create venv
python -m venv venv

:: Activate (Windows-specific!)
venv\Scripts\activate.bat

:: Install dependencies
pip install -r requirements.txt

:: Verify
python -c "import fastapi; print('FastAPI OK')"
```

In PowerShell:
```powershell
cd apps\api
python -m venv venv
.\venv\Scripts\Activate.ps1    # Note: different from .bat
pip install -r requirements.txt
```

**If PowerShell script execution is blocked:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## NODE.JS / NPM ON WINDOWS

```batch
:: Install dependencies from project root
cd viraedit
npm install

:: Start development
npm run dev
```

**Windows PATH issue with npm:**
If `npm` is not found after installing Node.js, restart the terminal.
If still missing: re-run Node.js installer and check "Add to PATH" option.

---

## FILE PATHS IN CODE

Always use `pathlib.Path` in Python — never hardcode separators:

```python
# WRONG (breaks on Windows)
path = "/home/user/videos/" + filename
path = f"data/projects/{project_id}/assets/{asset_id}"

# CORRECT (works on Windows and Linux)
from pathlib import Path
path = Path.home() / "videos" / filename
path = Path("data") / "projects" / project_id / "assets" / asset_id

# Convert to string for FFmpeg
str(path)              # "C:\Users\user\videos\video.mp4" on Windows
path.as_posix()        # "C:/Users/user/videos/video.mp4" (for FFmpeg on Windows)
```

**FFmpeg on Windows uses forward slashes**, so always use `.as_posix()`:
```python
cmd = [
    "ffmpeg",
    "-i", Path(input_file).as_posix(),   # forward slashes for FFmpeg
    "-c:v", "libx264",
    Path(output_file).as_posix()
]
```

---

## LINE ENDINGS (.gitattributes)

Create `.gitattributes` at project root to prevent line ending issues:

```
# .gitattributes
* text=auto eol=lf
*.bat text eol=crlf    # Windows batch files NEED CRLF
*.ps1 text eol=crlf    # PowerShell scripts NEED CRLF
*.py text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.json text eol=lf
*.md text eol=lf
*.sql text eol=lf
*.env.example text eol=lf
Dockerfile text eol=lf
```

---

## WINDOWS PORTS & FIREWALL

When running locally, Windows Defender Firewall may block ports.
If you can't connect to a service, run in PowerShell as Admin:

```powershell
# Allow all ViraEdit ports through firewall
$ports = @(3000, 8000, 5432, 6379, 9000, 9001)
foreach ($port in $ports) {
    New-NetFirewallRule -DisplayName "ViraEdit Port $port" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -Action Allow `
        -ErrorAction SilentlyContinue
}
Write-Host "Firewall rules added for ports: $($ports -join ', ')"
```

---

## CELERY ON WINDOWS

Celery has a known issue on Windows: the default prefork pool doesn't work.
Always use the `solo` or `eventlet` pool on Windows:

```batch
:: workers\start_workers.bat

:: Transcription worker
start "ViraEdit Transcription Worker" cmd /k ^
    "cd /d %~dp0.. && venv\Scripts\activate && ^
    celery -A workers.celery_app worker ^
    --queues=transcription ^
    --concurrency=1 ^
    --pool=solo ^
    --loglevel=info ^
    --logfile=logs\worker_transcription.log"

:: Analysis worker  
start "ViraEdit Analysis Worker" cmd /k ^
    "cd /d %~dp0.. && venv\Scripts\activate && ^
    celery -A workers.celery_app worker ^
    --queues=analysis ^
    --concurrency=1 ^
    --pool=solo ^
    --loglevel=info ^
    --logfile=logs\worker_analysis.log"

:: Render worker
start "ViraEdit Render Worker" cmd /k ^
    "cd /d %~dp0.. && venv\Scripts\activate && ^
    celery -A workers.celery_app worker ^
    --queues=render ^
    --concurrency=1 ^
    --pool=solo ^
    --loglevel=info ^
    --logfile=logs\worker_render.log"
```

**Add to requirements.txt:**
```
celery[redis]>=5.3
eventlet>=0.33  # Windows Celery pool
```

**In celery_app.py:**
```python
app = Celery('viraedit')
app.conf.update(
    # CRITICAL for Windows
    worker_pool='solo',          # Use solo pool on Windows
    worker_concurrency=1,
    task_always_eager=False,
)
```

---

## COMPLETE SETUP SCRIPT (WINDOWS)

```batch
:: scripts\setup.bat
@echo off
setlocal enabledelayedexpansion

echo.
echo ==========================================
echo   ViraEdit Setup for Windows
echo ==========================================
echo.

:: Check prerequisites
echo Checking prerequisites...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Install: winget install OpenJS.NodeJS.LTS
    exit /b 1
)
echo [OK] Node.js found

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Install: winget install Python.Python.3.11
    exit /b 1
)
echo [OK] Python found

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker not found. Install Docker Desktop from docker.com
    exit /b 1
)
echo [OK] Docker found

where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg not found. Install: winget install Gyan.FFmpeg
    exit /b 1
)
echo [OK] FFmpeg found

:: Create .env if not exists
if not exist .env (
    copy .env.example .env
    echo [OK] Created .env from .env.example
    echo [!] Edit .env to add your GROQ_API_KEY
) else (
    echo [OK] .env already exists
)

:: Install Node dependencies
echo.
echo Installing Node dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed
    exit /b 1
)
echo [OK] Node dependencies installed

:: Create Python virtual environment
echo.
echo Setting up Python environment...
cd apps\api
if not exist venv (
    python -m venv venv
    echo [OK] Python venv created
)
call venv\Scripts\activate.bat
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [ERROR] pip install failed
    exit /b 1
)
echo [OK] Python dependencies installed
cd ..\..

:: Create log directory
if not exist logs mkdir logs
echo [OK] Logs directory ready

:: Start Docker services
echo.
echo Starting Docker services...
docker compose up -d
if %errorlevel% neq 0 (
    echo [ERROR] Docker compose failed. Is Docker Desktop running?
    exit /b 1
)

:: Wait for services
echo Waiting for services to be ready...
timeout /t 15 /nobreak >nul

:: Run database migrations
echo Running database migrations...
cd apps\api
call venv\Scripts\activate.bat
python -m alembic upgrade head
if %errorlevel% neq 0 (
    echo [ERROR] Database migration failed
    exit /b 1
)
cd ..\..
echo [OK] Database ready

:: Install Devanagari fonts
echo.
echo Installing Nepali fonts...
call scripts\install_fonts.bat

echo.
echo ==========================================
echo   Setup Complete!
echo ==========================================
echo.
echo Next steps:
echo   1. Edit .env and add your GROQ_API_KEY
echo      (Get free key at: console.groq.com)
echo   2. Run: npm run dev
echo   3. Open: http://localhost:3000
echo.
echo To start workers in separate windows:
echo   scripts\start_workers.bat
echo.
```

---

## RUNNING THE APP (WINDOWS)

### Start everything:
```batch
:: Terminal 1: Docker services (if not already running)
docker compose up -d

:: Terminal 2: Frontend + Backend (combined dev mode)
npm run dev

:: Terminal 3: Workers
scripts\start_workers.bat
```

### Stop everything:
```batch
docker compose down
:: Close worker terminal windows manually
```

### Check everything is working:
```batch
scripts\health_check.bat
```

`health_check.bat`:
```batch
@echo off
echo Checking ViraEdit services...
echo.

:: API
curl -s http://localhost:8000/health | findstr "ok" >nul
if %errorlevel%==0 (echo [OK] API running) else (echo [FAIL] API not responding)

:: Frontend
curl -s http://localhost:3000 >nul
if %errorlevel%==0 (echo [OK] Frontend running) else (echo [FAIL] Frontend not responding)

:: PostgreSQL
docker exec viraedit-postgres pg_isready -U viraedit >nul 2>&1
if %errorlevel%==0 (echo [OK] PostgreSQL running) else (echo [FAIL] PostgreSQL not ready)

:: Redis
docker exec viraedit-redis redis-cli ping | findstr "PONG" >nul
if %errorlevel%==0 (echo [OK] Redis running) else (echo [FAIL] Redis not responding)

:: MinIO
curl -s http://localhost:9000/minio/health/live >nul
if %errorlevel%==0 (echo [OK] MinIO running) else (echo [FAIL] MinIO not responding)

echo.
```
