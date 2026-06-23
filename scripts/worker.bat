@echo off
:: ViraEdit Celery Worker — Windows
:: CRITICAL: --pool=solo required on Windows (no fork support)
::
:: Usage:
::   scripts\worker.bat              — transcription queue (default)
::   scripts\worker.bat all          — all 5 queues in one process
::   scripts\worker.bat render       — render queue only
::   scripts\worker.bat ai           — AI/style-transfer queue only
::   scripts\worker.bat analysis     — analysis queue only

setlocal

set SCRIPT_DIR=%~dp0
set API_DIR=%SCRIPT_DIR%..\apps\api

echo.
echo ╔═══════════════════════════════════════╗
echo ║    ViraEdit Celery Worker (Windows)   ║
echo ╚═══════════════════════════════════════╝
echo Pool: solo  ^(Windows-compatible, no fork^)
echo.

cd /d "%API_DIR%"

if "%1"=="all" (
    echo Queues: transcription, analysis, render, ai, default
    .venv\Scripts\celery.exe -A celery_app worker ^
        --pool=solo ^
        --loglevel=info ^
        --queues=transcription,analysis,render,ai,default ^
        --hostname=worker-all@%%h
) else if "%1"=="render" (
    echo Queue: render
    .venv\Scripts\celery.exe -A celery_app worker ^
        --pool=solo ^
        --loglevel=info ^
        --queues=render ^
        --hostname=worker-render@%%h
) else if "%1"=="ai" (
    echo Queue: ai  ^(style transfer^)
    .venv\Scripts\celery.exe -A celery_app worker ^
        --pool=solo ^
        --loglevel=info ^
        --queues=ai ^
        --hostname=worker-ai@%%h
) else if "%1"=="analysis" (
    echo Queue: analysis
    .venv\Scripts\celery.exe -A celery_app worker ^
        --pool=solo ^
        --loglevel=info ^
        --queues=analysis ^
        --hostname=worker-analysis@%%h
) else (
    echo Queue: transcription
    .venv\Scripts\celery.exe -A celery_app worker ^
        --pool=solo ^
        --loglevel=info ^
        --queues=transcription ^
        --hostname=worker-transcription@%%h
)
