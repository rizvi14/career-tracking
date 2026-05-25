@echo off
echo Starting Career Tracker...

REM Locate Ollama (PATH first, then default Windows install location)
set "OLLAMA=ollama"
where ollama >nul 2>nul
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
        set "OLLAMA=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    ) else (
        echo ERROR: Ollama not found. Install it from https://ollama.com and rerun.
        pause
        exit /b 1
    )
)

REM Pull llama3.2 / check for updates (no-op if already current)
echo Checking for llama3.2 updates...
"%OLLAMA%" pull llama3.2

REM Install/sync backend dependencies
"%~dp0backend\venv\Scripts\pip" install -r "%~dp0backend\requirements.txt" --quiet

REM Install Playwright browser binaries if not already present
"%~dp0backend\venv\Scripts\python" -m playwright install chromium --quiet

start "Career Tracker - Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\uvicorn main:app --reload --port 8000"
timeout /t 2 /nobreak >nul
start "Career Tracker - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Both servers are starting in separate windows.
