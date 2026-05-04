"""Earnings calendar — yfinance `Ticker(symbol).calendar` per holding.

Surfaces:
  • A "Upcoming earnings" strip above the holdings table.
  • A small calendar icon next to tickers reporting in ≤14 days.

Source data: yfinance returns a dict shaped like
    {'Earnings Date': [date(2026, 6, 25)],
     'Earnings High': 21.05, 'Earnings Low': 7.53,
     'Earnings Average': 18.97,
     'Revenue High': 36_458_000_000, ...}
We normalize to a flat record + days_until. Past dates are dropped
(yfinance sometimes returns the most recent past report when no
forward date is published).

Cache: `earnings_cache` table in `prices.duckdb`, keyed by code, 24h
TTL. Single-writer rule per CLAUDE.md is preserved by reusing
`prices._db()` + `prices._DB_LOCK`.

Coverage gaps: HK/SG tickers often return Earnings Date with all
estimate fields = None. We surface them anyway but the UI hides
estimate sections for those rows.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta
from typing import Any

from api.data import prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)

_TTL = timedelta(hours=24)


@dataclass(frozen=True)
class Earnings:
    code: str
    ticker: str
    name: str
    date: str            # ISO date of next earnings, e.g. "2026-06-25"
    days_until: int
    eps_low: float | None
    eps_high: float | None
    eps_avg: float | None
    revenue_low: float | None
    revenue_high: float | None
    revenue_avg: float | None


def _to_yfinance_symbol(code: str) -> str | None:
    """Mirror api.digest._to_yfinance_symbol — kept duplicated here to
    avoid coupling earnings to the digest module's import surface.
    """
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


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS earnings_cache (
                code VARCHAR PRIMARY KEY,
                payload VARCHAR,
                fetched_at TIMESTAMP
            )
            """
        )


def _load_cached(code: str) -> dict | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT payload, fetched_at FROM earnings_cache WHERE code = ?",
            [code],
        ).fetchone()
    if not row:
        return None
    payload, fetched_at = row
    if datetime.now() - fetched_at > _TTL:
        return None
    if not payload:
        return {}
    return json.loads(payload)


def _save_cache(code: str, payload: dict) -> None:
    _ensure_table()
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO earnings_cache VALUES (?, ?, ?)",
            [code, json.dumps(payload), datetime.now()],
        )


# ── yfinance fetch ──────────────────────────────────────────────────────────


def _fetch_one(code: str) -> dict | None:
    """Cached calendar fetch, normalized to a serializable dict.

    Returns None if yfinance has no symbol for this code.
    Returns {} if yfinance has the symbol but no future earnings date.
    """
    cached = _load_cached(code)
    if cached is not None:
        return cached if cached else None

    symbol = _to_yfinance_symbol(code)
    if not symbol:
        _save_cache(code, {})
        return None

    try:
        import yfinance as yf

        cal: Any = yf.Ticker(symbol).calendar or {}
    except Exception as exc:
        log.warning("yfinance calendar fetch %s failed: %s", code, exc)
        _save_cache(code, {})
        return None

    dates = cal.get("Earnings Date") or []
    if not dates:
        _save_cache(code, {})
        return None

    # yfinance returns a list of dates, occasionally with the most
    # recent past report. Pick the first date that's today or later.
    today = date.today()
    next_date: date | None = None
    for d in dates:
        if isinstance(d, datetime):
            d = d.date()
        if isinstance(d, date) and d >= today:
            next_date = d
            break

    if next_date is None:
        _save_cache(code, {})
        return None

    payload = {
        "date": next_date.isoformat(),
        "eps_low": cal.get("Earnings Low"),
        "eps_high": cal.get("Earnings High"),
        "eps_avg": cal.get("Earnings Average"),
        "revenue_low": cal.get("Revenue Low"),
        "revenue_high": cal.get("Revenue High"),
        "revenue_avg": cal.get("Revenue Average"),
    }
    _save_cache(code, payload)
    return payload


# ── Public API ──────────────────────────────────────────────────────────────


def get_all() -> list[Earnings]:
    """Earnings rows for every current holding with a future report date.
    Sorted by ascending days_until.
    """
    summary = get_summary()
    today = date.today()
    out: list[Earnings] = []

    for p in summary.positions:
        payload = _fetch_one(p.code)
        if not payload:
            continue
        try:
            d = date.fromisoformat(payload["date"])
        except Exception:
            continue
        days_until = (d - today).days
        if days_until < 0:
            continue
        out.append(
            Earnings(
                code=p.code,
                ticker=p.ticker,
                name=p.name,
                date=payload["date"],
                days_until=days_until,
                eps_low=payload.get("eps_low"),
                eps_high=payload.get("eps_high"),
                eps_avg=payload.get("eps_avg"),
                revenue_low=payload.get("revenue_low"),
                revenue_high=payload.get("revenue_high"),
                revenue_avg=payload.get("revenue_avg"),
            )
        )

    out.sort(key=lambda e: e.days_until)
    return out


def to_dict(e: Earnings) -> dict:
    return asdict(e)
