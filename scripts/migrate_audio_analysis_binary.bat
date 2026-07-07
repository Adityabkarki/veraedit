@echo off
REM Migrate JSON audio analysis sidecars to binary format (Phase 13)
cd /d "%~dp0.."
set PYTHONPATH=apps\api
python scripts\migrate_audio_analysis_binary.py %*