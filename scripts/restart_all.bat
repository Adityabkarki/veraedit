@echo off
REM ViraEdit — full clean restart: stop all, clear caches, Docker, API, workers, frontend.
REM Usage: scripts\restart_all.bat

setlocal EnableDelayedExpansion
set "ROOT=%~dp0.."
set "API=%ROOT%\apps\api"
set "WEB=%ROOT%\apps\web"
cd /d "%ROOT%"

echo.
echo ==========================================
echo   ViraEdit — Full Clean Restart
echo ==========================================
echo.

REM ── 1. Stop API, workers, frontend ─────────────────────────────────────────
echo [1/6] Stopping API, Celery workers, and frontend...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"name='python.exe' OR name='celery.exe' OR name='node.exe'\" | Where-Object { $_.CommandLine -match 'viraedit' -and ($_.CommandLine -match 'uvicorn|celery_app|next dev|spawn_main|turbo') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do taskkill /F /PID %%a >nul 2>&1
timeout /t 2 /nobreak >nul
echo       Done.
echo.

REM ── 2. Clear caches ─────────────────────────────────────────────────────────
echo [2/6] Clearing Next.js, Turbo, and Python caches...
if exist "%WEB%\.next" (
    rmdir /s /q "%WEB%\.next"
    echo       Removed apps\web\.next
)
if exist "%ROOT%\.turbo" (
    rmdir /s /q "%ROOT%\.turbo"
    echo       Removed .turbo
)
if exist "%WEB%\.turbo" (
    rmdir /s /q "%WEB%\.turbo"
    echo       Removed apps\web\.turbo
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-ChildItem -Path '%API%' -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"
echo       Done.
echo.

REM ── 3. Restart Docker infrastructure ────────────────────────────────────────
echo [3/6] Restarting Docker (PostgreSQL, Redis, MinIO)...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running. Start Docker Desktop and run this script again.
    exit /b 1
)
docker compose -f infra\docker\docker-compose.yml down
docker compose -f infra\docker\docker-compose.yml up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to restart Docker services.
    exit /b 1
)
echo       Waiting for containers to become healthy...
timeout /t 12 /nobreak >nul

docker exec viraedit-redis redis-cli FLUSHALL >nul 2>&1
if %errorlevel%==0 echo       Redis cache flushed.
echo       Done.
echo.

REM ── 4. Start Celery worker (all queues) ─────────────────────────────────────
echo [4/6] Starting Celery worker (all queues)...
start "ViraEdit — Celery Worker" cmd /k "cd /d \"%API%\" && .venv\Scripts\celery.exe -A celery_app worker --pool=solo --loglevel=info --queues=transcription,analysis,render,ai,default --hostname=worker-all@%%h"
timeout /t 3 /nobreak >nul
echo       Worker window opened.
echo.

REM ── 5. Start API server ─────────────────────────────────────────────────────
echo [5/6] Starting API on http://127.0.0.1:8000 ...
start "ViraEdit — API" cmd /k "cd /d \"%API%\" && .venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
timeout /t 4 /nobreak >nul
echo       API window opened.
echo.

REM ── 6. Start frontend ───────────────────────────────────────────────────────
echo [6/6] Starting frontend on http://127.0.0.1:3000 ...
start "ViraEdit — Frontend" cmd /k "cd /d \"%WEB%\" && npm run dev"
timeout /t 3 /nobreak >nul
echo       Frontend window opened.
echo.

echo ==========================================
echo   Restart complete
echo ==========================================
echo   API:      http://127.0.0.1:8000
echo   Frontend: http://127.0.0.1:3000
echo   MinIO:    http://127.0.0.1:9001
echo.
echo   Three new terminal windows were opened (Worker, API, Frontend).
echo   Run scripts\health_check.bat to verify all services.
echo.
