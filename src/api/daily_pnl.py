"""Daily net P&L aggregator for the /portfolio?tab=calendar surface.

Combines two streams per ISO date in the requested window:
  • M2M Δ — close-to-close change of the held book, USD-aggregated.
  • Dividends paid — ex-date payouts per current holding (yfinance-sourced).

Two patterns are reused verbatim:
  • "Current weights projected backward" — same as benchmark.portfolio_series.
    Quantities come from `moomoo_client.get_summary()` (current snapshot).
  • "Today's FX rate applied retroactively" — same as dividends._build_holding.
    A historical FX cache is deferred; spot is honest for the SGD/USD pair
    at month scale.

Trading days emerge naturally from `prices.get_history` (no bar → skipped).
No NYSE-calendar coupling needed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date

import pandas as pd

from api import dividends, fx
from api.data import prices
from api.data.moomoo_client import get_summary

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class DailyPnlEntry:
    date: str           # ISO trading day
    pnl_usd: float      # M2M Δ + dividends paid that day
    pnl_pct: float      # pnl_usd / prior-close portfolio value
    value_usd: float    # close-of-day portfolio value (M2M only)


def _iso(d: object) -> str:
    """Coerce a DuckDB-returned date/datetime into an ISO date string."""
    if isinstance(d, pd.Timestamp):
        return d.strftime("%Y-%m-%d")
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


def compute_daily_pnl(start: date, end: date) -> list[DailyPnlEntry]:
    summary = get_summary()
    if not summary.positions:
        return []

    fx_rates: dict[str, float] = {}
    for p in summary.positions:
        ccy = (p.currency or "USD").upper()
        if ccy in fx_rates:
            continue
        rate, _ = fx.convert(1.0, ccy, "USD")
        fx_rates[ccy] = rate

    # Pad backward to absorb weekend lag on the leading edge.
    today = date.today()
    horizon_days = max((today - start).days + 5, 35)
    closes_by_code: dict[str, dict[str, float]] = {}
    for p in summary.positions:
        df = prices.get_history(p.code, days=horizon_days)
        if df.empty:
            continue
        per_date: dict[str, float] = {}
        for row in df.itertuples():
            iso = _iso(row.date)
            close = float(row.close) if row.close is not None else 0.0
            if close > 0:
                per_date[iso] = close
        if per_date:
            closes_by_code[p.code] = per_date

    if not closes_by_code:
        return []

    qty_by_code = {p.code: p.qty for p in summary.positions}
    ccy_by_code = {p.code: (p.currency or "USD").upper() for p in summary.positions}

    start_iso = start.isoformat()
    # Cap `end` at the prior trading day. Today's cell is rendered live on
    # the frontend via useLiveTotals; mid-session bars from a partial set of
    # holdings would produce a misleading close-based Δ.
    today_iso = today.isoformat()
    end_iso = min(end.isoformat(), (date.fromisoformat(today_iso) - pd.Timedelta(days=1)).strftime("%Y-%m-%d"))

    # Per-holding consecutive-day Δ avoids the "missing bar on one code"
    # bug that would collapse total portfolio value on a date some codes
    # lack a bar for. We accumulate Δ_usd per ISO date across the book.
    pnl_by_date: dict[str, float] = {}
    value_by_date: dict[str, float] = {}
    for code, per_date in closes_by_code.items():
        dates_sorted = sorted(per_date)
        rate = fx_rates.get(ccy_by_code[code], 1.0)
        qty = qty_by_code[code]
        for i in range(1, len(dates_sorted)):
            d = dates_sorted[i]
            if d < start_iso or d > end_iso:
                continue
            prev = dates_sorted[i - 1]
            delta_native = per_date[d] - per_date[prev]
            pnl_by_date[d] = pnl_by_date.get(d, 0.0) + delta_native * qty * rate
        # Portfolio value at each date (close × qty × fx) for value_usd field.
        for d, c in per_date.items():
            if start_iso <= d <= end_iso:
                value_by_date[d] = value_by_date.get(d, 0.0) + c * qty * rate

    div_usd_by_date = dividends.get_payments_between(start, end)
    for d, usd in div_usd_by_date.items():
        if start_iso <= d <= end_iso:
            pnl_by_date[d] = pnl_by_date.get(d, 0.0) + usd

    # pct: pnl_usd / prior-day portfolio value (book-wide). Approximate the
    # prior-day book value as (today's value - today's M2M leg), which gives
    # the previous close even when codes have differing trading days.
    out: list[DailyPnlEntry] = []
    for d in sorted(pnl_by_date):
        pnl = pnl_by_date[d]
        cur_v = value_by_date.get(d, 0.0)
        # Strip dividends from "today's M2M" so the prior-close base is honest.
        m2m_only = pnl - div_usd_by_date.get(d, 0.0)
        prior_v = cur_v - m2m_only
        pct = (pnl / prior_v) if prior_v > 0 else 0.0
        out.append(
            DailyPnlEntry(
                date=d,
                pnl_usd=pnl,
                pnl_pct=pct,
                value_usd=cur_v,
            )
        )
    return out
