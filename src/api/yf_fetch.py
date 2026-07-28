"""Shared yfinance fetch scaffolding for the metric modules
(`fair_value`, `fundamentals`, `portfolio_metrics`).

Owns the two things those modules used to copy-paste:
  • the hard-timeout ThreadPoolExecutor wrapper around yfinance calls
    (`Ticker.info` and friends routinely hang on rate-limit)
  • the dual-TTL payload cache: 24h on populated payloads, 10min on
    empty markers so a rate-limited ticker isn't re-hammered but also
    isn't stuck empty for a day

Tables live in the shared DuckDB KV cache (`api.data.cache`).
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime, timedelta
from typing import Callable

from api.data import cache

log = logging.getLogger(__name__)

TTL_OK = timedelta(hours=24)
TTL_EMPTY = timedelta(minutes=10)


def load_cached(
    table: str, code: str, has_data: Callable[[dict], bool]
) -> dict | None:
    """Cached payload for `code`, or None on miss / expiry. Populated
    payloads live TTL_OK; empty markers only TTL_EMPTY."""
    row = cache.get(table, code, ttl=None)
    if row is None:
        return None
    payload, fetched_at = row
    ttl = TTL_OK if has_data(payload) else TTL_EMPTY
    if datetime.now() - fetched_at > ttl:
        return None
    return payload


def save_cached(table: str, code: str, payload: dict) -> None:
    cache.put(table, code, payload)


def fetch_with_timeout(work: Callable[[], dict], timeout_s: float, label: str) -> dict:
    """Run a yfinance pull with a hard timeout; {} on timeout/failure."""
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(work)
        try:
            return future.result(timeout=timeout_s)
        except FuturesTimeout:
            log.info("%s: yfinance timeout", label)
            return {}
        except Exception as exc:  # noqa: BLE001
            log.warning("%s: yfinance failed: %s", label, exc)
            return {}


def fetch_info_keys(
    symbol: str, keys: tuple[str, ...], timeout_s: float = 5.0, label: str = "yf"
) -> dict:
    """Pull a small slice of `Ticker.info` under a hard timeout."""
    import yfinance as yf

    def _work() -> dict:
        info = yf.Ticker(symbol).info or {}
        return {k: info.get(k) for k in keys}

    return fetch_with_timeout(_work, timeout_s, f"{label}:{symbol}")


def to_float(value) -> float | None:
    """Defensive float coercion: None / non-numeric / NaN / inf → None."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f
