@echo off
REM Weekly yt-dlp canary — set CANARY_YOUTUBE_URL etc. in .env before running.
cd /d "%~dp0.."
python scripts\canary_download_test.py
pause
