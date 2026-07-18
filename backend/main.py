from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
from openai import OpenAI
from bs4 import BeautifulSoup
import sqlite3
from datetime import datetime, date
from collections import deque
import os
import sys
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# When frozen into a desktop executable (PyInstaller), the code lives in a
# temporary, read-only extraction dir that is wiped on exit — so the database
# must live in a stable, per-user, writable location instead. In normal dev we
# keep the old path so the existing backend/jobs.db keeps working.
IS_FROZEN = getattr(sys, "frozen", False)

if IS_FROZEN:
    from platformdirs import user_data_dir

    DATA_DIR = user_data_dir("CareerTracker", appauthor=False)
    os.makedirs(DATA_DIR, exist_ok=True)
    DB_PATH = os.path.join(DATA_DIR, "jobs.db")
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "jobs.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT,
            company TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            salary TEXT,
            benefits TEXT,
            location TEXT,
            job_type TEXT,
            cover_letter TEXT,
            notes TEXT,
            status TEXT DEFAULT 'Application',
            tags TEXT,
            tag_dates TEXT,
            applied_date TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add columns for existing databases
    for col in ("ALTER TABLE applications ADD COLUMN tags TEXT",
                "ALTER TABLE applications ADD COLUMN tag_dates TEXT"):
        try:
            conn.execute(col)
        except Exception:
            pass
    # Migrate: populate tags from status for rows where tags is null
    conn.execute("UPDATE applications SET tags = json_array(status) WHERE tags IS NULL")
    # Migrate tag_dates: use created_at date for all existing tags
    rows = conn.execute(
        "SELECT id, tags, created_at FROM applications WHERE tag_dates IS NULL"
    ).fetchall()
    for row in rows:
        try:
            tags = json.loads(row['tags']) if row['tags'] else []
        except Exception:
            tags = []
        created_date = (row['created_at'] or date.today().isoformat())[:10]
        tag_dates = {tag: created_date for tag in tags}
        conn.execute(
            "UPDATE applications SET tag_dates = ? WHERE id = ?",
            (json.dumps(tag_dates), row['id']),
        )
    conn.commit()
    conn.close()


def row_to_dict(row):
    d = dict(row)
    raw_tags = d.get('tags')
    if raw_tags:
        try:
            d['tags'] = json.loads(raw_tags)
        except Exception:
            d['tags'] = [d.get('status', 'Application')]
    else:
        d['tags'] = [d.get('status', 'Application')]
    raw_td = d.get('tag_dates')
    if raw_td:
        try:
            d['tag_dates'] = json.loads(raw_td)
        except Exception:
            d['tag_dates'] = {}
    else:
        d['tag_dates'] = {}
    return d


init_db()


# ---------------------------------------------------------------------------
# Undo support
#
# Each mutating endpoint records the prior state of the rows it touches as a
# single "action" on this stack. An action is a list of (id, before) pairs
# where `before` is the full row dict, or None if the row did not exist yet
# (i.e. a create). Undoing an action means, for each pair: delete the row if
# `before` is None, otherwise write the full row back. This one primitive
# reverses creates, edits, deletes, and bulk edits uniformly.
#
# The stack lives in memory, so it covers real-time undo within a session and
# clears if the backend restarts.
# ---------------------------------------------------------------------------
UNDO_STACK = deque(maxlen=50)


def snapshot(conn, app_id):
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
    return dict(row) if row else None


def push_undo(label, snapshots):
    UNDO_STACK.append({"label": label, "snapshots": snapshots})


def restore_row(conn, app_id, before):
    if before is None:
        conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        return
    cols = list(before.keys())
    col_list = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    update_clause = ", ".join(f"{c} = excluded.{c}" for c in cols if c != "id")
    conn.execute(
        f"INSERT INTO applications ({col_list}) VALUES ({placeholders}) "
        f"ON CONFLICT(id) DO UPDATE SET {update_clause}",
        [before[c] for c in cols],
    )


class ParseTextRequest(BaseModel):
    text: str


class ApplicationCreate(BaseModel):
    url: Optional[str] = None
    company: str
    title: str
    description: Optional[str] = None
    salary: Optional[str] = None
    benefits: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    cover_letter: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = ["Application"]
    applied_date: Optional[str] = None


class ApplicationUpdate(BaseModel):
    url: Optional[str] = None
    company: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    salary: Optional[str] = None
    benefits: Optional[str] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    cover_letter: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    tag_dates: Optional[dict] = None
    applied_date: Optional[str] = None


BULK_ALLOWED_FIELDS = {"applied_date", "location", "salary", "job_type"}


class BulkUpdate(BaseModel):
    ids: List[int]
    field: str
    value: Optional[str] = None


def extract_job_info(text: str) -> dict:
    """Ask llama3.2 only for the short metadata fields. The description is the pasted
    text itself — there's no reason to make the model regenerate it, since that's the
    slowest part of local inference (output tokens). Benefits is short enough to be
    worth asking for verbatim."""
    client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    system_prompt = (
        "You are a precise job posting parser. Extract structured fields and return ONLY a valid JSON object. "
        "Never refuse, never explain — just return JSON."
    )
    user_prompt = (
        "Read the job posting below and return ONLY a JSON object with exactly these keys:\n\n"
        '- "company": hiring company name (string, or null if not stated)\n'
        '- "title": exact job title (string, or null)\n'
        '- "salary": salary range or compensation if mentioned (string, or null)\n'
        '- "location": city/state/country or "Remote" (string, or null)\n'
        '- "job_type": one of "Full-time", "Part-time", "Contract", "Remote", "Hybrid", or null\n'
        '- "benefits": a concise string listing ALL perks mentioned — health/dental/vision, 401k, '
        "PTO, equity, bonuses, parental leave, professional development, wellness, etc. "
        "Copy the relevant text verbatim. Use null if none mentioned.\n\n"
        f"Job posting:\n{text}\n\n"
        "Return ONLY the JSON. No markdown, no explanation."
    )
    last_error = None
    for attempt in range(2):
        try:
            response = client.chat.completions.create(
                model="llama3.2",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0 if attempt == 0 else 0.3,
                # Cap output — we only need ~6 short fields plus a benefits blurb
                max_tokens=600,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            return json.loads(raw.strip())
        except Exception as e:
            last_error = e
    raise last_error


def extract_text_from_input(content: str) -> str:
    """Handle both plain text and raw HTML (e.g. page source). For HTML, prioritizes
    JSON-LD structured data (common in Workday, Greenhouse, etc.) before falling back
    to visible page text."""
    stripped = content.lstrip()
    if stripped.startswith('<') or '<!DOCTYPE' in stripped[:200].upper():
        soup = BeautifulSoup(content, "html.parser")
        # Pull JSON-LD blocks first — most structured job data lives here
        json_ld_parts = [
            s.string for s in soup.find_all('script', type='application/ld+json') if s.string
        ]
        json_ld_text = '\n'.join(json_ld_parts)
        # Strip noise tags then get visible text
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        page_text = soup.get_text(separator="\n", strip=True)
        combined = f"{json_ld_text}\n\n{page_text}"
        return combined[:12000]
    return content[:12000]


@app.post("/api/parse-text")
async def parse_text(request: ParseTextRequest):
    try:
        content = request.text.strip()
        if not content:
            raise HTTPException(status_code=400, detail="No text provided.")
        text = extract_text_from_input(content)
        result = extract_job_info(text)
        # The pasted text IS the description — no need to spend output tokens
        # regenerating it. Strip JSON-LD noise if extract_text_from_input prepended it.
        result["description"] = text.strip()
        return result
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Could not parse job info from the pasted content.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/applications")
def list_applications():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM applications ORDER BY applied_date DESC, created_at DESC"
    ).fetchall()
    conn.close()
    return [row_to_dict(row) for row in rows]


@app.post("/api/applications")
def create_application(data: ApplicationCreate):
    conn = get_db()
    today = date.today().isoformat()
    tags_json = json.dumps(data.tags)
    tag_dates_json = json.dumps({tag: today for tag in data.tags})
    status = data.tags[0] if data.tags else "Application"
    cursor = conn.execute(
        """
        INSERT INTO applications
            (url, company, title, description, salary, benefits, location,
             job_type, cover_letter, notes, status, tags, tag_dates, applied_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.url, data.company, data.title, data.description,
            data.salary, data.benefits, data.location, data.job_type,
            data.cover_letter, data.notes, status, tags_json, tag_dates_json,
            data.applied_date or today,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (cursor.lastrowid,)).fetchone()
    conn.close()
    push_undo(f"Add {data.company}", [(cursor.lastrowid, None)])
    return row_to_dict(row)


@app.post("/api/applications/bulk-update")
def bulk_update(data: BulkUpdate):
    if data.field not in BULK_ALLOWED_FIELDS:
        raise HTTPException(status_code=400, detail="Field not allowed for bulk update")
    if not data.ids:
        return []
    conn = get_db()
    now = datetime.now().isoformat()
    snapshots = []
    for app_id in data.ids:
        before = snapshot(conn, app_id)
        if before is None:
            continue
        snapshots.append((app_id, before))
        conn.execute(
            f"UPDATE applications SET {data.field} = ?, updated_at = ? WHERE id = ?",
            (data.value, now, app_id),
        )
    conn.commit()
    if snapshots:
        push_undo(f"Bulk edit {data.field} ({len(snapshots)})", snapshots)
    placeholders = ", ".join("?" for _ in data.ids)
    rows = conn.execute(
        f"SELECT * FROM applications WHERE id IN ({placeholders})", data.ids
    ).fetchall()
    conn.close()
    return [row_to_dict(row) for row in rows]


@app.get("/api/undo/status")
def undo_status():
    if not UNDO_STACK:
        return {"can_undo": False, "label": None, "count": 0}
    return {"can_undo": True, "label": UNDO_STACK[-1]["label"], "count": len(UNDO_STACK)}


@app.post("/api/undo")
def undo():
    if not UNDO_STACK:
        raise HTTPException(status_code=404, detail="Nothing to undo")
    action = UNDO_STACK.pop()
    conn = get_db()
    for app_id, before in action["snapshots"]:
        restore_row(conn, app_id, before)
    conn.commit()
    conn.close()
    return {"ok": True, "label": action["label"], "remaining": len(UNDO_STACK)}


@app.get("/api/applications/{app_id}")
def get_application(app_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row_to_dict(row)


@app.put("/api/applications/{app_id}")
def update_application(app_id: int, data: ApplicationUpdate):
    conn = get_db()
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Not found")

    before = dict(row)
    updates = {k: v for k, v in data.dict(exclude_unset=True).items()}
    # Pull out incoming tag_dates before building SET clause
    incoming_td = updates.pop('tag_dates', None)
    # Serialize tags to JSON, sync status, and record dates for new tags
    if 'tags' in updates:
        tags = updates['tags']
        updates['tags'] = json.dumps(tags)
        updates['status'] = tags[0] if tags else 'Application'
        existing_td = {}
        try:
            existing_td = json.loads(row['tag_dates']) if row['tag_dates'] else {}
        except Exception:
            pass
        today_str = date.today().isoformat()
        if incoming_td is not None:
            # Use frontend-provided dates; fall back to existing then today for any gaps
            merged = {}
            for tag in tags:
                if tag in incoming_td and incoming_td[tag]:
                    merged[tag] = incoming_td[tag]
                elif tag in existing_td:
                    merged[tag] = existing_td[tag]
                else:
                    merged[tag] = today_str
            updates['tag_dates'] = json.dumps(merged)
        else:
            # Auto-assign today only for newly added tags
            for tag in tags:
                if tag not in existing_td:
                    existing_td[tag] = today_str
            updates['tag_dates'] = json.dumps(existing_td)
    updates["updated_at"] = datetime.now().isoformat()

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [app_id]
    conn.execute(f"UPDATE applications SET {set_clause} WHERE id = ?", values)
    conn.commit()
    row = conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,)).fetchone()
    conn.close()
    push_undo(f"Edit {before.get('company', '')}", [(app_id, before)])
    return row_to_dict(row)


@app.delete("/api/applications/{app_id}")
def delete_application(app_id: int):
    conn = get_db()
    before = snapshot(conn, app_id)
    conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
    conn.commit()
    conn.close()
    if before is not None:
        push_undo(f"Delete {before.get('company', '')}", [(app_id, before)])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Serve the built React frontend.
#
# In the packaged desktop app the same server delivers both the API and the UI,
# so the browser loads everything from one origin (no CORS, no separate Vite
# server). This mount must be registered LAST: it catches "/" and every unknown
# path, so any route declared after it would be shadowed. The /api/* routes
# above are matched first because they were registered first.
#
# `html=True` makes StaticFiles serve index.html for "/" so the SPA loads.
# ---------------------------------------------------------------------------
if IS_FROZEN:
    _dist_dir = os.path.join(sys._MEIPASS, "frontend_dist")
else:
    _dist_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(_dist_dir):
    app.mount("/", StaticFiles(directory=_dist_dir, html=True), name="spa")
