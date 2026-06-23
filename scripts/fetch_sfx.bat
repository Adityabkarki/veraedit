@echo off
cd /d "%~dp0..\apps\api"
python -m scripts.fetch_sfx_library
if errorlevel 1 exit /b 1
python -m scripts.seed_sfx_library
exit /b %errorlevel%
