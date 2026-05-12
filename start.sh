#!/bin/bash
# Career Tracker launcher for macOS
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Career Tracker..."

# Close all existing Terminal windows
osascript -e 'tell application "Terminal" to close every window' 2>/dev/null || true

# Kill anything already on ports 8000 and 5173
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true

# Locate ollama binary
OLLAMA=$(command -v ollama 2>/dev/null \
    || ls /usr/local/bin/ollama /opt/homebrew/bin/ollama \
          "/Applications/Ollama.app/Contents/MacOS/Ollama" 2>/dev/null | head -1)

if [ -z "$OLLAMA" ]; then
    echo "ERROR: Ollama not found. Install it from https://ollama.com and rerun."
    exit 1
fi

# Start Ollama if not already running
if ! pgrep -f "ollama" > /dev/null; then
    echo "Starting Ollama..."
    "$OLLAMA" serve &>/dev/null &
    sleep 3
fi

# Pull llama3.2 / check for updates (no-op if already current)
echo "Checking for llama3.2 updates..."
"$OLLAMA" pull llama3.2

# Install/sync backend dependencies
"$SCRIPT_DIR/backend/venv/bin/pip" install -r "$SCRIPT_DIR/backend/requirements.txt" --quiet

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
