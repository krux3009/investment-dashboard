"""Daily-bar history fetcher for the v3 API.

Same shape as dashboard.data.prices, but writes to a SEPARATE DuckDB
file (`data/prices_v3.duckdb`) so the v3 API can run alongside the
still-running v2 Dash app — DuckDB takes an exclusive lock on the
file at open time, and the two processes can't share.

When v2 retires (chunk 3 of Phase B), this module's _DB_PATH should
take over `prices.duckdb` outright and the v2 module gets deleted.
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

_DB_PATH = Path(__file__).resolve().parents[2] / "data" / "prices_v3.duckdb"
_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_DB: Any = None
_DB_LOCK = threading.Lock()
_QUOTE_CTX: Any = None
_UNFETCHABLE: set[str] = set()


def _db():
    """Shared connection. Callers must hold _DB_LOCK around any execute."""
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
    """Lazy module-level OpenQuoteContext. Independent of v2's; FastAPI
    runs in a separate process so each side has its own moomoo session.
    """
    global _QUOTE_CTX
    if _QUOTE_CTX is None:
        from moomoo import OpenQuoteContext

        _QUOTE_CTX = OpenQuoteContext(
            host=os.environ.get("MOOMOO_HOST", "127.0.0.1"),
            port=int(os.environ.get("MOOMOO_PORT", "11111")),
        )
    return _QUOTE_CTX


def _fetch_and_cache(code: str, start: date, end: date) -> int:
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
            log.warning("history_kline %s ret=%s", code, ret)
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
    """Cached + fresh daily bars covering the last `days` calendar days.

    Refetches if the cache is stale (>2 days old) or doesn't cover the
    requested historical window. Identical algorithm to v2's prices.py.
    """
    today = date.today()
    start = today - timedelta(days=days)

    with _DB_LOCK:
        res = _db().execute(
            "SELECT MIN(date), MAX(date) FROM daily_prices WHERE code = ?",
            [code],
        ).fetchone()
    earliest_cached: date | None = res[0] if res and res[0] else None
    last_cached: date | None = res[1] if res and res[1] else None

    stale_recent = last_cached is None or last_cached < (today - timedelta(days=2))
    needs_backfill = earliest_cached is not None and earliest_cached > start

    if (stale_recent or needs_backfill) and code not in _UNFETCHABLE:
        if last_cached is None:
            fetch_start, fetch_end = start, today
        elif stale_recent and needs_backfill:
            fetch_start, fetch_end = start, today
        elif stale_recent:
            fetch_start = max(last_cached + timedelta(days=1), start)
            fetch_end = today
        else:
            fetch_start = start
            fetch_end = earliest_cached - timedelta(days=1)
        _fetch_and_cache(code, fetch_start, fetch_end)

    with _DB_LOCK:
        df = _db().execute(
            "SELECT date, open, close, high, low, volume FROM daily_prices "
            "WHERE code = ? AND date >= ? ORDER BY date",
            [code, start],
        ).fetchdf()
    return df
