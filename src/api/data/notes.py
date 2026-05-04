"""Per-ticker freeform notes.

Backed by a `notes` table in `prices.duckdb` so a server restart
doesn't drop the user's thesis sentences. Single writer (only the
FastAPI process), reuses prices._DB_LOCK.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from api.data import prices


@dataclass(frozen=True)
class Note:
    code: str
    body: str
    updated_at: datetime


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS notes (
                code VARCHAR PRIMARY KEY,
                body VARCHAR NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
            """
        )


def get_note(code: str) -> Note | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT body, updated_at FROM notes WHERE code = ?",
            [code],
        ).fetchone()
    if not row:
        return None
    body, updated_at = row
    return Note(code=code, body=body, updated_at=updated_at)


def put_note(code: str, body: str) -> Note:
    _ensure_table()
    now = datetime.now()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO notes VALUES (?, ?, ?)",
            [code, body, now],
        )
    return Note(code=code, body=body, updated_at=now)


def delete_note(code: str) -> bool:
    _ensure_table()
    with prices._DB_LOCK:
        before = prices._db().execute(
            "SELECT 1 FROM notes WHERE code = ?", [code]
        ).fetchone()
        if not before:
            return False
        prices._db().execute("DELETE FROM notes WHERE code = ?", [code])
    return True
