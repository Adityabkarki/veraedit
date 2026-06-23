@echo off
REM ViraEdit — restart Celery workers (required after Python code changes)
setlocal
set "ROOT=%~dp0.."
set "API=%ROOT%\apps\api"

echo Stopping Celery workers...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"name='python.exe' OR name='celery.exe'\" | Where-Object { $_.CommandLine -match 'celery_app worker' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

timeout /t 2 /nobreak >nul

echo Starting Celery worker (all queues)...
cd /d "%API%"
call "%~dp0worker.bat" all
