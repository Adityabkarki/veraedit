@echo off
REM ViraEdit — restart a single FastAPI instance on port 8000
REM Kills uvicorn reloaders AND orphaned spawn_main workers (Windows --reload quirk).
setlocal
set "ROOT=%~dp0.."
set "API=%ROOT%\apps\api"
set "VENV=%API%\.venv\Scripts\python.exe"

echo Stopping uvicorn and orphaned API workers on port 8000...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | Where-Object { $_.CommandLine -match 'viraedit\\apps\\api' -and ($_.CommandLine -match 'uvicorn main:app' -or $_.CommandLine -match 'spawn_main') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

REM Fallback: netstat PIDs (may include stale entries; harmless if already dead)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo Starting API on http://127.0.0.1:8000 ...
cd /d "%API%"
"%VENV%" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
