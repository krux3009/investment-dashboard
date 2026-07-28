"""Single shared DuckDB connection behind a lock.

Every module that touches `data/prices.duckdb` goes through these
helpers — the connection and its serializing lock never leave this
module. DuckDB connections are not thread-safe and FastAPI dispatches
sync endpoints across a thread pool; without serialization concurrent
statements raise opaque internal errors.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "prices.duckdb"

_conn: Any = None
_lock = threading.Lock()


def _connection():
    """Caller must hold _lock."""
    global _conn
    if _conn is None:
        _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = duckdb.connect(str(_DB_PATH))
    return _conn


def run(sql: str, params: list | None = None) -> None:
    """Execute a statement with no result (DDL / INSERT / DELETE)."""
    with _lock:
        _connection().execute(sql, params or [])


def execute(sql: str, params: list | None = None) -> list[tuple]:
    with _lock:
        return _connection().execute(sql, params or []).fetchall()


def execute_one(sql: str, params: list | None = None) -> tuple | None:
    with _lock:
        return _connection().execute(sql, params or []).fetchone()


def execute_df(sql: str, params: list | None = None) -> pd.DataFrame:
    with _lock:
        return _connection().execute(sql, params or []).fetchdf()


def executemany(sql: str, rows: list[tuple]) -> None:
    with _lock:
        _connection().executemany(sql, rows)
