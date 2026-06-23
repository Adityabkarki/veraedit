@echo off
:: ViraEdit Health Check
:: Pings all 5 services and reports status.
:: Run after setup to verify everything is working.

setlocal
set PASS=0
set FAIL=0

echo.
echo ==========================================
echo   ViraEdit Health Check
echo ==========================================
echo.

:: ── API (FastAPI) ────────────────────────────────────────────
curl -s --max-time 5 http://localhost:8000/health 2>nul | findstr /c:"ok" >nul 2>&1
if %errorlevel%==0 (
    echo [OK]   API        http://localhost:8000
    set /a PASS+=1
) else (
    echo [FAIL] API        http://localhost:8000  ^(not responding^)
    echo        Run: npm run api
    set /a FAIL+=1
)

:: ── FRONTEND (Next.js) ───────────────────────────────────────
curl -s --max-time 5 http://localhost:3000 >nul 2>&1
if %errorlevel%==0 (
    echo [OK]   Frontend   http://localhost:3000
    set /a PASS+=1
) else (
    echo [FAIL] Frontend   http://localhost:3000  ^(not responding^)
    echo        Run: npm run dev
    set /a FAIL+=1
)

:: ── POSTGRESQL ───────────────────────────────────────────────
docker exec viraedit-postgres pg_isready -U viraedit >nul 2>&1
if %errorlevel%==0 (
    echo [OK]   PostgreSQL localhost:5432
    set /a PASS+=1
) else (
    echo [FAIL] PostgreSQL localhost:5432  ^(not ready^)
    echo        Run: docker compose -f infra\docker\docker-compose.yml up -d postgres
    set /a FAIL+=1
)

:: ── REDIS ────────────────────────────────────────────────────
docker exec viraedit-redis redis-cli ping 2>nul | findstr /c:"PONG" >nul 2>&1
if %errorlevel%==0 (
    echo [OK]   Redis      localhost:6379
    set /a PASS+=1
) else (
    echo [FAIL] Redis      localhost:6379  ^(not responding^)
    echo        Run: docker compose -f infra\docker\docker-compose.yml up -d redis
    set /a FAIL+=1
)

:: ── MINIO ────────────────────────────────────────────────────
curl -s --max-time 5 http://localhost:9000/minio/health/live >nul 2>&1
if %errorlevel%==0 (
    echo [OK]   MinIO      http://localhost:9000  ^(console: :9001^)
    set /a PASS+=1
) else (
    echo [FAIL] MinIO      http://localhost:9000  ^(not responding^)
    echo        Run: docker compose -f infra\docker\docker-compose.yml up -d minio
    set /a FAIL+=1
)

echo.
echo ──────────────────────────────────────────
if %FAIL%==0 (
    echo   All %PASS% services are healthy.
) else (
    echo   %PASS% OK  /  %FAIL% FAILED
    echo.
    echo   To start all Docker services:
    echo   docker compose -f infra\docker\docker-compose.yml up -d
)
echo ==========================================
echo.
