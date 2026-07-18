# Career Tracker

A local web app for tracking job applications — paste a URL, auto-parse the job details with a local LLM, track your pipeline, and visualize your progress.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Backend**: Python FastAPI + SQLite
- **Parsing**: Llama 3.2 (via Ollama, runs fully locally)

---

## Setup

### 1. Ollama

Download and install Ollama from [ollama.com](https://ollama.com). Once installed, `llama3.2` will be pulled automatically on first launch.

### 2. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Frontend

```bash
cd frontend
npm install
```

---

## Running

```bash
./start.sh
```

This will:
- Start Ollama and pull `llama3.2` if not already downloaded
- Kill any existing processes on ports 8000 and 5173
- Start the backend and frontend in new Terminal windows
- Open the app at [http://localhost:5173](http://localhost:5173)

---

## Usage

1. Click **Add Application**
2. Paste a job posting URL and click **Parse Job** — fields auto-fill via Llama 3.2
3. Review/edit any field, add your cover letter and notes
4. Click **Add Application** to save — date defaults to today
5. Update status as you progress through the interview pipeline
6. Switch to **Analytics** to see your pipeline breakdown and trends

## Application Statuses

| Status | Color |
|---|---|
| Application | Blue |
| Phone Screen | Purple |
| Hiring Manager | Indigo |
| Technical | Cyan |
| Presentation | Amber |
| Panel | Orange |
| Final | Pink |
| Offer | Emerald |
| Rejected | Gray |
| Withdrew | Slate |
| Position Filled | Red |

## Data Storage

Job data is stored in `backend/jobs.db` (SQLite). This file is in `.gitignore` by default.
To back up your application history in git, remove the `backend/jobs.db` line from `.gitignore` and commit the file.

---

## Desktop app (standalone executable)

For non-technical users, the whole app can be packaged as a single double-click
executable — no terminal, Python, or npm required. It bundles the FastAPI backend
and the built React UI into one window (via [pywebview](https://pywebview.flowrl.com/)),
and on first launch it installs Ollama and pulls `llama3.2` automatically. When
packaged, the database lives in a per-user folder (`%LOCALAPPDATA%\CareerTracker\`
on Windows, `~/Library/Application Support/CareerTracker/` on macOS), not in the repo.

### Build it locally

PyInstaller does **not** cross-compile — build the Windows `.exe` on Windows and the
macOS `.app` on a Mac.

```bash
# 1. Build the frontend
cd frontend && npm run build && cd ..

# 2. From the backend venv, install packaging deps and build
pip install -r backend/requirements.txt pyinstaller
pyinstaller build/career_tracker.spec --noconfirm
```

The result is `dist/CareerTracker.exe` (Windows) or `dist/CareerTracker.app` (macOS).

### Build both from CI

Push a version tag (or run the workflow manually) and GitHub Actions builds both
platforms and uploads them as artifacts — see `.github/workflows/build-desktop.yml`:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

### Handing it to friends

The builds are unsigned, so the OS will warn on first launch:

- **Windows** — SmartScreen shows "Windows protected your PC": click **More info → Run anyway**.
- **macOS** — Gatekeeper blocks it: **right-click → Open**, then confirm.

The **first launch is slow** — it downloads Ollama plus the ~2 GB `llama3.2` model
(one time, needs ~8 GB RAM). A splash screen shows progress. Later launches are fast.
Optional later hardening: code-signing (Windows) and Apple notarization ($99/yr) to
remove the warnings entirely.
