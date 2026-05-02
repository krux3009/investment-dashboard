"""Daily-bar price-history fetcher backed by a DuckDB on-disk cache.

Wraps moomoo's `OpenQuoteContext.request_history_kline`. On every query
the cache is consulted first; if the most-recent cached row is more than
two calendar days old (handles weekend slack), only the missing window
is refetched from moomoo and merged in via INSERT OR REPLACE.

Powers the holdings sparkline column today, and the future drill-in
candlestick + watchlist view (Phase 4 staging in v2 backlog).

Cache location: `data/prices.duckdb` at the repo root, gitignored. The
file persists across dashboard restarts so Dash dev-mode reloads don't
re-pay the moomoo API cost.
"""

from __future__ import annotations

import logging
import os
import threading
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

log = logging.getLogger(__name__)

_DB_PATH = Path(__file__).resolve().parents[3] / "data" / "prices.duckdb"
_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_DB: Any = None
_DB_LOCK = threading.Lock()
_QUOTE_CTX: Any = None
# Codes moomoo returns "Unknown stock" for (e.g. SG market without
# subscription). Cached for the session so we stop hammering on every
# 30s poll. Cleared on process restart, which gives the operator a
# chance to re-verify after fixing access.
_UNFETCHABLE: set[str] = set()


def _db():
    """A single shared DuckDB connection. Callers MUST hold _DB_LOCK around
    any execute()/fetchone()/etc. — DuckDB connections are not thread-safe,
    and Flask under Dash dispatches callbacks across multiple threads.
    Without serialization, concurrent SELECTs raise opaque internal errors
    like "Attempted to access index 0 within vector of size 0".
    """
    global _DB
    if _DB is None:
        _DB = duckdb.connect(str(_DB_PATH))
        _DB.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_prices (
                code VARCHAR NOT NULL,
                date DATE NOT NULL,
                open DOUBLE,
                close DOUBLE,
                high DOUBLE,
                low DOUBLE,
                volume BIGINT,
                PRIMARY KEY (code, date)
            )
            """
        )
    return _DB


def _quote_ctx():
    """Reuse the same OpenQuoteContext that anomalies.py opens, if available;
    otherwise open our own. moomoo's connection model lets us share a single
    session across the whole dashboard, so we do.
    """
    from dashboard.data import anomalies

    return anomalies._quote_ctx()  # noqa: SLF001 — deliberate reuse


def _fetch_and_cache(code: str, start: date, end: date) -> int:
    """Pull moomoo bars for [start, end] (inclusive) and merge into the cache.
    Returns the number of rows fetched (0 on any failure).
    """
    from moomoo import AuType, KLType

    try:
        ret, data, _ = _quote_ctx().request_history_kline(
            code,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            ktype=KLType.K_DAY,
            autype=AuType.QFQ,
            max_count=400,
        )
    except Exception as exc:
        log.warning("history_kline %s [%s..%s] exception: %s", code, start, end, exc)
        return 0

    if ret != 0 or data is None or len(data) == 0:
        if ret != 0:
            log.warning("history_kline %s ret=%s data=%s", code, ret, data)
            _UNFETCHABLE.add(code)
        return 0

    rows: list[tuple] = []
    for _, r in data.iterrows():
        rows.append(
            (
                code,
                pd.to_datetime(r["time_key"]).date(),
                float(r.get("open") or 0),
                float(r.get("close") or 0),
                float(r.get("high") or 0),
                float(r.get("low") or 0),
                int(r.get("volume") or 0),
            )
        )
    with _DB_LOCK:
        _db().executemany(
            "INSERT OR REPLACE INTO daily_prices VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
    return len(rows)


def get_history(code: str, days: int = 30) -> pd.DataFrame:
    """Return cached + fresh daily bars covering the last `days` calendar days.

    Refetches from moomoo only if the cache is stale (last cached row >2
    calendar days old, which absorbs weekend lag). A first-ever fetch for
    a ticker pulls the full window in one round-trip.
    """
    today = date.today()
    start = today - timedelta(days=days)

    with _DB_LOCK:
        res = _db().execute(
            "SELECT MAX(date) FROM daily_prices WHERE code = ?",
            [code],
        ).fetchone()
    last_cached: date | None = res[0] if res else None

    needs_refetch = last_cached is None or last_cached < (today - timedelta(days=2))
    if needs_refetch and code not in _UNFETCHABLE:
        fetch_start = (last_cached + timedelta(days=1)) if last_cached else start
        # Always cap fetch_start to no earlier than the requested window —
        # avoids re-pulling years of history when a long-cached ticker just
        # missed a few days.
        fetch_start = max(fetch_start, start)
        _fetch_and_cache(code, fetch_start, today)

    with _DB_LOCK:
        df = _db().execute(
            "SELECT date, open, close, high, low, volume FROM daily_prices "
            "WHERE code = ? AND date >= ? ORDER BY date",
            [code, start],
        ).fetchdf()
    return df


def get_close_series(code: str, days: int = 30) -> list[float]:
    """Convenience for sparkline rendering: chronological list of close prices.
    Returns an empty list when the cache + fetch both produce no data.
    """
    df = get_history(code, days=days)
    if df.empty:
        return []
    return df["close"].astype(float).tolist()
