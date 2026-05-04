"""Portfolio vs benchmark performance series.

Pulls daily closes for one or more benchmark symbols (SPY by default,
env-overridable via MOOMOO_BENCHMARKS) and projects the current
portfolio's weights backward over the same window. Both series are
expressed as percentage change from the first day, so FX drift in the
window doesn't enter the math.

Caveat baked into the response: the portfolio path uses current
weights — historical reweighting would need position-history
persistence the dashboard doesn't have.

Cache: `benchmark_prices(symbol, trade_date, close)` in prices.duckdb,
single-writer through prices._DB_LOCK. Refetches when the last cached
row for a symbol is more than 1 calendar day stale.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from api.data import prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class SeriesPoint:
    trade_date: str   # ISO date
    pct: float        # cumulative percentage change from window start


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS benchmark_prices (
                symbol VARCHAR NOT NULL,
                trade_date DATE NOT NULL,
                close DOUBLE,
                fetched_at TIMESTAMP,
                PRIMARY KEY (symbol, trade_date)
            )
            """
        )


def _last_cached(symbol: str) -> tuple[date | None, date | None]:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT MIN(trade_date), MAX(trade_date) FROM benchmark_prices WHERE symbol = ?",
            [symbol],
        ).fetchone()
    earliest = row[0] if row and row[0] else None
    latest = row[1] if row and row[1] else None
    return earliest, latest


def _fetch_yfinance(symbol: str, start: date, end: date) -> int:
    try:
        import yfinance as yf

        df = yf.Ticker(symbol).history(
            start=start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
            auto_adjust=False,
        )
    except Exception as exc:
        log.warning("yfinance benchmark fetch %s failed: %s", symbol, exc)
        return 0
    if df is None or df.empty:
        return 0

    rows: list[tuple] = []
    now = datetime.now()
    for ts, r in df.iterrows():
        d = ts.date() if hasattr(ts, "date") else ts
        close = float(r["Close"]) if r.get("Close") is not None else None
        if close is None:
            continue
        rows.append((symbol, d, close, now))

    with prices._DB_LOCK:
        prices._db().executemany(
            "INSERT OR REPLACE INTO benchmark_prices VALUES (?, ?, ?, ?)",
            rows,
        )
    return len(rows)


def _read_window(symbol: str, start: date) -> list[tuple[date, float]]:
    _ensure_table()
    with prices._DB_LOCK:
        rows = prices._db().execute(
            "SELECT trade_date, close FROM benchmark_prices "
            "WHERE symbol = ? AND trade_date >= ? ORDER BY trade_date",
            [symbol, start],
        ).fetchall()
    return [(r[0], float(r[1])) for r in rows]


def get_series(symbol: str, days: int) -> list[SeriesPoint]:
    today = date.today()
    start = today - timedelta(days=days)
    earliest, latest = _last_cached(symbol)

    needs_backfill = earliest is None or earliest > start
    stale_recent = latest is None or latest < (today - timedelta(days=1))

    if needs_backfill and (latest is None or earliest is None):
        _fetch_yfinance(symbol, start, today)
    elif needs_backfill and stale_recent:
        _fetch_yfinance(symbol, start, today)
    elif needs_backfill:
        _fetch_yfinance(symbol, start, earliest - timedelta(days=1))
    elif stale_recent:
        _fetch_yfinance(symbol, latest + timedelta(days=1), today)

    rows = _read_window(symbol, start)
    if not rows:
        return []

    base = rows[0][1]
    if base == 0:
        return []
    return [
        SeriesPoint(trade_date=d.isoformat(), pct=(c - base) / base)
        for d, c in rows
    ]


def _holding_close_series(code: str, start: date) -> dict[date, float]:
    """Read cached daily closes for a held ticker over [start, today].

    Held tickers are already polled by the dashboard, so prices.daily_prices
    has them. Returns a date → close map for downstream alignment.
    """
    today = date.today()
    days = (today - start).days + 1
    prices.get_history(code, days=days)
    with prices._DB_LOCK:
        rows = prices._db().execute(
            "SELECT date, close FROM daily_prices "
            "WHERE code = ? AND date >= ? ORDER BY date",
            [code, start],
        ).fetchall()
    return {r[0]: float(r[1]) for r in rows if r[1] is not None}


def compute_portfolio_series(days: int, calendar: list[str]) -> list[SeriesPoint]:
    """Current-weights-projected-backward portfolio path.

    For each holding h with USD weight w_h:
        pct_h(d) = (close_h(d) - close_h(d0)) / close_h(d0)
        portfolio_pct(d) = sum_h(w_h * pct_h(d))

    Closes are forward-filled to the benchmark calendar so HK/SG holdings
    align with US trading days.
    """
    summary = get_summary()
    if not summary.positions:
        return []

    today = date.today()
    start = today - timedelta(days=days)

    closes_by_code: dict[str, dict[date, float]] = {}
    for p in summary.positions:
        closes_by_code[p.code] = _holding_close_series(p.code, start)

    # USD weights from current holdings (computed via fx like routes/holdings).
    from api import fx
    weights: dict[str, float] = {}
    total_usd = 0.0
    for p in summary.positions:
        mv_usd, _ = fx.convert(p.market_value, p.currency, "USD")
        weights[p.code] = mv_usd
        total_usd += mv_usd
    if total_usd <= 0:
        return []
    for code in weights:
        weights[code] = weights[code] / total_usd

    cal_dates = [date.fromisoformat(d) for d in calendar]
    if not cal_dates:
        return []

    base_close: dict[str, float | None] = {}
    for code, m in closes_by_code.items():
        anchor = next((d for d in cal_dates if d in m), None)
        base_close[code] = m.get(anchor) if anchor else None

    last_known: dict[str, float | None] = {code: base_close[code] for code in closes_by_code}

    out: list[SeriesPoint] = []
    for d in cal_dates:
        port_pct = 0.0
        any_data = False
        for code, m in closes_by_code.items():
            if d in m:
                last_known[code] = m[d]
            base = base_close.get(code)
            cur = last_known.get(code)
            if base in (None, 0) or cur is None:
                continue
            any_data = True
            pct_h = (cur - base) / base
            port_pct += weights.get(code, 0.0) * pct_h
        out.append(SeriesPoint(trade_date=d.isoformat(), pct=port_pct if any_data else 0.0))
    return out


def parse_symbols(raw: str | None) -> list[str]:
    if raw:
        out = [s.strip().upper() for s in raw.split(",") if s.strip()]
        if out:
            return out
    env = os.environ.get("MOOMOO_BENCHMARKS", "SPY")
    return [s.strip().upper() for s in env.split(",") if s.strip()] or ["SPY"]
