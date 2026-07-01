@echo off
REM ViraEdit — Start Remotion caption render service (internal port 3500)
setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%\remotion-service"

if not exist node_modules (
  echo Installing Remotion dependencies...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] npm install failed in remotion-service
    pause
    exit /b 1
  )
)

echo Starting Remotion render service on http://127.0.0.1:3500
echo (Internal only — do not expose this port publicly)
node server.js
