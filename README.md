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
