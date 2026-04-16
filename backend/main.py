from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import anthropic
import httpx
from bs4 import BeautifulSoup
import sqlite3
from datetime import datetime, date
import os
from dotenv import load_dotenv
import json

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


class ParseURLRequest(BaseModel):
    url: str


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
    applied_date: Optional[str] = None


def extract_job_info(text: str) -> dict:
    anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    message = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": (
                "Extract job posting information and return ONLY a valid JSON object with these keys:\n"
                '- "company": company name (string)\n'
                '- "title": job title (string)\n'
                '- "description": full job description text (string)\n'
                '- "salary": salary/compensation info (string or null)\n'
                '- "benefits": benefits summary (string or null)\n'
                '- "location": job location (string or null)\n'
                '- "job_type": one of "Full-time", "Part-time", "Contract", "Remote", "Hybrid" or null\n\n'
                f"Job posting:\n{text}\n\n"
                "Return ONLY the JSON object, no markdown, no explanation."
            ),
        }],
    )
    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


@app.post("/api/parse-url")
async def parse_url(request: ParseURLRequest):
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            response = await client.get(request.url, headers=headers)
            html = response.text

        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)[:8000]

        result = extract_job_info(text)
        return result

    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Could not parse job info from page. Try filling in the fields manually.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
        return combined[:8000]
    return content[:8000]


@app.post("/api/parse-text")
async def parse_text(request: ParseTextRequest):
    try:
        content = request.text.strip()
        if not content:
            raise HTTPException(status_code=400, detail="No text provided.")
        text = extract_text_from_input(content)
        result = extract_job_info(text)
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
    return row_to_dict(row)


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

    updates = {k: v for k, v in data.dict(exclude_unset=True).items()}
    # Serialize tags to JSON, sync status, and record dates for new tags
    if 'tags' in updates:
        tags = updates['tags']
        updates['tags'] = json.dumps(tags)
        updates['status'] = tags[0] if tags else 'Application'
        # Merge new tag dates without overwriting existing ones
        existing_td = {}
        try:
            existing_td = json.loads(row['tag_dates']) if row['tag_dates'] else {}
        except Exception:
            pass
        today_str = date.today().isoformat()
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
    return row_to_dict(row)


@app.delete("/api/applications/{app_id}")
def delete_application(app_id: int):
    conn = get_db()
    conn.execute("DELETE FROM applications WHERE id = ?", (app_id,))
    conn.commit()
    conn.close()
    return {"ok": True}
