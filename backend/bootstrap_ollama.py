"""First-run setup for the local AI model.

The desktop app parses job postings with a local Ollama model (llama3.2). Non-
technical users shouldn't have to install anything by hand, so on first launch
this module will, as needed:

  1. install Ollama (download + run the official installer for the OS),
  2. start the Ollama background service,
  3. pull the llama3.2 model (~2 GB, one-time).

Every step reports human-readable progress through a `log(message)` callback so
the launcher can show it on a splash screen. All of this is best-effort: if
setup fails (offline, no disk, etc.) the app still runs — only the paste-to-parse
feature is unavailable, and the error is surfaced to the caller.

Only the Python standard library is used here so it bundles cleanly with
PyInstaller and needs no extra wheels.
"""

import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error
import zipfile

OLLAMA_HOST = "http://localhost:11434"
MODEL = "llama3.2"

# Official installer downloads (see https://ollama.com/download).
_WIN_INSTALLER_URL = "https://ollama.com/download/OllamaSetup.exe"
_MAC_ZIP_URL = "https://ollama.com/download/Ollama-darwin.zip"


class OllamaSetupError(Exception):
    """Raised when the AI model could not be made ready."""


def _noop(_msg):
    pass


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------
def is_server_up(timeout=1.5):
    """True if the Ollama HTTP API is reachable."""
    try:
        with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=timeout):
            return True
    except Exception:
        return False


def _candidate_binaries():
    """Known locations for the ollama executable, in priority order."""
    yield shutil.which("ollama")
    system = platform.system()
    if system == "Windows":
        local = os.environ.get("LOCALAPPDATA", "")
        if local:
            yield os.path.join(local, "Programs", "Ollama", "ollama.exe")
    elif system == "Darwin":
        yield "/Applications/Ollama.app/Contents/Resources/ollama"
        yield os.path.expanduser("~/Applications/Ollama.app/Contents/Resources/ollama")
        yield "/usr/local/bin/ollama"
        yield "/opt/homebrew/bin/ollama"


def find_ollama_binary():
    """Return a path to the ollama executable, or None if not installed."""
    for path in _candidate_binaries():
        if path and os.path.isfile(path):
            return path
    return None


def model_present(name=MODEL, timeout=5):
    """True if `name` (any tag) is already pulled."""
    try:
        with urllib.request.urlopen(f"{OLLAMA_HOST}/api/tags", timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return False
    for m in data.get("models", []):
        model_name = m.get("name", "")
        if model_name == name or model_name.startswith(f"{name}:"):
            return True
    return False


# ---------------------------------------------------------------------------
# Download helper
# ---------------------------------------------------------------------------
def _download(url, dest, log):
    """Download `url` to `dest`, logging percentage progress."""
    log(f"Downloading {os.path.basename(dest)}…")
    last_pct = -1

    def _hook(block_num, block_size, total_size):
        nonlocal last_pct
        if total_size <= 0:
            return
        pct = min(100, int(block_num * block_size * 100 / total_size))
        if pct != last_pct and pct % 5 == 0:
            last_pct = pct
            mb = total_size / (1024 * 1024)
            log(f"Downloading Ollama… {pct}%  ({mb:.0f} MB)")

    urllib.request.urlretrieve(url, dest, _hook)


# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
def install_ollama(log=_noop):
    """Download and install Ollama for the current OS. Returns the binary path."""
    system = platform.system()
    if system == "Windows":
        return _install_windows(log)
    if system == "Darwin":
        return _install_macos(log)
    raise OllamaSetupError(
        f"Automatic Ollama install isn't supported on {system}. "
        "Please install it from https://ollama.com and relaunch."
    )


def _install_windows(log):
    tmp = os.path.join(tempfile.gettempdir(), "OllamaSetup.exe")
    _download(_WIN_INSTALLER_URL, tmp, log)
    log("Installing Ollama… (this can take a minute)")
    # Inno Setup silent flags: no wizard, no prompts, no reboot.
    subprocess.run(
        [tmp, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"],
        check=True,
    )
    binary = find_ollama_binary()
    if not binary:
        raise OllamaSetupError("Ollama installer finished but the binary wasn't found.")
    return binary


def _install_macos(log):
    tmp_zip = os.path.join(tempfile.gettempdir(), "Ollama-darwin.zip")
    _download(_MAC_ZIP_URL, tmp_zip, log)
    log("Installing Ollama…")
    # Prefer /Applications; fall back to the user's Applications if not writable.
    dest_dir = "/Applications"
    if not os.access(dest_dir, os.W_OK):
        dest_dir = os.path.expanduser("~/Applications")
        os.makedirs(dest_dir, exist_ok=True)
    with zipfile.ZipFile(tmp_zip) as zf:
        zf.extractall(dest_dir)
    # Restore the executable bit stripped by zipextract.
    binary = os.path.join(dest_dir, "Ollama.app", "Contents", "Resources", "ollama")
    if os.path.isfile(binary):
        os.chmod(binary, 0o755)
    binary = find_ollama_binary()
    if not binary:
        raise OllamaSetupError("Ollama was downloaded but the binary wasn't found.")
    return binary


# ---------------------------------------------------------------------------
# Serve
# ---------------------------------------------------------------------------
def _no_window_kwargs():
    """Keep the spawned server headless (no flashing console on Windows)."""
    if platform.system() == "Windows":
        return {"creationflags": 0x08000000}  # CREATE_NO_WINDOW
    return {}


def start_server(binary, log=_noop, wait_seconds=30):
    """Launch `ollama serve` in the background and wait until the API responds."""
    if is_server_up():
        return
    log("Starting the AI service…")
    subprocess.Popen(
        [binary, "serve"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **_no_window_kwargs(),
    )
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        if is_server_up():
            return
        time.sleep(0.5)
    raise OllamaSetupError("The AI service didn't start in time.")


# ---------------------------------------------------------------------------
# Pull model
# ---------------------------------------------------------------------------
def pull_model(name=MODEL, log=_noop):
    """Pull `name` via the streaming HTTP API, logging download progress."""
    log(f"Downloading the AI model ({name})… this is a one-time ~2 GB download.")
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/pull",
        data=json.dumps({"name": name, "stream": True}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    last_pct = -1
    with urllib.request.urlopen(req) as resp:
        for raw_line in resp:
            line = raw_line.decode("utf-8").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("error"):
                raise OllamaSetupError(msg["error"])
            total = msg.get("total")
            completed = msg.get("completed")
            if total and completed:
                pct = int(completed * 100 / total)
                if pct != last_pct and pct % 2 == 0:
                    last_pct = pct
                    gb = total / (1024 ** 3)
                    log(f"Downloading AI model… {pct}%  ({gb:.1f} GB)")
    if not model_present(name):
        raise OllamaSetupError("Model download finished but the model isn't available.")


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def ensure_ready(log=_noop):
    """Make the local AI model ready to use, installing/pulling as needed.

    Raises OllamaSetupError on failure. Safe to call on every launch — it's a
    fast no-op once everything is in place.
    """
    binary = find_ollama_binary()
    if not binary:
        log("Setting up the AI engine for the first time…")
        binary = install_ollama(log)

    start_server(binary, log)

    if not model_present():
        pull_model(log=log)

    log("AI is ready.")


if __name__ == "__main__":
    # Manual test: python bootstrap_ollama.py
    ensure_ready(lambda m: print(m, file=sys.stderr))
