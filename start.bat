@echo off
echo Starting Career Tracker...

start "Career Tracker - Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\uvicorn main:app --reload --port 8000"
timeout /t 2 /nobreak >nul
start "Career Tracker - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Both servers are starting in separate windows.
