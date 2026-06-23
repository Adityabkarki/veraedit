@echo off
setlocal enabledelayedexpansion

echo.
echo ==========================================
echo   ViraEdit Setup for Windows
echo   AI Video Editor for Nepali Creators
echo ==========================================
echo.

set "ROOT=%~dp0.."
cd /d "%ROOT%"

:: ── PREREQUISITE CHECKS ─────────────────────────────────────
echo [1/7] Checking prerequisites...
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo         Install with: winget install OpenJS.NodeJS.LTS
    echo         Then restart this terminal and run setup again.
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found.
    echo         Install with: winget install Python.Python.3.11
    echo         Then restart this terminal and run setup again.
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version') do set PY_VER=%%v
echo [OK] %PY_VER%

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker not found.
    echo         Install Docker Desktop from https://www.docker.com/products/docker-desktop
    echo         Make sure Docker Desktop is running before continuing.
    exit /b 1
)
echo [OK] Docker found

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is installed but not running.
    echo         Please start Docker Desktop and wait for it to fully load,
    echo         then run this script again.
    exit /b 1
)
echo [OK] Docker is running

where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg not found.
    echo         Install with: winget install Gyan.FFmpeg
    echo         Then restart this terminal and run setup again.
    exit /b 1
)
echo [OK] FFmpeg found
echo.

:: ── ENV FILE ────────────────────────────────────────────────
echo [2/7] Setting up environment...
if not exist .env (
    copy .env.example .env >nul
    echo [OK] Created .env from .env.example
    echo [!] IMPORTANT: Edit .env and add your GROQ_API_KEY
    echo     Get a FREE key at: https://console.groq.com
) else (
    echo [OK] .env already exists
)
echo.

:: ── NODE DEPENDENCIES ────────────────────────────────────────
echo [3/7] Installing Node.js dependencies...
call npm install --prefer-offline
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed. Check your internet connection and try again.
    exit /b 1
)
echo [OK] Node dependencies installed
echo.

:: ── PYTHON VIRTUAL ENVIRONMENT ───────────────────────────────
echo [4/7] Setting up Python environment...
cd apps\api
if not exist venv (
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create Python virtual environment.
        exit /b 1
    )
    echo [OK] Python venv created
) else (
    echo [OK] Python venv already exists
)

call venv\Scripts\activate.bat
pip install --upgrade pip --quiet
if exist requirements.txt (
    pip install -r requirements.txt --quiet
    if %errorlevel% neq 0 (
        echo [ERROR] pip install failed. Check requirements.txt
        exit /b 1
    )
    echo [OK] Python dependencies installed
) else (
    echo [!] requirements.txt not found — will be created in EP-1.1
)
cd ..\..
echo.

:: ── LOGS DIRECTORY ──────────────────────────────────────────
echo [5/7] Creating directories...
if not exist logs mkdir logs
if not exist uploads mkdir uploads
if not exist renders mkdir renders
echo [OK] Directories ready
echo.

:: ── DOCKER SERVICES ─────────────────────────────────────────
echo [6/7] Starting Docker services...
if exist infra\docker\docker-compose.yml (
    docker compose -f infra\docker\docker-compose.yml up -d
    if %errorlevel% neq 0 (
        echo [ERROR] Docker Compose failed.
        echo         Make sure Docker Desktop is running and has WSL2 enabled.
        exit /b 1
    )
    echo Waiting 15 seconds for services to initialise...
    timeout /t 15 /nobreak >nul
    echo [OK] Docker services started
) else (
    echo [!] docker-compose.yml not found — will be created in EP-0.2
)
echo.

:: ── FONTS ──────────────────────────────────────────────────
echo [7/7] Installing Nepali fonts (Devanagari)...
call scripts\install_fonts.bat
echo.

:: ── DONE ──────────────────────────────────────────────────
echo ==========================================
echo   Setup Complete!
echo ==========================================
echo.
echo Next steps:
echo   1. Edit .env and add your GROQ_API_KEY
echo      (FREE key at: console.groq.com)
echo.
echo   2. Start the app:
echo      npm run dev
echo.
echo   3. Open in browser:
echo      http://localhost:3000
echo.
echo   4. Start AI workers (new terminal):
echo      scripts\start_workers.bat
echo.
echo To verify everything is working:
echo      scripts\health_check.bat
echo.
pause
