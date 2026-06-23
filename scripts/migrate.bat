@echo off
REM ViraEdit - Database Migration Helper
REM Usage:
REM   scripts\migrate.bat              -- apply all pending migrations (upgrade head)
REM   scripts\migrate.bat status       -- show current migration version
REM   scripts\migrate.bat downgrade    -- revert last migration

setlocal
set "ROOT=%~dp0.."
set "API=%ROOT%\apps\api"
set "VENV=%API%\.venv\Scripts\alembic.exe"

if not exist "%VENV%" (
    echo [ERROR] Virtual env not found. Run scripts\setup.bat first.
    exit /b 1
)

REM Load environment
if exist "%ROOT%\.env" (
    for /f "usebackq tokens=1,2 delims==" %%a in ("%ROOT%\.env") do (
        if not "%%a"=="" if not "%%b"=="" set "%%a=%%b"
    )
)

cd /d "%API%"

if "%1"=="status" (
    echo Current migration version:
    "%VENV%" current
) else if "%1"=="downgrade" (
    echo Reverting last migration...
    "%VENV%" downgrade -1
) else if "%1"=="history" (
    "%VENV%" history --verbose
) else (
    echo Applying all pending migrations...
    "%VENV%" upgrade head
    if %errorlevel% equ 0 (
        echo [OK] Database is up to date.
    ) else (
        echo [ERROR] Migration failed.
        exit /b 1
    )
)
