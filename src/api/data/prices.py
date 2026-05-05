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
    from api.data import anomalies

    return anomalies._quote_ctx()  # noqa: SLF001 — deliberate reuse


def _to_yfinance_symbol(code: str) -> str | None:
    """Convert moomoo's `MARKET.TICKER` to yfinance's symbol."""
    if "." not in code:
        return code
    market, ticker = code.split(".", 1)
    market = market.upper()
    if market == "US":
        return ticker
    if market == "HK":
        return f"{ticker.zfill(4)}.HK"
    if market == "SG":
        return f"{ticker}.SI"
    if market == "JP":
        return f"{ticker}.T"
    if market == "CN":
        if ticker.startswith("6"):
            return f"{ticker}.SS"
        return f"{ticker}.SZ"
    return None


def _fetch_yfinance_rows(code: str, start: date, end: date) -> list[tuple]:
    """yfinance fallback for markets moomoo OpenD can't serve (SG without
    subscription, etc.). Returns rows in the same shape as moomoo's path
    so the caller's INSERT statement is identical.
    """
    symbol = _to_yfinance_symbol(code)
    if not symbol:
        return []
    try:
        import yfinance as yf

        # yfinance's `end` is exclusive; bump by one day so the last bar
        # is included.
        df = yf.Ticker(symbol).history(
            start=start.strftime("%Y-%m-%d"),
            end=(end + timedelta(days=1)).strftime("%Y-%m-%d"),
            auto_adjust=True,
            actions=False,
        )
    except Exception as exc:
        log.warning("yfinance history %s (%s) exception: %s", code, symbol, exc)
        return []
    if df is None or df.empty:
        return []

    rows: list[tuple] = []
    for ts, r in df.iterrows():
        try:
            d = ts.date()
        except AttributeError:
            d = pd.to_datetime(ts).date()
        rows.append(
            (
                code,
                d,
                float(r.get("Open") or 0),
                float(r.get("Close") or 0),
                float(r.get("High") or 0),
                float(r.get("Low") or 0),
                int(r.get("Volume") or 0),
            )
        )
    return rows


def _fetch_moomoo_rows(code: str, start: date, end: date) -> list[tuple] | None:
    """Pull moomoo bars for [start, end]. Returns None on RPC error /
    empty result (caller decides whether to try yfinance). Returns []
    on a real-but-empty response.
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
        return None

    if ret != 0:
        log.warning("history_kline %s ret=%s data=%s", code, ret, data)
        return None
    if data is None or len(data) == 0:
        return []

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
    return rows


def _fetch_and_cache(code: str, start: date, end: date) -> int:
    """Pull bars for [start, end] (inclusive) and merge into the cache.
    Tries moomoo first; falls back to yfinance for codes moomoo's OpenD
    can't serve (e.g. SG market without a paid subscription). Returns
    the number of rows merged.
    """
    rows = _fetch_moomoo_rows(code, start, end)
    if not rows:
        rows = _fetch_yfinance_rows(code, start, end)
    if not rows:
        # Both sources empty: mark as unfetchable so we stop hammering on
        # every poll. Cleared on process restart.
        _UNFETCHABLE.add(code)
        return 0

    with _DB_LOCK:
        _db().executemany(
            "INSERT OR REPLACE INTO daily_prices VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
    # If yfinance rescued a previously-blacklisted code, lift the block.
    _UNFETCHABLE.discard(code)
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
            "SELECT MIN(date), MAX(date) FROM daily_prices WHERE code = ?",
            [code],
        ).fetchone()
    earliest_cached: date | None = res[0] if res and res[0] else None
    last_cached: date | None = res[1] if res and res[1] else None

    # Two reasons to fetch: (a) the cache is stale for "today" (last cached
    # row > 2 calendar days old, absorbs weekend slack), or (b) the cache
    # doesn't cover the requested historical window (earliest cached row is
    # newer than `start`). The drill-in's 90-day window will trigger (b) if
    # the sparkline previously cached only 30 days for the same ticker.
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
        else:  # needs_backfill only
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


def get_close_series(code: str, days: int = 30) -> list[float]:
    """Convenience for sparkline rendering: chronological list of close prices.
    Returns an empty list when the cache + fetch both produce no data.
    """
    df = get_history(code, days=days)
    if df.empty:
        return []
    return df["close"].astype(float).tolist()
