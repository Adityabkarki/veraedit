@echo off
REM ViraEdit - Start Full Development Environment
REM Starts Docker services, then the app, then workers.

setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo.
echo ==========================================
echo   ViraEdit Development Mode
echo ==========================================
echo.

REM Ensure Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running.
    echo         Start Docker Desktop and wait for it to fully load,
    echo         then run this script again.
    pause
    exit /b 1
)

REM Start infrastructure services
echo Starting Docker services (PostgreSQL, Redis, MinIO)...
docker compose -f infra\docker\docker-compose.yml up -d
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start Docker services.
    pause
    exit /b 1
)
echo [OK] Docker services started
echo.

REM Wait for services to be ready
echo Waiting for services to initialise...
timeout /t 10 /nobreak >nul

REM Start workers in background windows
echo Starting AI workers...
call scripts\start_workers.bat
echo.

REM Start the app (Next.js + FastAPI via Turborepo)
echo Starting frontend and API...
echo (Press Ctrl+C in this window to stop the app)
echo.
call npm run dev
