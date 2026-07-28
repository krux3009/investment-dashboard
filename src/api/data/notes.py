"""Per-ticker freeform notes.

Backed by a `notes` table in `prices.duckdb` so a server restart
doesn't drop the user's thesis sentences. All access goes through
`api.data.db` (single locked connection).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from api.data import db


@dataclass(frozen=True)
class Note:
    code: str
    body: str
    updated_at: datetime


def _ensure_table() -> None:
    db.run(
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
    row = db.execute_one(
        "SELECT body, updated_at FROM notes WHERE code = ?",
        [code],
    )
    if not row:
        return None
    body, updated_at = row
    return Note(code=code, body=body, updated_at=updated_at)


def put_note(code: str, body: str) -> Note:
    _ensure_table()
    now = datetime.now()
    db.run(
        "INSERT OR REPLACE INTO notes VALUES (?, ?, ?)",
        [code, body, now],
    )
    return Note(code=code, body=body, updated_at=now)


def delete_note(code: str) -> bool:
    _ensure_table()
    before = db.execute_one("SELECT 1 FROM notes WHERE code = ?", [code])
    if not before:
        return False
    db.run("DELETE FROM notes WHERE code = ?", [code])
    return True
