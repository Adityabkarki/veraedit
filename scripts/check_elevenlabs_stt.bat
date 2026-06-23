@echo off
REM Verify ElevenLabs API key in .env (format + GET /v1/user)
cd /d "%~dp0..\apps\api"
.venv\Scripts\python.exe -c "from services.elevenlabs_health import check_elevenlabs_account; import json; print(json.dumps(check_elevenlabs_account(), indent=2))"
exit /b %errorlevel%
