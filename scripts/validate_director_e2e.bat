@echo off
REM Phase 5 Director pipeline validation
cd /d "%~dp0.."
python scripts\validate_director_e2e.py %*
