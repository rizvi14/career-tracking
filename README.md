# Career Tracker

A local web app for tracking job applications — paste a URL, auto-parse the job details with Claude, track your pipeline, and visualize your progress.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + Recharts
- **Backend**: Python FastAPI + SQLite
- **Parsing**: Claude Haiku (via Anthropic API)

---

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

Copy `.env.example` to `.env` and add your Anthropic API key:

```bash
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

Start the backend:

```bash
uvicorn main:app --reload
# Runs at http://localhost:8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Usage

1. Click **Add Application**
2. Paste a job posting URL and click **Parse Job** — fields auto-fill via Claude
3. Review/edit any field, add your cover letter and notes
4. Click **Add Application** to save — date defaults to today
5. Update status inline from the table as you progress
6. Switch to **Analytics** to see your pipeline breakdown and trends

## Application Statuses

| Status | Color |
|---|---|
| Application | Blue |
| Phone Screen | Purple |
| Hiring Manager | Indigo |
| Presentation | Amber |
| Panel | Orange |
| Final | Pink |
| Offer | Emerald |
| Rejected | Gray |
| Withdrew | Slate |

## Data Storage

Job data is stored in `backend/jobs.db` (SQLite). This file is in `.gitignore` by default.
If you want to back up your application history in git, remove the `backend/jobs.db` line from `.gitignore` and commit the file.
