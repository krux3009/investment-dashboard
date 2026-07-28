"""JSON key-value cache tables in the shared DuckDB file.

One table per cache surface, uniform shape:
`(key VARCHAR PRIMARY KEY, payload_json VARCHAR, fetched_at TIMESTAMP)`.
TTL checks, table creation, and serialization all live here — callers
hold only a table name, a key, and a TTL.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from api.data import db

_created: set[str] = set()


def _ensure(table: str) -> None:
    if table not in _created:
        db.run(
            f"CREATE TABLE IF NOT EXISTS {table} "
            "(key VARCHAR PRIMARY KEY, payload_json VARCHAR, fetched_at TIMESTAMP)"
        )
        _created.add(table)


def get(
    table: str, key: str, ttl: timedelta | None = None
) -> tuple[Any, datetime] | None:
    """Return (payload, fetched_at) or None on miss / expiry."""
    _ensure(table)
    row = db.execute_one(
        f"SELECT payload_json, fetched_at FROM {table} WHERE key = ?", [key]
    )
    if not row:
        return None
    payload_json, fetched_at = row
    if ttl is not None and datetime.now() - fetched_at > ttl:
        return None
    return json.loads(payload_json), fetched_at


def put(table: str, key: str, payload: Any) -> datetime:
    """Store payload as JSON; returns the fetched_at timestamp written."""
    _ensure(table)
    now = datetime.now()
    db.run(
        f"INSERT OR REPLACE INTO {table} (key, payload_json, fetched_at) "
        "VALUES (?, ?, ?)",
        [key, json.dumps(payload, ensure_ascii=False), now],
    )
    return now


def clear(table: str, key: str | None = None) -> None:
    _ensure(table)
    if key is None:
        db.run(f"DELETE FROM {table}")
    else:
        db.run(f"DELETE FROM {table} WHERE key = ?", [key])
