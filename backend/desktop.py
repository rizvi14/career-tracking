"""Desktop entrypoint for Career Tracker.

Wraps the existing FastAPI app in a native window so non-technical users can run
the whole thing by double-clicking one file — no terminal, npm, or pip. On launch
it:

  1. serves the API + built React UI locally (uvicorn on a free localhost port),
  2. opens a native window showing a splash while it prepares the local AI model
     (see bootstrap_ollama), then loads the app,
  3. shuts everything down when the window is closed.

This module is the PyInstaller entrypoint (see build/career_tracker.spec). Run it
directly during development with:  python desktop.py
"""

import json
import socket
import threading
import time
import urllib.request

import uvicorn
import webview

import bootstrap_ollama
from main import app

WINDOW_TITLE = "Career Tracker"

# Minimal branded splash shown while the AI model is prepared on first run. On
# later runs setup is a fast no-op, so this only flashes briefly.
SPLASH_HTML = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { height: 100%; margin: 0; }
      body {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: -apple-system, Segoe UI, Roboto, sans-serif;
        background: #0f172a; color: #e2e8f0;
      }
      h1 { font-size: 1.4rem; margin: 0 0 0.25rem; font-weight: 600; }
      .sub { color: #94a3b8; font-size: 0.85rem; margin-bottom: 2rem; }
      .spinner {
        width: 42px; height: 42px; border-radius: 50%;
        border: 4px solid #1e293b; border-top-color: #38bdf8;
        animation: spin 0.9s linear infinite; margin-bottom: 1.5rem;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      #status {
        font-size: 0.9rem; color: #cbd5e1; min-height: 1.2rem;
        text-align: center; max-width: 80%;
      }
    </style>
  </head>
  <body>
    <div class="spinner"></div>
    <h1>Career Tracker</h1>
    <div class="sub">Getting things ready…</div>
    <div id="status">Starting…</div>
    <script>
      window.setStatus = function (msg) {
        document.getElementById('status').textContent = msg;
      };
    </script>
  </body>
</html>
"""


def find_free_port():
    """Grab an available localhost port so we never clash with :8000 in use."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_for_server(port, timeout=20):
    """Block until the local server answers, or timeout."""
    url = f"http://127.0.0.1:{port}/api/undo/status"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1):
                return True
        except Exception:
            time.sleep(0.3)
    return False


def main():
    port = find_free_port()

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()

    window = webview.create_window(
        WINDOW_TITLE, html=SPLASH_HTML, width=1100, height=780, min_size=(900, 640)
    )

    def setup():
        def log(msg):
            # Push progress to the splash; ignore if the window is mid-navigation.
            try:
                window.evaluate_js(f"window.setStatus && window.setStatus({json.dumps(msg)})")
            except Exception:
                pass

        try:
            bootstrap_ollama.ensure_ready(log=log)
        except Exception as e:
            # The app is fully usable without AI — only paste-to-parse needs it.
            log(f"AI parsing unavailable: {e}")
            time.sleep(4)

        wait_for_server(port)
        window.load_url(f"http://127.0.0.1:{port}/")

    # `setup` runs on a worker thread once the GUI loop is up; webview.start()
    # blocks on the main thread until the window is closed.
    webview.start(setup)


if __name__ == "__main__":
    main()
