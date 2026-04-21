#!/bin/bash
# Career Tracker launcher for macOS
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting Career Tracker..."

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
