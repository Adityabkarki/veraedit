@echo off
:: ViraEdit — Start All Workers (Windows)
:: Opens each worker in its own cmd window.
:: IMPORTANT: --pool=solo required on Windows (no fork)
::
:: Usage:
::   scripts\start_workers.bat          — starts all 4 specialised workers
::   scripts\start_workers.bat quick    — starts one all-queues worker (simpler)

setlocal

set "ROOT=%~dp0.."
set "API_DIR=%ROOT%\apps\api"

echo.
echo ╔════════════════════════════════════════════════╗
echo ║   ViraEdit — Starting All Workers (Windows)    ║
echo ╠════════════════════════════════════════════════╣
echo ║  Each worker opens in its own terminal window  ║
echo ║  Close those windows to stop the workers       ║
echo ╚════════════════════════════════════════════════╝
echo.

:: Ensure logs directory exists
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"

if "%1"=="quick" goto :quick_mode

:: ── 4 specialised workers, one per queue ──────────────────────────────────────

echo Starting Transcription Worker (Groq Whisper)...
start "ViraEdit — Transcription Worker" cmd /k ^
    "cd /d "%API_DIR%" && ^
    .venv\Scripts\celery.exe -A celery_app worker ^
    --queues=transcription ^
    --pool=solo ^
    --loglevel=info ^
    --hostname=transcription@%%h ^
    2>&1 | .venv\Scripts\python.exe -c ""import sys; [print(l, end='') for l in sys.stdin]"" ^
    || pause"

timeout /t 2 /nobreak >nul

echo Starting Analysis Worker (Claude AI)...
start "ViraEdit — Analysis Worker" cmd /k ^
    "cd /d "%API_DIR%" && ^
    .venv\Scripts\celery.exe -A celery_app worker ^
    --queues=analysis ^
    --pool=solo ^
    --loglevel=info ^
    --hostname=analysis@%%h ^
    || pause"

timeout /t 2 /nobreak >nul

echo Starting Render Worker (FFmpeg)...
start "ViraEdit — Render Worker" cmd /k ^
    "cd /d "%API_DIR%" && ^
    .venv\Scripts\celery.exe -A celery_app worker ^
    --queues=render ^
    --pool=solo ^
    --loglevel=info ^
    --hostname=render@%%h ^
    || pause"

timeout /t 2 /nobreak >nul

echo Starting AI Worker (Style Transfer)...
start "ViraEdit — AI Worker" cmd /k ^
    "cd /d "%API_DIR%" && ^
    .venv\Scripts\celery.exe -A celery_app worker ^
    --queues=ai ^
    --pool=solo ^
    --loglevel=info ^
    --hostname=ai@%%h ^
    || pause"

echo.
echo All 4 workers started in separate windows.
echo.
echo Workers:
echo   Transcription — Groq Whisper transcription
echo   Analysis      — Claude AI scene + editorial analysis
echo   Render        — FFmpeg video encoding
echo   AI            — Style transfer extraction
echo.
echo To stop: close the worker terminal windows.
echo To check: scripts\health_check.bat
goto :eof

:: ── Quick mode: one all-queues worker (for development) ──────────────────────

:quick_mode
echo Starting single all-queues worker (quick mode)...
start "ViraEdit — Worker (All Queues)" cmd /k ^
    "cd /d "%API_DIR%" && ^
    .venv\Scripts\celery.exe -A celery_app worker ^
    --queues=transcription,analysis,render,ai,default ^
    --pool=solo ^
    --loglevel=info ^
    --hostname=dev-worker@%%h ^
    || pause"

echo.
echo Worker started (all queues, solo pool).
echo Press Ctrl+C in the worker window to stop.
