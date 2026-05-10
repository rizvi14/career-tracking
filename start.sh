#!/bin/bash
# Career Tracker launcher for macOS
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Career Tracker..."

# Start Ollama if not already running
if ! pgrep -x "ollama" > /dev/null; then
    echo "Starting Ollama..."
    ollama serve &>/dev/null &
    sleep 3
fi

# Pull llama3.2 if not already downloaded
if ! ollama list | grep -q "llama3.2"; then
    echo "Pulling llama3.2 (first-time setup, this may take a few minutes)..."
    ollama pull llama3.2
fi

# Install Playwright browser binaries if not already present
"$SCRIPT_DIR/backend/venv/bin/python" -m playwright install chromium --quiet 2>/dev/null || true

# Start backend in a new Terminal window
osascript -e "
tell application \"Terminal\"
    activate
    do script \"cd '$SCRIPT_DIR/backend' && source venv/bin/activate && uvicorn main:app --reload --port 8000\"
end tell
"

sleep 2

# Start frontend in a new Terminal window
osascript -e "
tell application \"Terminal\"
    activate
    do script \"cd '$SCRIPT_DIR/frontend' && npm run dev\"
end tell
"

sleep 2

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo ""

# Open the app in the default browser
open http://localhost:5173
