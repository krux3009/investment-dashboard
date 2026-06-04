"""Shared fundamentals fetcher for the `/portfolio` Analysis axis sub-tabs
(Future / Past / Health). One yfinance pull per ticker covers all three:

  Future  — growth_estimates (stockTrend vs indexTrend, +1y),
            earnings_estimate.growth (+1y), revenue_estimate.growth (+1y)
  Past    — income_stmt annual Total Revenue + Net Income → 3y CAGR
  Health  — balance_sheet Total Debt / Stockholders Equity → debt-to-equity;
            Current Assets / Current Liabilities → current ratio

Same hard-timeout + DuckDB-cache shape as `fair_value.py`: a single
ThreadPoolExecutor worker pulls all five yfinance frames under one
timeout, results cached in `fundamentals_cache (code, payload_json,
fetched_at)` PK code, 24h TTL on populated rows / 10min on empty
markers. HK / SG tickers return mostly null frames → the frontend
greys out. Single-writer rule preserved via `prices._DB_LOCK`.

Dividends axis is NOT here — it reuses `dividends.py` /
`dividends_extended.py`, which already own the dividend cache.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta

from api.data import prices
from api.dividends import _to_yfinance_symbol
from api.holdings_payload import build_holdings_response
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)

_TTL_OK = timedelta(hours=24)
_TTL_EMPTY = timedelta(minutes=10)
# Five yfinance frames per ticker → a touch more headroom than fair_value's
# single .info call.
_FETCH_TIMEOUT_S = 14.0

# Payload keys persisted to the cache. Order documents the axes each feeds.
_PAYLOAD_KEYS = (
    # Future
    "fwd_eps_growth",     # earnings_estimate +1y `growth` (fraction, 0.20 = +20%)
    "fwd_rev_growth",     # revenue_estimate +1y `growth`
    "est_growth",         # growth_estimates +1y stockTrend (this stock)
    "index_growth",       # growth_estimates +1y indexTrend (S&P 500)
    # Past
    "rev_cagr_3y",        # 3y Total Revenue CAGR (fraction)
    "earnings_cagr_3y",   # 3y Net Income CAGR (fraction)
    # Health
    "debt_to_equity",     # Total Debt / Stockholders Equity (ratio)
    "current_ratio",      # Current Assets / Current Liabilities (ratio)
)


@dataclass(frozen=True)
class Fundamentals:
    code: str
    fwd_eps_growth: float | None = None
    fwd_rev_growth: float | None = None
    est_growth: float | None = None
    index_growth: float | None = None
    rev_cagr_3y: float | None = None
    earnings_cagr_3y: float | None = None
    debt_to_equity: float | None = None
    current_ratio: float | None = None

    @property
    def has_data(self) -> bool:
        return any(getattr(self, k) is not None for k in _PAYLOAD_KEYS)


# ── Cache ────────────────────────────────────────────────────────────────────


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS fundamentals_cache (
                code VARCHAR PRIMARY KEY,
                payload_json VARCHAR,
                fetched_at TIMESTAMP
            )
            """
        )


def _load_cached(code: str) -> Fundamentals | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT payload_json, fetched_at FROM fundamentals_cache WHERE code = ?",
            [code],
        ).fetchone()
    if not row:
        return None
    payload_json, fetched_at = row
    payload = json.loads(payload_json) if payload_json else {}
    has_data = any(payload.get(k) is not None for k in _PAYLOAD_KEYS)
    age = datetime.now() - fetched_at
    if has_data and age > _TTL_OK:
        return None
    if not has_data and age > _TTL_EMPTY:
        return None
    return Fundamentals(code=code, **{k: payload.get(k) for k in _PAYLOAD_KEYS})


def _save_cache(f: Fundamentals) -> None:
    _ensure_table()
    payload = json.dumps({k: getattr(f, k) for k in _PAYLOAD_KEYS})
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO fundamentals_cache VALUES (?, ?, ?)",
            [f.code, payload, datetime.now()],
        )


# ── yfinance extraction helpers ──────────────────────────────────────────────


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
        return None
    return f


def _cell(df, period: str, col: str) -> float | None:
    """Safe scalar lookup from a yfinance estimates frame indexed by
    period ('0q'/'+1q'/'0y'/'+1y'/'LTG')."""
    try:
        if df is None or period not in df.index or col not in df.columns:
            return None
        return _to_float(df.loc[period, col])
    except Exception:
        return None


def _cagr_row(income_df, row: str, years: int = 3) -> float | None:
    """N-year compound annual growth rate from an income-statement row.
    yfinance columns are newest-first; column 0 = latest FY, column N =
    the base year. Returns None unless BOTH endpoints are positive — a
    CAGR through a zero/negative endpoint is undefined (and a negative
    base to a fractional power yields a complex number, not a rate)."""
    try:
        if income_df is None or row not in income_df.index:
            return None
        cols = list(income_df.columns)
        if len(cols) <= years:
            years = len(cols) - 1
        if years < 1:
            return None
        latest = _to_float(income_df.loc[row, cols[0]])
        base = _to_float(income_df.loc[row, cols[years]])
        if latest is None or base is None or base <= 0 or latest <= 0:
            return None
        return (latest / base) ** (1.0 / years) - 1.0
    except Exception:
        return None


def _bs_latest(bs_df, row: str) -> float | None:
    """Latest-column value for a balance-sheet row (newest-first cols)."""
    try:
        if bs_df is None or row not in bs_df.index:
            return None
        return _to_float(bs_df.loc[row, bs_df.columns[0]])
    except Exception:
        return None


def _fetch(symbol: str) -> dict:
    import yfinance as yf

    def _work() -> dict:
        t = yf.Ticker(symbol)
        out: dict[str, float | None] = {k: None for k in _PAYLOAD_KEYS}

        try:
            ee = t.earnings_estimate
            out["fwd_eps_growth"] = _cell(ee, "+1y", "growth")
        except Exception as exc:  # noqa: BLE001
            log.debug("fundamentals: earnings_estimate %s: %s", symbol, exc)
        try:
            rv = t.revenue_estimate
            out["fwd_rev_growth"] = _cell(rv, "+1y", "growth")
        except Exception as exc:  # noqa: BLE001
            log.debug("fundamentals: revenue_estimate %s: %s", symbol, exc)
        try:
            ge = t.growth_estimates
            out["est_growth"] = _cell(ge, "+1y", "stockTrend")
            out["index_growth"] = _cell(ge, "+1y", "indexTrend")
        except Exception as exc:  # noqa: BLE001
            log.debug("fundamentals: growth_estimates %s: %s", symbol, exc)
        try:
            ist = t.income_stmt
            out["rev_cagr_3y"] = _cagr_row(ist, "Total Revenue")
            out["earnings_cagr_3y"] = _cagr_row(ist, "Net Income")
        except Exception as exc:  # noqa: BLE001
            log.debug("fundamentals: income_stmt %s: %s", symbol, exc)
        try:
            bs = t.balance_sheet
            debt = _bs_latest(bs, "Total Debt")
            equity = _bs_latest(bs, "Stockholders Equity")
            ca = _bs_latest(bs, "Current Assets")
            cl = _bs_latest(bs, "Current Liabilities")
            if debt is not None and equity is not None and equity > 0:
                out["debt_to_equity"] = debt / equity
            if ca is not None and cl is not None and cl > 0:
                out["current_ratio"] = ca / cl
        except Exception as exc:  # noqa: BLE001
            log.debug("fundamentals: balance_sheet %s: %s", symbol, exc)
        return out

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_work)
        try:
            return future.result(timeout=_FETCH_TIMEOUT_S)
        except FuturesTimeout:
            log.info("fundamentals: yfinance timeout for %s", symbol)
            return {}
        except Exception as exc:  # noqa: BLE001
            log.warning("fundamentals: yfinance failed for %s: %s", symbol, exc)
            return {}


def get_fundamentals(code: str) -> Fundamentals:
    cached = _load_cached(code)
    if cached is not None:
        return cached
    symbol = _to_yfinance_symbol(code)
    if symbol is None:
        f = Fundamentals(code=code)
        _save_cache(f)
        return f
    raw = _fetch(symbol)
    f = Fundamentals(code=code, **{k: raw.get(k) for k in _PAYLOAD_KEYS})
    _save_cache(f)
    return f


# ── Portfolio aggregation ────────────────────────────────────────────────────


def _weighted(attr: str, *, clamp_max: float | None = None) -> dict:
    """USD-weighted portfolio average of a Fundamentals attribute among
    holdings that carry a usable value. Returns the weighted figure, a
    per-holding breakdown, and coverage counts. Mirrors fair_value's
    `_weighted_metric` shape so the frontend gauges/bars reuse cleanly.
    """
    summary = get_summary()
    response = build_holdings_response(summary)
    weighted = 0.0
    weight_sum = 0.0
    excluded = 0
    per_holding: list[dict] = []
    for h in response.holdings:
        f = get_fundamentals(h.code)
        value = getattr(f, attr)
        usable = value is not None and (clamp_max is None or value <= clamp_max)
        per_holding.append({
            "code": h.code,
            "ticker": h.ticker,
            "name": h.name,
            "value": value if usable else None,
            "weight_pct": None,  # filled below once total weight known
        })
        if usable:
            mv = h.market_value_usd or 0.0
            weighted += value * mv
            weight_sum += mv
        else:
            excluded += 1
    if weight_sum > 0:
        for row, h in zip(per_holding, response.holdings):
            if row["value"] is not None:
                row["weight_pct"] = (h.market_value_usd or 0.0) / weight_sum * 100.0
    return {
        "portfolio": (weighted / weight_sum) if weight_sum > 0 else None,
        "per_holding": per_holding,
        "covered_count": len(response.holdings) - excluded,
        "total_count": len(response.holdings),
    }


def _index_growth_ref() -> float | None:
    """The S&P 500 +1y growth estimate (same value across tickers; take
    the first non-null) for the Future gauge's market reference."""
    summary = get_summary()
    response = build_holdings_response(summary)
    for h in response.holdings:
        f = get_fundamentals(h.code)
        if f.index_growth is not None:
            return f.index_growth
    return None


def get_future() -> dict:
    """Portfolio forward-growth vs the index + per-holding EPS/revenue
    growth. EPS drives the headline gauge; revenue rides alongside."""
    eps = _weighted("fwd_eps_growth", clamp_max=3.0)
    rev = _weighted("fwd_rev_growth", clamp_max=3.0)
    rev_by_code = {r["code"]: r["value"] for r in rev["per_holding"]}
    for row in eps["per_holding"]:
        row["rev_growth"] = rev_by_code.get(row["code"])
        row["eps_growth"] = row.pop("value")
    return {
        "portfolio_eps_growth": eps["portfolio"],
        "portfolio_rev_growth": rev["portfolio"],
        "index_growth": _index_growth_ref(),
        "per_holding": eps["per_holding"],
        "covered_count": eps["covered_count"],
        "total_count": eps["total_count"],
    }


def get_past() -> dict:
    """Portfolio 3y revenue + earnings CAGR + per-holding breakdown."""
    rev = _weighted("rev_cagr_3y", clamp_max=5.0)
    earn = _weighted("earnings_cagr_3y", clamp_max=10.0)
    earn_by_code = {r["code"]: r["value"] for r in earn["per_holding"]}
    for row in rev["per_holding"]:
        row["earnings_cagr"] = earn_by_code.get(row["code"])
        row["rev_cagr"] = row.pop("value")
    return {
        "portfolio_rev_cagr": rev["portfolio"],
        "portfolio_earnings_cagr": earn["portfolio"],
        "per_holding": rev["per_holding"],
        "covered_count": rev["covered_count"],
        "total_count": rev["total_count"],
    }


def get_health() -> dict:
    """Portfolio weighted debt-to-equity + current ratio + per-holding."""
    de = _weighted("debt_to_equity", clamp_max=20.0)
    cr = _weighted("current_ratio", clamp_max=20.0)
    cr_by_code = {r["code"]: r["value"] for r in cr["per_holding"]}
    for row in de["per_holding"]:
        row["current_ratio"] = cr_by_code.get(row["code"])
        row["debt_to_equity"] = row.pop("value")
    return {
        "portfolio_debt_to_equity": de["portfolio"],
        "portfolio_current_ratio": cr["portfolio"],
        "per_holding": de["per_holding"],
        "covered_count": de["covered_count"],
        "total_count": de["total_count"],
    }
