"""Fair-value + valuation-gauge aggregator for `/portfolio` Analysis tab.

Same hard-timeout pattern as `portfolio_metrics.py` since both modules
hit `Ticker.info`. Pulls four fields per holding:

  forwardPE                          — for /pe-vs-market gauge
  priceToSalesTrailing12Months       — for /ps-vs-market gauge
  pegRatio                           — for /peg-vs-market gauge
  targetMeanPrice                    — for /valuation cash-flow-value

HK / SG tickers return mostly null `.info` — frontend gauges grey out
on null. Market reference defaults to SPY's forwardPE (refreshed once
per 24h alongside holdings).

Cache: `fair_value_cache (code, payload_json, fetched_at)` PK code,
24h TTL on populated rows, 10min TTL on empty markers.
"""

from __future__ import annotations

import json
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from dataclasses import dataclass
from datetime import datetime, timedelta

from api import fx
from api.data import prices
from api.data.moomoo_client import get_summary
from api.dividends import _to_yfinance_symbol
from api.holdings_payload import build_holdings_response

log = logging.getLogger(__name__)

_TTL_OK = timedelta(hours=24)
_TTL_EMPTY = timedelta(minutes=10)
_INFO_TIMEOUT_S = 5.0

_INFO_KEYS = ("forwardPE", "priceToSalesTrailing12Months", "pegRatio", "targetMeanPrice")


@dataclass(frozen=True)
class ValuationMetrics:
    code: str
    forward_pe: float | None
    price_to_sales: float | None
    peg: float | None
    target_mean_price: float | None


def _ensure_table() -> None:
    with prices._DB_LOCK:
        prices._db().execute(
            """
            CREATE TABLE IF NOT EXISTS fair_value_cache (
                code VARCHAR PRIMARY KEY,
                payload_json VARCHAR,
                fetched_at TIMESTAMP
            )
            """
        )


def _load_cached(code: str) -> ValuationMetrics | None:
    _ensure_table()
    with prices._DB_LOCK:
        row = prices._db().execute(
            "SELECT payload_json, fetched_at FROM fair_value_cache WHERE code = ?",
            [code],
        ).fetchone()
    if not row:
        return None
    payload_json, fetched_at = row
    payload = json.loads(payload_json) if payload_json else {}
    has_data = any(payload.get(k) is not None for k in _INFO_KEYS)
    age = datetime.now() - fetched_at
    if has_data and age > _TTL_OK:
        return None
    if not has_data and age > _TTL_EMPTY:
        return None
    return ValuationMetrics(
        code=code,
        forward_pe=payload.get("forwardPE"),
        price_to_sales=payload.get("priceToSalesTrailing12Months"),
        peg=payload.get("pegRatio"),
        target_mean_price=payload.get("targetMeanPrice"),
    )


def _save_cache(metrics: ValuationMetrics) -> None:
    _ensure_table()
    payload = json.dumps({
        "forwardPE": metrics.forward_pe,
        "priceToSalesTrailing12Months": metrics.price_to_sales,
        "pegRatio": metrics.peg,
        "targetMeanPrice": metrics.target_mean_price,
    })
    with prices._DB_LOCK:
        prices._db().execute(
            "INSERT OR REPLACE INTO fair_value_cache VALUES (?, ?, ?)",
            [metrics.code, payload, datetime.now()],
        )


def _fetch_info(symbol: str) -> dict:
    import yfinance as yf

    def _work() -> dict:
        info = yf.Ticker(symbol).info or {}
        return {k: info.get(k) for k in _INFO_KEYS}

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_work)
        try:
            return future.result(timeout=_INFO_TIMEOUT_S)
        except FuturesTimeout:
            log.info("fair_value: Ticker.info timeout for %s", symbol)
            return {}
        except Exception as exc:
            log.warning("fair_value: Ticker.info failed for %s: %s", symbol, exc)
            return {}


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def get_metrics(code: str) -> ValuationMetrics:
    cached = _load_cached(code)
    if cached is not None:
        return cached
    symbol = _to_yfinance_symbol(code)
    if symbol is None:
        metrics = ValuationMetrics(code=code, forward_pe=None, price_to_sales=None, peg=None, target_mean_price=None)
        _save_cache(metrics)
        return metrics
    info = _fetch_info(symbol)
    metrics = ValuationMetrics(
        code=code,
        forward_pe=_to_float(info.get("forwardPE")),
        price_to_sales=_to_float(info.get("priceToSalesTrailing12Months")),
        peg=_to_float(info.get("pegRatio")),
        target_mean_price=_to_float(info.get("targetMeanPrice")),
    )
    _save_cache(metrics)
    return metrics


def _market_pe_fallback() -> float:
    """SPY forwardPE if reachable, else a sensible historical median."""
    cached = _load_cached("US.SPY")
    if cached and cached.forward_pe is not None:
        return cached.forward_pe
    metrics = get_metrics("US.SPY")
    return metrics.forward_pe if metrics.forward_pe is not None else 18.4


def get_valuation() -> dict:
    """Sum of analyst price targets vs. current portfolio value."""
    summary = get_summary()
    response = build_holdings_response(summary)
    pos_by_code = {p.code: p for p in summary.positions}

    per_holding: list[dict] = []
    cash_flow_value = 0.0
    total_value = response.total_market_value_usd

    for h in response.holdings:
        pos = pos_by_code.get(h.code)
        if pos is None:
            continue
        metrics = get_metrics(h.code)
        current_usd = h.market_value_usd or 0.0
        fair_usd: float | None
        pct_diff: float | None
        if metrics.target_mean_price is not None and metrics.target_mean_price > 0:
            fair_native = metrics.target_mean_price * pos.qty
            fair_usd, _ = fx.convert(fair_native, pos.currency, "USD")
            cash_flow_value += fair_usd
            pct_diff = (
                (current_usd - fair_usd) / fair_usd * 100.0 if fair_usd > 0 else None
            )
        else:
            fair_usd = None
            pct_diff = None
        per_holding.append({
            "code": h.code,
            "ticker": h.ticker,
            "current_usd": current_usd,
            "fair_usd": fair_usd,
            "pct_diff": pct_diff,
        })

    pct_diff_total = (
        (total_value - cash_flow_value) / cash_flow_value * 100.0
        if cash_flow_value > 0 else None
    )

    return {
        "cash_flow_value_usd": cash_flow_value,
        "total_value_usd": total_value,
        "pct_diff": pct_diff_total,
        "per_holding": per_holding,
        "coverage_count": sum(1 for h in per_holding if h["fair_usd"] is not None),
        "total_count": len(per_holding),
    }


def _weighted_metric(metric_attr: str, scale_max: float) -> dict:
    """Shared helper for PE / PS / PEG gauges. Weights by USD market value
    among holdings with a usable metric value.
    """
    summary = get_summary()
    response = build_holdings_response(summary)
    weighted = 0.0
    weight_sum = 0.0
    excluded = 0
    for h in response.holdings:
        metrics = get_metrics(h.code)
        value = getattr(metrics, metric_attr)
        if value is None or value <= 0 or value > scale_max:
            excluded += 1
            continue
        weighted += value * (h.market_value_usd or 0.0)
        weight_sum += (h.market_value_usd or 0.0)
    portfolio_value = (weighted / weight_sum) if weight_sum > 0 else None
    return {
        "portfolio": portfolio_value,
        "scale_max": scale_max,
        "excluded_count": excluded,
        "total_count": len(response.holdings),
    }


def get_pe_vs_market() -> dict:
    out = _weighted_metric("forward_pe", scale_max=60.0)
    out["market"] = _market_pe_fallback()
    out["label"] = "Price to Earnings"
    return out


def get_ps_vs_market() -> dict:
    out = _weighted_metric("price_to_sales", scale_max=20.0)
    out["market"] = 2.5  # historical SPY ~2.5x. Refresh path TBD.
    out["label"] = "Price to Sales"
    return out


def get_peg_vs_market() -> dict:
    out = _weighted_metric("peg", scale_max=5.0)
    out["market"] = 1.5
    out["label"] = "Price to Expected Growth"
    return out
